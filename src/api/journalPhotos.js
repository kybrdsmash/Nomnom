import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Uploads/deletes journal-entry photos a user has explicitly opted to share
 * with friends - see App.js's toggleEntryPhotoShare. Deliberately opt-in per
 * photo: a photo attached to a journal entry (DetailModal.js) stays purely
 * local (entry.photoUri, never synced) until this upload is called, and
 * deleteJournalPhoto actually removes the remote copy on toggle-off rather
 * than just hiding it client-side - the Firestore journal mirror only ever
 * contains a photo URL for entries currently marked shared, so a friend
 * querying Firestore directly can't see a photo you've unshared.
 */

function photoPath(uid, entryId) {
  return `journalPhotos/${uid}/${entryId}.jpg`;
}

/** Uploads a local photo URI and returns its public download URL. */
export async function uploadJournalPhoto(uid, entryId, localUri) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, photoPath(uid, entryId));
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/** Removes a previously-shared photo from Storage. Best-effort. */
export async function deleteJournalPhoto(uid, entryId) {
  try {
    await deleteObject(ref(storage, photoPath(uid, entryId)));
  } catch (e) {
    // Already gone, or never actually uploaded - either way there's nothing
    // left to clean up, so this isn't a failure worth surfacing.
    console.warn('journal photo delete skipped', e);
  }
}
