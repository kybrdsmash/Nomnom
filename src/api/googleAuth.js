import {
  GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider, linkWithCredential, signInWithCredential, signOut,
} from 'firebase/auth';
import { auth } from './firebase';

// Configure once at module load - GoogleSignin.configure() is synchronous
// and just stores config for later calls, safe before any UI mounts.
// webClientId (not an Android client ID) is what Firebase's
// GoogleAuthProvider needs - it's the token audience Firebase verifies
// against, same as before. The Android OAuth client (package + SHA-1) is
// still registered in Google Cloud Console, but this library verifies
// against it natively via Google Play Services instead of a client ID
// passed in code.
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

/**
 * Runs the native Google Sign-In flow (Android Credential Manager under the
 * hood) and returns the ID token, or null if the user cancelled.
 *
 * Replaces expo-auth-session's browser-based OAuth flow - Google now
 * rejects that flow on real native Android builds ("Access blocked: this
 * app's request is invalid"), a known, Expo-acknowledged issue (their
 * current docs no longer recommend expo-auth-session's Google provider for
 * native Android at all). This native module talks to Google Play Services
 * directly instead of round-tripping through a browser + custom-scheme
 * redirect, which is exactly the part Google now blocks.
 */
export async function promptGoogleSignIn() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  return response.data.idToken;
}

/**
 * Turns a Google ID token into a real, persistent Firebase account.
 *
 * Every user already has an anonymous Firebase account (see firebase.js's
 * ensureSignedIn, called on app launch) that all their favorites/journal/
 * history are already tied to - `linkWithCredential` upgrades that SAME
 * account in place, so nothing is lost (this is the whole point: "an
 * account so content stays saved," not a fresh empty one).
 *
 * Falls back to signInWithCredential when linking fails with
 * auth/credential-already-in-use OR auth/email-already-in-use - Firebase
 * returns either code for the same underlying situation (this Google
 * account was already linked to a DIFFERENT Firebase account in the past,
 * e.g. they signed in with it on another device first), depending on
 * whether the existing account was matched by provider-credential or just
 * by email - confirmed live via real device logs (actual code seen:
 * auth/email-already-in-use), which the original credential-only check
 * didn't catch and re-threw instead of falling back ("Could not sign in -
 * try again" with no indication why). Either way the right move is to
 * switch TO that existing account rather than error out.
 *
 * Known limitation, accepted rather than solved here: signing out returns
 * to a fresh anonymous session (see signOutGoogle below) - anything added
 * during that logged-out window does NOT get merged in on the next Google
 * sign-in, which just restores the one permanent Google-linked account.
 */
export async function signInWithGoogleIdToken(idToken) {
  const credential = GoogleAuthProvider.credential(idToken);
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    try {
      const result = await linkWithCredential(current, credential);
      return result.user;
    } catch (error) {
      const alreadyLinkedElsewhere = error?.code === 'auth/credential-already-in-use'
        || error?.code === 'auth/email-already-in-use';
      if (!alreadyLinkedElsewhere) throw error;
      const result = await signInWithCredential(auth, credential);
      return result.user;
    }
  }
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

/** Signs out of the current (Google-linked) account entirely. */
export async function signOutGoogle() {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Best-effort - clearing the native session isn't critical if it fails,
    // the Firebase signOut below is what actually matters to the app.
  }
  return signOut(auth);
}

export { isErrorWithCode, statusCodes };
