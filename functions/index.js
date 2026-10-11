const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const functions = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');

initializeApp();
const db = getFirestore();

// The developer's own account (isaacrvgfinger@gmail.com) - every new app
// user gets this added as a default friend (see onNewUserCreated below), so
// don't re-trigger if this account itself ever creates a new auth identity.
const DEFAULT_FRIEND_UID = '3se0miVjWnhoNEzpDJMmHWu3xnI2';

/**
 * Fires whenever sendPing() (src/api/friendSession.js, client-side) writes
 * a new users/{uid}/pings doc - looks up the recipient's registered Expo
 * push token (see src/api/push.js's registerForPushNotifications, which
 * stores it on their users/{uid} doc) and asks Expo's push service to wake
 * their phone with it.
 *
 * This has to run server-side: a client can read its OWN push token but
 * has no business reading (or being trusted to accurately relay) another
 * user's token, and Expo's push endpoint has no per-recipient auth of its
 * own beyond "you have their token" - so the lookup+send has to happen
 * somewhere both users implicitly trust. This function, running under the
 * Admin SDK, is that place.
 *
 * Silently no-ops (not an error) if the recipient never registered a push
 * token (Expo Go, denied the permission prompt, etc) - the existing
 * in-app-only ping (watchPings in friendSession.js) still works for them
 * exactly as before either way; this is a pure enhancement on top. See
 * registerForPushNotifications (src/api/push.js) for the matching
 * fails-quietly reasoning on the client side.
 */
exports.onPingCreated = onDocumentCreated('users/{uid}/pings/{pingId}', async (event) => {
  const ping = event.data?.data();
  if (!ping) return;
  const { uid } = event.params;

  const userSnap = await db.doc(`users/${uid}`).get();
  const expoPushToken = userSnap.data()?.expoPushToken;
  if (!expoPushToken) {
    logger.warn('onPingCreated: recipient has no registered push token', { uid });
    return;
  }

  // Was a bare, unchecked fetch - a request Expo's push service actually
  // REJECTS (expired/invalid token, malformed payload, etc.) still counts
  // as this function running "successfully" with nothing in its own logs to
  // say so, which is exactly what made a real on-device test undiagnosable
  // (a fresh invocation showed, but nothing ever arrived). Expo's response
  // shape for a single recipient is {data: {status: 'ok'|'error', ...}} -
  // logging it either way means the NEXT test tells us definitively whether
  // Expo actually accepted this, instead of just "it ran."
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: expoPushToken,
      title: 'nomnom',
      body: `${ping.fromName || 'A friend'} wants to spin with you!`,
      data: { code: ping.code },
      sound: 'default',
      priority: 'high',
      // Must match push.js's registerForPushNotifications channel ID - a
      // push with no channelId falls back to Android's own "Miscellaneous"
      // default, not the app's HIGH-importance one, silently losing the
      // heads-up banner/vibration on Android specifically (iOS has no
      // channel concept and is unaffected either way).
      channelId: 'pings-v2',
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.data?.status === 'error') {
    logger.error('onPingCreated: Expo push request failed', { uid, httpStatus: response.status, result });
    return;
  }
  logger.info('onPingCreated: push sent', { uid, result });
});

/**
 * Fires once for every new Firebase Auth identity - including the plain
 * anonymous one every fresh install creates on first launch (ensureSignedIn,
 * src/api/firebase.js), which IS the uid everything (friends, journal,
 * history...) stays keyed to even if that device later links a real Google
 * account on top of it. So "signs up" here really means "opens the app for
 * the first time ever," not specifically "linked a Google account" - matches
 * what the client side seeds too (App.js's own default-friend effect).
 *
 * Auto-adds the new user to the developer's own friendUids (see journal.js's
 * doc comment for the security rule this feeds) so a brand new user can
 * actually read DEFAULT_FRIEND_UID's journals/{uid} doc the moment the
 * client seeds them as a local friend - without this, "add me as everyone's
 * default friend" would only ever change what the new user's OWN screen
 * shows, never grant them real read access to the content the whole feature
 * is about (user request: "so they can start seeing my stuff"). Has to run
 * here, under the Admin SDK - a brand new user obviously has no write access
 * to someone ELSE's journals/{uid} doc, nor should they.
 *
 * {merge: true} + arrayUnion so this never clobbers `entries` (DEFAULT_FRIEND
 * only writes `entries` outright from pushJournal/journal.js) and never
 * races the client's own friendUids writes either, which merge the same way
 * now for exactly this reason.
 */
exports.onNewUserCreated = functions.auth.user().onCreate(async (user) => {
  if (user.uid === DEFAULT_FRIEND_UID) return;
  await db.doc(`journals/${DEFAULT_FRIEND_UID}`).set(
    { friendUids: FieldValue.arrayUnion(user.uid) },
    { merge: true }
  );
  logger.info('onNewUserCreated: added to default friend\'s friendUids', { uid: user.uid });
});
