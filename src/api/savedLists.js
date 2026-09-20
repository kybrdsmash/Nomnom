import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Syncs Favorites/History/Try Later/fave cuisine slots to Firestore, same
 * one-doc-per-user shape as journal.js's own pushJournal/fetchFriendJournal -
 * this was the missing half of what GoogleSignInRow.js already promises
 * ("Keeps your favorites, journal, and history saved to your account") -
 * only Journal actually did that; these three never left the device at all
 * (user report: "I don't want to have to keep re-adding info... this should
 * be able to be transferred between phones").
 *
 * Deliberately its own doc (savedLists/{uid}), not folded into users/{uid}
 * (which already holds the push token) or journals/{uid} (which is also
 * readable by friends, via journal.js's friendUids rule - these lists are
 * private, no reason to share that read access).
 */
export async function pushSavedLists(uid, { favorites, history, tryLater, faveCuisines }) {
  if (!uid) return;
  try {
    await setDoc(doc(db, 'savedLists', uid), { favorites, history, tryLater, faveCuisines });
  } catch (e) {
    console.warn('saved lists push failed', e);
  }
}

export async function fetchSavedLists(uid) {
  try {
    const snap = await getDoc(doc(db, 'savedLists', uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('saved lists fetch failed', e);
    return null;
  }
}

/**
 * Union by id, local entries first (so local ordering/recency wins ties),
 * then any remote-only entries appended - never silently drops something
 * local just because a sync pulled in a different device's copy. Used for
 * favorites/tryLater/history, all plain arrays of spot-shaped objects.
 */
export function mergeById(local, remote, maxLength) {
  const localArr = local || [];
  const remoteArr = remote || [];
  const seen = new Set(localArr.map((s) => s.id));
  const merged = [...localArr, ...remoteArr.filter((s) => s && !seen.has(s.id))];
  return maxLength ? merged.slice(0, maxLength) : merged;
}

/**
 * faveCuisines is 3 fixed-index slots, not an id-keyed list - merges
 * per-slot instead: an empty local slot (nothing saved into it on THIS
 * device yet) accepts the remote copy; a local slot that already has real
 * content wins outright rather than being overwritten by a sync, since the
 * user actively saving something on this device is a stronger signal than
 * a background merge should override.
 */
export function mergeFaveCuisines(local, remote) {
  if (!remote || !Array.isArray(remote)) return local;
  return local.map((slot, i) => {
    const localHasContent = slot?.cuisines?.length > 0;
    if (localHasContent) return slot;
    const remoteSlot = remote[i];
    return remoteSlot?.cuisines?.length > 0 ? remoteSlot : slot;
  });
}
