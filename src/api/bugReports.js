import { Platform } from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, isFirebaseConfigured } from './firebase';

/**
 * In-app "Report a Bug" submissions - one doc per report in the
 * `bugReports` collection, `status: 'new'` until a daily scheduled check
 * (outside this app, see project TODO.md) picks it up, investigates, and
 * updates it. No read path from the app itself - this is a one-way
 * mailbox, not something the app displays back to the reporter.
 *
 * An attached screenshot (optional) uploads to Storage under
 * bugReportScreenshots/{uid}/{timestamp}.jpg, same
 * pick-then-upload-then-link-the-URL pattern as journalPhotos.js. Uploaded
 * BEFORE the Firestore doc is written so the doc always has a real URL or
 * none at all, never a dangling reference to a failed upload.
 */
export async function submitBugReport({ uid, description, displayName, screenshotUri }) {
  if (!isFirebaseConfigured || !description?.trim()) return false;
  try {
    let screenshotUrl = null;
    if (screenshotUri) {
      const response = await fetch(screenshotUri);
      const blob = await response.blob();
      const storageRef = ref(storage, `bugReportScreenshots/${uid || 'anon'}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob);
      screenshotUrl = await getDownloadURL(storageRef);
    }
    await addDoc(collection(db, 'bugReports'), {
      uid: uid || null,
      displayName: displayName || null,
      description: description.trim(),
      screenshotUrl,
      platform: Platform.OS,
      status: 'new',
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.warn('bug report submit failed', e);
    return false;
  }
}
