import {
  collection, doc, getDoc, getDocs, setDoc, query, where, orderBy, limit, startAfter,
  writeBatch, arrayUnion, deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  loadJournalSyncSigs, saveJournalSyncSigs, loadJournalSchema2Migrated, saveJournalSchema2Migrated,
} from '../storage';

/**
 * Mirrors a device's local food journal (src/storage.js's journal/
 * loadJournal/saveJournal) up to Firestore so mutual friends (people on the
 * local `friends` list, built from completed friend-spin sessions) can see
 * it.
 *
 * SHAPE (schema 2): one small document PER ENTRY at
 * journals/{uid}/entries/{entryId}, plus a parent doc journals/{uid} that
 * only holds `friendUids` (denormalized so the security rule can check
 * membership) and `schema: 2`. The original shape - every entry in one
 * `entries` map on the parent doc - hit Firestore's 1 MiB document cap
 * somewhere around 400-800 reviews, at which point writes silently failed
 * and sharing just stopped. Per-entry docs have no practical ceiling, and
 * let a friend's journal be read a page at a time instead of all at once.
 *
 * Rules (firestore.rules in this repo):
 *   match /journals/{uid}/entries/{entryId} {
 *     allow read: if request.auth != null && (request.auth.uid == uid
 *       || request.auth.uid in get(/databases/$(database)/documents/journals/$(uid)).data.friendUids);
 *     allow write: if request.auth != null && request.auth.uid == uid;
 *   }
 *
 * Everything here is best-effort and swallows errors, same philosophy as
 * storage.js - a failed sync/fetch just means journal sharing is stale or
 * unavailable, never a crash.
 *
 * BACKWARD COMPAT: a friend still on an older app build reads the old
 * `entries` map on the parent doc, which this version removes once it has
 * moved everything into per-entry docs - so that friend sees an empty
 * journal from you until they update. Going the other way, this version
 * falls back to the old map for any friend who hasn't migrated yet.
 */

export const FRIEND_PAGE_SIZE = 30;
const BATCH_LIMIT = 400; // Firestore caps a batch at 500 writes.

const entriesCol = (uid) => collection(db, 'journals', uid, 'entries');
const parentRef = (uid) => doc(db, 'journals', uid);

// Only what a list row / detail view actually renders - drops anything
// else a spot object picked up along the way (cuisine-search tags, caches).
const SPOT_KEYS = ['id', 'name', 'rating', 'reviewCount', 'type', 'blurb', 'priceLevel', 'address', 'photoUrl', 'lat', 'lng'];
export function trimSpot(spot) {
  const out = {};
  SPOT_KEYS.forEach((k) => { if (spot?.[k] !== undefined) out[k] = spot[k]; });
  return out;
}

// JSON round-trip also strips `undefined` fields, which Firestore rejects
// (an unrated At the Table entry has `rating: undefined`).
function toEntryDoc(placeId, entry) {
  return JSON.parse(JSON.stringify({ ...entry, placeId, spot: trimSpot(entry.spot) }));
}

// djb2 - a short signature of exactly what was written, so unchanged
// entries are skipped on later pushes.
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `${str.length}:${h}`;
}

// Legacy (schema 1) parent docs, cached per uid for this app session so a
// friend who hasn't migrated costs one extra read, not one per query.
const legacyCache = new Map();
async function readParent(uid) {
  if (legacyCache.has(uid)) return legacyCache.get(uid);
  let data = null;
  try {
    const snap = await getDoc(parentRef(uid));
    data = snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('journal parent read failed', uid, e);
  }
  legacyCache.set(uid, data);
  return data;
}

// Commits ops BATCH_LIMIT at a time. `onBatchDone(slice)` fires after each
// successful batch so callers can record progress - a failure partway
// through then only retries what didn't land.
async function commitInBatches(ops, onBatchDone) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const slice = ops.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    slice.forEach((op) => {
      if (op.type === 'set') batch.set(op.ref, op.data);
      else batch.delete(op.ref);
    });
    await batch.commit();
    onBatchDone?.(slice);
  }
}

/**
 * One-time (per device) move off the old single-document journal: any entry
 * that exists ONLY in the old `entries` map (written by another device,
 * never seen here) is copied into per-entry docs first, and only then is
 * the old map removed from the parent doc. Throws (leaving the old map
 * untouched) if any copy fails.
 */
async function ensureMigrated(uid, localIds) {
  if (await loadJournalSchema2Migrated()) return;
  const snap = await getDoc(parentRef(uid));
  const legacy = snap.exists() ? snap.data().entries : null;
  if (legacy && Object.keys(legacy).length > 0) {
    const ops = [];
    Object.entries(legacy).forEach(([placeId, list]) => {
      (list || []).forEach((e) => {
        if (!e?.id || localIds.has(e.id)) return; // the local push writes these
        ops.push({ type: 'set', ref: doc(entriesCol(uid), e.id), data: toEntryDoc(placeId, e) });
      });
    });
    await commitInBatches(ops);
  }
  await setDoc(parentRef(uid), { schema: 2, entries: deleteField() }, { merge: true });
  await saveJournalSchema2Migrated(true);
  legacyCache.delete(uid);
}

let lastFriendKey = null;

/**
 * Pushes only what changed since last time: new/edited entries are written,
 * entries deleted locally are deleted remotely. `journal` is the usual
 * { [placeId]: [entry...] } (already stripped of local-only fields and
 * dev-seeded fakes by the caller).
 */
export async function pushJournal(uid, journal, friendUids) {
  if (!uid) return;
  let current = null;
  try {
    const localIds = new Set(Object.values(journal || {}).flat().map((e) => e.id));
    await ensureMigrated(uid, localIds);

    const prevSigs = await loadJournalSyncSigs();
    current = { ...prevSigs };
    const nextSigs = {};
    const writes = [];
    Object.entries(journal || {}).forEach(([placeId, entries]) => {
      (entries || []).forEach((e) => {
        if (!e?.id) return;
        const data = toEntryDoc(placeId, e);
        const sig = hashString(JSON.stringify(data));
        nextSigs[e.id] = sig;
        if (prevSigs[e.id] !== sig) writes.push({ type: 'set', id: e.id, sig, ref: doc(entriesCol(uid), e.id), data });
      });
    });
    const deletes = Object.keys(prevSigs)
      .filter((id) => !(id in nextSigs))
      .map((id) => ({ type: 'delete', id, ref: doc(entriesCol(uid), id) }));

    const ops = [...writes, ...deletes];
    await commitInBatches(ops, (slice) => {
      slice.forEach((op) => {
        if (op.type === 'set') current[op.id] = op.sig;
        else delete current[op.id];
      });
    });

    // friendUids merges in (arrayUnion), never overwrites - functions/
    // index.js's onNewUserCreated also appends to this SAME array
    // server-side (every new app user gets auto-added as a friend of the
    // developer's own account, so they see its journal by default). A
    // plain overwrite here would silently wipe every uid that function
    // added. arrayUnion() with zero arguments throws, so a friendless
    // device just skips the field.
    const friendKey = (friendUids || []).slice().sort().join(',');
    if (ops.length > 0 || friendKey !== lastFriendKey) {
      await setDoc(
        parentRef(uid),
        friendUids?.length > 0 ? { schema: 2, friendUids: arrayUnion(...friendUids) } : { schema: 2 },
        { merge: true },
      );
      lastFriendKey = friendKey;
    }
  } catch (e) {
    console.warn('journal push failed', e);
  } finally {
    if (current) saveJournalSyncSigs(current);
  }
}

function groupByPlace(entries) {
  const out = {};
  entries.forEach((e) => {
    const placeId = e.placeId || e.spot?.id;
    if (!placeId) return;
    const { placeId: _drop, ...rest } = e;
    (out[placeId] = out[placeId] || []).push(rest);
  });
  Object.values(out).forEach((list) => list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
  return out;
}

/**
 * Restores YOUR OWN journal from Firestore as { [placeId]: [entry...] }.
 * `since` (ms) limits it to entries updated after that moment - an
 * established device only needs what another device added since, not a
 * full re-download (one read per entry) on every launch. Pass 0 on a fresh
 * install. Falls back to the old single-document journal for an account
 * that hasn't been migrated yet.
 */
export async function fetchMyJournal(uid, since = 0) {
  try {
    const q = since > 0
      ? query(entriesCol(uid), where('updatedAt', '>', since))
      : query(entriesCol(uid));
    const snap = await getDocs(q);
    if (!snap.empty) return groupByPlace(snap.docs.map((d) => d.data()));
    if (since > 0) return {};
    const parent = await readParent(uid);
    return parent?.entries || {};
  } catch (e) {
    // Most likely the per-entry rules aren't live yet (or a transient
    // network error): the old single-document journal still works.
    console.warn('journal restore failed, trying legacy document', e);
    return (await readParent(uid))?.entries || {};
  }
}

/**
 * A friend's most recent entries, newest first, one page at a time (users
 * with long journals no longer cost a full download on every open).
 * `after` is the previous page's `cursor` (the last entry's updatedAt).
 * Returns { entries, cursor, hasMore }.
 */
export async function fetchFriendRecentEntries(friendUid, { pageSize = FRIEND_PAGE_SIZE, after = null } = {}) {
  try {
    const constraints = [orderBy('updatedAt', 'desc')];
    if (after != null) constraints.push(startAfter(after));
    constraints.push(limit(pageSize));
    const snap = await getDocs(query(entriesCol(friendUid), ...constraints));
    if (!snap.empty) {
      const entries = snap.docs.map((d) => d.data());
      return { entries, cursor: entries[entries.length - 1].updatedAt, hasMore: entries.length === pageSize };
    }
    if (after != null) return { entries: [], cursor: after, hasMore: false };
    // Empty first page: either a genuinely empty journal, or a friend who
    // hasn't migrated off the old single-document shape yet.
    const parent = await readParent(friendUid);
    if (parent?.entries) {
      const all = Object.values(parent.entries).flat().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return { entries: all.slice(0, pageSize), cursor: null, hasMore: false };
    }
    return { entries: [], cursor: null, hasMore: false };
  } catch (e) {
    console.warn('journal fetch failed, trying legacy document', friendUid, e);
    if (after != null) return { entries: [], cursor: after, hasMore: false };
    const parent = await readParent(friendUid);
    const all = Object.values(parent?.entries || {}).flat().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { entries: all.slice(0, pageSize), cursor: null, hasMore: false };
  }
}

/** A friend's entries for ONE place, newest first (DetailModal's "Friends' Feedback"). */
export async function fetchFriendEntriesForPlace(friendUid, placeId) {
  try {
    const snap = await getDocs(query(entriesCol(friendUid), where('placeId', '==', placeId)));
    if (!snap.empty) {
      return snap.docs.map((d) => d.data()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    const parent = await readParent(friendUid);
    return parent?.entries?.[placeId] || [];
  } catch (e) {
    console.warn('journal place fetch failed, trying legacy document', friendUid, e);
    return (await readParent(friendUid))?.entries?.[placeId] || [];
  }
}

/**
 * Union by entry id, local-first - same reasoning as savedLists.js's
 * mergeById, just per-placeId instead of one flat array (journal is keyed
 * by placeId -> that spot's own entries). Fixes a real gap: pushJournal
 * mirrors entries UP to Firestore on every change, but until this existed
 * nothing ever pulled them back DOWN on a fresh sign-in/reinstall - unlike
 * favorites/history/tryLater (see savedLists.js), a journal written on one
 * device never actually came back on another (user report: "i have a few
 * reviews written as well - journal entries - are those there?" - they
 * were pushed, but there was no restore path to prove it).
 */
export function mergeJournal(local, remote) {
  if (!remote) return local || {};
  const merged = { ...(local || {}) };
  for (const placeId of Object.keys(remote)) {
    const localEntries = merged[placeId] || [];
    const remoteEntries = remote[placeId] || [];
    const seen = new Set(localEntries.map((e) => e.id));
    merged[placeId] = [...localEntries, ...remoteEntries.filter((e) => e && !seen.has(e.id))];
  }
  return merged;
}
