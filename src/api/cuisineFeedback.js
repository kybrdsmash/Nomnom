import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

/**
 * One-way mailbox (same convention as bugReports.js) for the "is this
 * actually a {cuisine} place?" yes/no prompt shown on a result that Google
 * never confirmed matched the searched cuisine (places.js's
 * unconfirmedCuisine/applyTypeAllowlist fallback - user feedback: "No X
 * Match Nearby" reads as alarming/wrong once you're looking right at a real
 * result, especially after already seeing genuine matches earlier in the
 * same search). No read path from the app itself - this is purely a
 * crowdsourced signal for manually tuning CUISINE_TYPE_REQUIREMENTS/
 * NAME_HINTS later, not a live feedback loop.
 *
 * Like bugReportScreenshots, a brand-new Firestore collection needs its own
 * security rule published in the Firebase console before writes here will
 * actually succeed - if this silently never shows up in the console, check
 * that first.
 */
export async function submitCuisineFeedback({ uid, placeId, placeName, cuisine, matches }) {
  if (!isFirebaseConfigured) return;
  try {
    await addDoc(collection(db, 'cuisineFeedback'), {
      uid: uid || null,
      placeId,
      placeName,
      cuisine,
      matches,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('cuisine feedback submit failed', e);
  }
}
