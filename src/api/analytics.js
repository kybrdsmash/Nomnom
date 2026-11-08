import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './firebase';
import { takeNearbyCallCount } from './places';

/**
 * Per-user usage counters, kept on the users/{uid} doc the owner can already
 * write (firestore.rules), so no rules change is needed. Best-effort and
 * fire-and-forget - a failed write must never affect a spin.
 *
 * Fields: spinCount, nearbyCalls, photosShown, warmNearbyCalls, plus a
 * daily.{YYYY-MM-DD} map of the same counters. Cost per spin is then
 * (nearbyCalls * $0.032 + photosShown * $0.007) / spinCount (Google list
 * prices, see BUSINESS_PLAN.md).
 */
const dayKey = () => new Date().toISOString().slice(0, 10);

async function write(counters) {
  if (!isFirebaseConfigured) return;
  // The on-launch warm-up finishes before the saved session restores.
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const inc = {};
  Object.entries(counters).forEach(([k, v]) => { inc[k] = increment(v); });
  setDoc(doc(db, 'users', uid), {
    ...inc,
    daily: { [dayKey()]: inc },
    lastSpinAt: serverTimestamp(),
  }, { merge: true }).catch(() => {});
}

/** One spin/flip completed. `spots` are the picks shown; `mode` the game mode. */
export function recordSpin(spots, mode) {
  write({
    spinCount: 1,
    [`spins_${mode}`]: 1,
    nearbyCalls: takeNearbyCallCount(),
    photosShown: spots.filter((s) => s.photoUrl).length,
  });
}

/** Background searches no spin asked for (on-launch cache warm). */
export function recordWarmCalls() {
  const n = takeNearbyCallCount();
  if (n > 0) write({ warmNearbyCalls: n });
}
