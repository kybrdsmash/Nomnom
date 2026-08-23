import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin persistence layer over AsyncStorage. Everything is stored as JSON
 * under one key per list. Failures are swallowed (storage is best-effort -
 * the app still works session-only if a read/write fails).
 */

const KEYS = {
  history: '@nomnom/history',
  favorites: '@nomnom/favorites',
  tryLater: '@nomnom/tryLater',
  seenIds: '@nomnom/seenIds',
  activeFriendSession: '@nomnom/activeFriendSession',
  detailsCache: '@nomnom/detailsCache',
  theme: '@nomnom/theme',
  profile: '@nomnom/profile',
  preferences: '@nomnom/preferences',
  friends: '@nomnom/friends',
  scheduleArchive: '@nomnom/scheduleArchive',
  faveCuisines: '@nomnom/faveCuisines',
  journal: '@nomnom/journal',
};

async function load(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('storage load failed', key, e);
    return fallback;
  }
}

async function save(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('storage save failed', key, e);
  }
}

export const loadHistory = () => load(KEYS.history, []);
export const saveHistory = (list) => save(KEYS.history, list);

export const loadFavorites = () => load(KEYS.favorites, []);
export const saveFavorites = (list) => save(KEYS.favorites, list);

export const loadTryLater = () => load(KEYS.tryLater, []);
export const saveTryLater = (list) => save(KEYS.tryLater, list);

// Seen IDs persist so the white repeat-dot survives app restarts. Capped so
// it doesn't grow forever - oldest entries fall off past 200.
export const loadSeenIds = async () => new Set(await load(KEYS.seenIds, []));
export const saveSeenIds = (idSet) =>
  save(KEYS.seenIds, [...idSet].slice(-200));

// The 4-letter code of a friend-spin session currently in progress, if any.
// The Firestore doc itself never gets deleted by leaving the screen or
// closing the app, so remembering just the code (paired with Firebase Auth's
// now-persisted uid) is enough for FriendSpin to reconnect on mount instead
// of forcing the user to start over.
export const loadActiveFriendSession = () => load(KEYS.activeFriendSession, null);
export const saveActiveFriendSession = (code) => save(KEYS.activeFriendSession, code);
export const clearActiveFriendSession = () => save(KEYS.activeFriendSession, null);

// Place Details lookups (photos/reviews/hours) are a paid-tier API call.
// Persisting the shaped result keyed by place ID means reopening a spot's
// detail view - even in a brand new app session - never re-fetches it.
export const loadDetailsCache = () => load(KEYS.detailsCache, {});
export const saveDetailsCache = (cache) => save(KEYS.detailsCache, cache);

// Settings: appearance (the one picked accent color, see src/ThemeContext.js
// for how dark/deep/glow shades get derived from it), profile (just a
// display name - friend-spin already uses Firebase Anonymous Auth under the
// hood, this is purely a label for chat/session UI), and small preference
// toggles (haptics, coin tap-vs-flick, units).
export const loadTheme = () => load(KEYS.theme, null);
export const saveTheme = (theme) => save(KEYS.theme, theme);

export const loadProfile = () => load(KEYS.profile, { displayName: '' });
export const saveProfile = (profile) => save(KEYS.profile, profile);

export const loadPreferences = () => load(KEYS.preferences, {
  haptics: true,
  coinInteraction: 'tap', // 'tap' | 'flick'
  units: 'mi', // 'mi' | 'km'
});
export const savePreferences = (prefs) => save(KEYS.preferences, prefs);

// People you've done a friend-spin session with before, keyed by their
// (now-persisted, see firebase.js) anonymous auth uid so they can be pinged
// again later without re-sharing a code. [{ uid, name, lastPlayedAt }].
export const loadFriends = () => load(KEYS.friends, []);
export const saveFriends = (list) => save(KEYS.friends, list);

// Friend-spin sessions that reached a winner, remembered locally so they can
// be reopened later - once a session's status is 'done' and it's no longer
// the active "resume on relaunch" session, there'd otherwise be no way back
// to it (join() refuses already-started sessions by design). This is what
// lets someone come back later and reschedule (edit the proposed time,
// same place) or just check what was already scheduled.
export const loadScheduleArchive = () => load(KEYS.scheduleArchive, []);
export const saveScheduleArchive = (list) => save(KEYS.scheduleArchive, list);

// 3 saved cuisine-selection presets ("Fave 1/2/3" in the Cuisines dropdown) -
// each slot is just an array of cuisine names, empty until the user
// long-presses to save their current picks into it.
export const loadFaveCuisines = () => load(KEYS.faveCuisines, [[], [], []]);
export const saveFaveCuisines = (slots) => save(KEYS.faveCuisines, slots);

// Personal food journal - one or more entries per place (a spot can be
// revisited/rerated over time), keyed by place id. Each entry carries a
// trimmed spot snapshot so the journal-browser screen can render/reopen it
// without a fresh Places lookup - see src/api/journal.js for the Firestore
// mirror that makes this visible to friends.
export const loadJournal = () => load(KEYS.journal, {});
export const saveJournal = (journal) => save(KEYS.journal, journal);
