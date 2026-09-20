import {
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from './firebase';

/**
 * One "Continue" action that covers both sign-up and log-in, matching
 * googleAuth.js's signInWithGoogleIdToken pattern - no separate toggle for
 * "I'm new" vs "I already have an account" to get wrong.
 *
 * Tries linking this email/password to the current anonymous account first
 * (preserves favorites/journal/history already tied to it, same reasoning
 * as the Google flow). If that email is already taken by an existing
 * account (auth/email-already-in-use, or auth/credential-already-in-use if
 * Firebase phrases it that way), the right move isn't to error out - it
 * means this is actually a returning user on a new device/reinstall, so
 * fall back to a normal login with the password they just typed. If that
 * password is wrong, signInWithEmailAndPassword's own error (auth/wrong-
 * password / auth/invalid-credential) surfaces normally.
 */
export async function signUpOrSignInWithEmail(email, password) {
  const credential = EmailAuthProvider.credential(email, password);
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    try {
      const result = await linkWithCredential(current, credential);
      return result.user;
    } catch (error) {
      if (error?.code !== 'auth/email-already-in-use' && error?.code !== 'auth/credential-already-in-use') throw error;
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    }
  }
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/** Maps Firebase Auth's error codes to copy someone can actually act on. */
export function emailAuthErrorMessage(error) {
  switch (error?.code) {
    case 'auth/invalid-email':
      return "That doesn't look like a valid email.";
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect password.';
    case 'auth/too-many-requests':
      return 'Too many attempts - try again in a bit.';
    case 'auth/user-not-found':
      return "No account found for that email - check for typos, or it may need a password reset.";
    default:
      return 'Something went wrong - try again.';
  }
}
