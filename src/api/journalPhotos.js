import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Uploads/deletes journal-entry photos shared with friends. An entry made
 * through MomentsEditor can carry several photos (one per moment), so
 * `momentId` distinguishes each one's Storage path - omit it for the older
 * flat single-photo entry shape (App.js's toggleEntryPhotoShare, kept for
 * entries made before the moments rewrite) so those existing paths keep
 * resolving unchanged.
 *
 * Sharing now defaults ON at compose time (user decision: "the whole point
 * is connecting with your close friends... if people want to opt out, they
 * should have the option as they're writing") rather than the old
 * opt-in-after-the-fact model - see App.js's addJournalEntry/
 * addAtTheTableEntry for where this actually gets called now. A photo
 * stays purely local (never synced) until this upload is called; delete
 * actually removes the remote copy rather than just hiding it client-side -
 * the Firestore journal mirror only ever contains a photo URL for entries
 * currently marked shared, so a friend querying Firestore directly can't
 * see a photo that's been unshared.
 */

function photoPath(uid, entryId, momentId) {
  return momentId
    ? `journalPhotos/${uid}/${entryId}_${momentId}.jpg`
    : `journalPhotos/${uid}/${entryId}.jpg`;
}

/** Uploads a local photo URI and returns its public download URL. */
export async function uploadJournalPhoto(uid, entryId, localUri, momentId) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, photoPath(uid, entryId, momentId));
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/** Removes a previously-shared photo from Storage. Best-effort. */
export async function deleteJournalPhoto(uid, entryId, momentId) {
  try {
    await deleteObject(ref(storage, photoPath(uid, entryId, momentId)));
  } catch (e) {
    // Already gone, or never actually uploaded - either way there's nothing
    // left to clean up, so this isn't a failure worth surfacing.
    console.warn('journal photo delete skipped', e);
  }
}
