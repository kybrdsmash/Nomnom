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
 * pick-then-upload-then-link-the-URL pattern as journalPhotos.js.
 *
 * The screenshot upload has its own try/catch, separate from the Firestore
 * write below - TODO.md flags the bugReportScreenshots Storage rule as not
 * yet added (Storage denies all reads/writes by default until a rule
 * exists for that path), so right now ANY report with a photo attached
 * fails outright (user report: "seems to be after someone adds a photo") -
 * a text-only report was always fine, only the upload step wasn't. Once
 * that Storage rule exists this degrades to "essentially never fails,"
 * but even then a photo upload can fail for other reasons (bad network,
 * huge file) - either way, a broken screenshot shouldn't be able to lose
 * someone's whole bug report. Returns `screenshotFailed` so the caller can
 * tell the reporter their report went through minus the photo, rather than
 * silently dropping it with no explanation.
 */
export async function submitBugReport({ uid, description, displayName, screenshotUri }) {
  if (!isFirebaseConfigured || !description?.trim()) return { ok: false, screenshotFailed: false };
  let screenshotUrl = null;
  let screenshotFailed = false;
  if (screenshotUri) {
    try {
      const response = await fetch(screenshotUri);
      const blob = await response.blob();
      const storageRef = ref(storage, `bugReportScreenshots/${uid || 'anon'}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob);
      screenshotUrl = await getDownloadURL(storageRef);
    } catch (e) {
      console.warn('bug report screenshot upload failed - sending report without it', e);
      screenshotFailed = true;
    }
  }
  try {
    await addDoc(collection(db, 'bugReports'), {
      uid: uid || null,
      displayName: displayName || null,
      description: description.trim(),
      screenshotUrl,
      platform: Platform.OS,
      status: 'new',
      createdAt: serverTimestamp(),
    });
    return { ok: true, screenshotFailed };
  } catch (e) {
    console.warn('bug report submit failed', e);
    return { ok: false, screenshotFailed };
  }
}
