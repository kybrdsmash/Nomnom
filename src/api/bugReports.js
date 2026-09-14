import { Platform } from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

/**
 * In-app "Report a Bug" submissions - one doc per report in the
 * `bugReports` collection, `status: 'new'` until a daily scheduled check
 * (outside this app, see project TODO.md) picks it up, investigates, and
 * updates it. No read path from the app itself - this is a one-way
 * mailbox, not something the app displays back to the reporter.
 */
export async function submitBugReport({ uid, description, displayName }) {
  if (!isFirebaseConfigured || !description?.trim()) return false;
  try {
    await addDoc(collection(db, 'bugReports'), {
      uid: uid || null,
      displayName: displayName || null,
      description: description.trim(),
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
