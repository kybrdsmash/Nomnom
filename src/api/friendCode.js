import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Excludes visually-ambiguous characters (0/O, 1/I/L) - this code is meant
// to be read off one phone and typed into another, unlike the existing
// 4-letter SESSION codes (sessions/{code}, ephemeral, reused/expired
// constantly) which don't need this care as much. 6 characters over that
// alphabet is ~845 million combinations - collisions are checked for
// anyway (see getOrCreateFriendCode below), but this keeps them rare.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * A permanent, personal code (distinct from friendSession.js's ephemeral
 * 4-letter session codes) - share it once, anyone who enters it becomes a
 * friend, no live session needed first. Solves the previous chicken-and-egg
 * gap: friends only ever got added as a side effect of COMPLETING a spin
 * session together, which itself needed a code shared some other way
 * first (user report: "adding a friend is a big deal" - there was no
 * actual add-a-friend function at all).
 *
 * Generated once per account and cached on users/{uid}.friendCode - stable
 * for the account's whole lifetime once created, not regenerated on every
 * call. The reverse lookup (friendCodes/{code} -> {uid, name}) is its own
 * collection, deliberately minimal - a friend resolving your code should
 * only ever be able to read your uid/name, never the rest of your
 * users/{uid} doc (push token, etc.), which is why this isn't just another
 * field people query the main users collection for.
 */
export async function getOrCreateFriendCode(uid, displayName) {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.data()?.friendCode;
  if (existing) {
    // Keeps the reverse-lookup doc's name current even for an
    // already-existing code - someone who added you a while ago should see
    // your CURRENT display name reflected if they look you up again, not
    // whatever it was the day the code was first generated.
    await setDoc(doc(db, 'friendCodes', existing), { uid, name: displayName || '' });
    return existing;
  }

  // Collision check - vanishingly unlikely at this alphabet/length, but
  // cheap to guard against outright rather than trust probability alone.
  let code = randomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const codeSnap = await getDoc(doc(db, 'friendCodes', code));
    if (!codeSnap.exists()) break;
    code = randomCode();
  }

  await setDoc(userRef, { friendCode: code }, { merge: true });
  await setDoc(doc(db, 'friendCodes', code), { uid, name: displayName || '' });
  return code;
}

/** Resolves a friend's code to {uid, name}, or null if no such code exists. */
export async function lookupFriendByCode(code) {
  try {
    const snap = await getDoc(doc(db, 'friendCodes', code.trim().toUpperCase()));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('friend code lookup failed', e);
    return null;
  }
}
