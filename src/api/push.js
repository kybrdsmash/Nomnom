import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Foreground notifications still show a banner/sound instead of silently
// landing in the tray only - a ping's whole point is catching a friend's
// attention right away, app open or not.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests notification permission and registers this device's Expo push
 * token against the signed-in user's Firestore doc (users/{uid}), so the
 * onPingCreated Cloud Function (functions/index.js) can look it up and
 * actually wake their phone - see friendSession.js's sendPing comment for
 * why the in-app-only ping alone isn't enough on its own.
 *
 * Best-effort only, same "fails quietly" pattern as MomentsEditor's mic
 * button (see MicButtonBoundary there) - Expo Go can't register a real
 * push token at all (SDK 53+ dropped remote push support there), and a
 * user can always just deny the permission prompt. Either way the rest of
 * the app keeps working exactly as before; only the OS-level "wake my
 * phone" part is unavailable.
 */
export async function registerForPushNotifications(uid) {
  if (!uid) return;
  try {
    if (Platform.OS === 'android') {
      // Channel ID 'pings-v2', not 'default' - Android locks a channel's
      // settings (importance, sound, vibration) at creation and silently
      // ignores every later setNotificationChannelAsync call with the same
      // ID, even across app updates. A device that had ever created a
      // 'default' channel before this HIGH-importance config existed would
      // be stuck on whatever it got that first time, with no code-only way
      // to fix it (user report: notification arrived - badge incremented -
      // but no heads-up banner or vibration, exactly what a
      // lower-than-HIGH-importance channel looks like). A new ID forces a
      // fresh channel with the settings actually specified here.
      await Notifications.setNotificationChannelAsync('pings-v2', {
        name: 'Pings',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    await setDoc(doc(db, 'users', uid), { expoPushToken }, { merge: true });
  } catch (error) {
    // Expo Go, denied permission, no physical device, etc - the app
    // functions identically either way, just without OS-level pings.
    console.warn('Push notification registration skipped:', error?.message || error);
  }
}

/**
 * Fires when the user taps a push notification (app backgrounded or fully
 * killed) - extracts the friend-spin code from its data payload so App.js
 * can route straight into joining, exactly like tapping a shared nomnom://
 * join link already does. Returns the unsubscribe function.
 */
export function addNotificationTapListener(onCode) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const code = response.notification.request.content.data?.code;
    if (code) onCode(String(code).toUpperCase());
  });
  return () => sub.remove();
}
