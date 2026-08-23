import { doc, setDoc, getDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'journals', uid), { entries, friendUids });
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
