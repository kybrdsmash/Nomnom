import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAuth, getReactNativePersistence, getAuth, signInAnonymously } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Firebase bootstrap. All values come from .env (EXPO_PUBLIC_ prefix), same
 * pattern as the Google key - nothing secret committed to git.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = !!firebaseConfig.projectId;

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
// Used only for journal photos a user explicitly opts to share with friends
// (see journalPhotos.js) - same Firebase project as everything else here,
// not a separate service. Storage's default rules deny all reads/writes
// until configured in the Firebase console (see TODO.md).
export const storage = getStorage(app);

// Without an explicit persistence store, RN Firebase Auth defaults to
// memory-only - every app restart mints a brand new anonymous uid, which
// breaks reconnecting to a friend-spin session (the doc's hostUid/guestUid
// would no longer match). getAuth() throws if initializeAuth() hasn't run
// yet on this app instance, hence the try/catch (also covers Fast Refresh
// re-running this module against an already-initialized app).
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (e) {
  authInstance = getAuth(app);
}
export const auth = authInstance;

/** Signs in anonymously (no account needed) and returns the user's uid. */
export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}
