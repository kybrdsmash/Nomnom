const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

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
  if (!expoPushToken) return;

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: expoPushToken,
      title: 'nomnom',
      body: `${ping.fromName || 'A friend'} wants to spin with you!`,
      data: { code: ping.code },
      sound: 'default',
      priority: 'high',
    }),
  });
});
