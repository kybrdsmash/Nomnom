import { doc, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Mirrors a device's local food journal (src/storage.js's journal/
 * loadJournal/saveJournal) up to Firestore so mutual friends (people on the
 * local `friends` list, built from completed friend-spin sessions) can see
 * it - one doc per user, not a subcollection, since a personal restaurant
 * journal is small (tens/hundreds of entries) and this keeps sync + security
 * rules trivial. `friendUids` is denormalized onto the doc itself so the
 * Firestore rule can check membership without an extra get():
 *
 *   match /journals/{uid} {
 *     allow read: if request.auth != null && (request.auth.uid == uid || request.auth.uid in resource.data.friendUids);
 *     allow write: if request.auth != null && request.auth.uid == uid;
 *   }
 *
 * Both calls are best-effort and swallow errors, same philosophy as
 * storage.js - a failed sync/fetch just means journal sharing is stale or
 * unavailable, never a crash.
 */

export async function pushJournal(uid, entries, friendUids) {
  if (!uid) return;
  try {
    // friendUids merges in (arrayUnion), never overwrites - functions/
    // index.js's onNewUserCreated also appends to this SAME array
    // server-side (every new app user gets auto-added as a friend of the
    // developer's own account, so they see its journal by default). A
    // plain overwrite here would silently wipe every uid that function
    // added back out the next time this device's own journal changes,
    // since this always runs with only this device's OWN local `friends`
    // list - there's still no "unfriend" anywhere in this app, so an
    // ever-growing set is consistent with the rest of this feature, not a
    // new asymmetry. arrayUnion() with zero arguments throws, so a
    // friendless device just writes `entries` and leaves friendUids as-is.
    const update = friendUids?.length > 0 ? { entries, friendUids: arrayUnion(...friendUids) } : { entries };
    await setDoc(doc(db, 'journals', uid), update, { merge: true });
  } catch (e) {
    console.warn('journal push failed', e);
  }
}

export async function fetchFriendJournal(friendUid) {
  try {
    const snap = await getDoc(doc(db, 'journals', friendUid));
    return snap.exists() ? (snap.data().entries || {}) : {};
  } catch (e) {
    console.warn('journal fetch failed', friendUid, e);
    return {};
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
