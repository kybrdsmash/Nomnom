import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider, linkWithCredential, signInWithCredential, signOut,
} from 'firebase/auth';
import { auth } from './firebase';

// Required boilerplate so the browser-based OAuth flow correctly resolves
// back into the app when it redirects - without this the app can hang on
// "waiting" after the user finishes signing in in the browser.
WebBrowser.maybeCompleteAuthSession();

/**
 * Wraps expo-auth-session's Google provider with this project's two OAuth
 * client IDs - a Web client (Firebase's own, works for the browser-side
 * auth request) and an Android client (package + release SHA-1, required
 * because the Web client only supports https redirect URIs, not a native
 * app's custom-scheme redirect). Returns [request, response, promptAsync] -
 * call promptAsync() from a button's onPress; once response.type ===
 * 'success', response.params.id_token is what signInWithGoogleIdToken needs.
 */
export function useGoogleAuthRequest() {
  return Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });
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
 * auth/credential-already-in-use - that specific error means this Google
 * account was already linked to a DIFFERENT Firebase account in the past
 * (e.g. they signed in with it on another device first), so the right
 * move is to switch TO that existing account rather than error out.
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
      if (error?.code !== 'auth/credential-already-in-use') throw error;
      const result = await signInWithCredential(auth, credential);
      return result.user;
    }
  }
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

/** Signs out of the current (Google-linked) account entirely. */
export function signOutGoogle() {
  return signOut(auth);
}
