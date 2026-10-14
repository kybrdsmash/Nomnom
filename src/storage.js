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
  pinnedFriendUids: '@nomnom/pinnedFriendUids',
  scheduleArchive: '@nomnom/scheduleArchive',
  faveCuisines: '@nomnom/faveCuisines',
  journal: '@nomnom/journal',
  atTheTableDraft: '@nomnom/atTheTableDraft',
  journalComposeDraft: '@nomnom/journalComposeDraft',
  travelType: '@nomnom/travelType',
  onboardingSeen: '@nomnom/onboardingSeen',
  defaultFriendSeeded: '@nomnom/defaultFriendSeeded',
  installReferrerChecked: '@nomnom/installReferrerChecked',
  navTapCounts: '@nomnom/navTapCounts',
  buddyAvatar: '@nomnom/buddyAvatar',
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
  units: 'mi', // 'mi' | 'km'
});
export const savePreferences = (prefs) => save(KEYS.preferences, prefs);

// Sticks until the user picks a different one - not reset per session.
export const loadTravelType = () => load(KEYS.travelType, 'drive');
export const saveTravelType = (travelType) => save(KEYS.travelType, travelType);

// Whether the first-launch onboarding walkthrough (OnboardingOverlay.js) has
// already been shown/dismissed - default false so it genuinely shows once
// for a brand new install (user report: "they don't really know where or
// what to do"). Only ever set true from the overlay's own "don't show this
// again" checkbox, not automatically on every dismiss - see that
// component's own comment for why.
export const loadOnboardingSeen = () => load(KEYS.onboardingSeen, false);
export const saveOnboardingSeen = (seen) => save(KEYS.onboardingSeen, seen);

// Whether the developer's own account has already been auto-added as a
// default friend (App.js's startup effect) - a one-time seed, not a "friends
// is empty so add them" check, so a future "remove friend" feature (doesn't
// exist yet) could let someone remove this default without it silently
// reappearing next launch just because the list is empty again.
export const loadDefaultFriendSeeded = () => load(KEYS.defaultFriendSeeded, false);
export const saveDefaultFriendSeeded = (seeded) => save(KEYS.defaultFriendSeeded, seeded);

// Whether Application.getInstallReferrerAsync() has already been read and
// acted on once for this install - the referrer string keeps answering the
// same value on every subsequent call, so without this flag a friend who
// joined via a referrer link, then later left that session and relaunched
// the app, would get silently yanked back into the old session every time.
export const loadInstallReferrerChecked = () => load(KEYS.installReferrerChecked, false);
export const saveInstallReferrerChecked = (checked) => save(KEYS.installReferrerChecked, checked);

// People you've done a friend-spin session with before, keyed by their
// (now-persisted, see firebase.js) anonymous auth uid so they can be pinged
// again later without re-sharing a code. [{ uid, name, lastPlayedAt }].
export const loadFriends = () => load(KEYS.friends, []);
export const saveFriends = (list) => save(KEYS.friends, list);

// The Feast tab's customizable "top 5" friend order (FriendSpin.js) - an
// ordered array of up to 5 uids. Empty by default (plain alphabetical,
// no customization yet); populated once the user reorders/promotes via
// the "Everyone else" section's edit mode. Per-device only, same as
// travelType/buddyAvatar below - a display preference, not data that
// needs to follow the account across devices.
export const loadPinnedFriendUids = () => load(KEYS.pinnedFriendUids, []);
export const savePinnedFriendUids = (uids) => save(KEYS.pinnedFriendUids, uids);

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

// One in-progress "At the Table" note at a time - saved on every change so
// closing/reopening the app resumes exactly where it left off (user
// request: it should feel like the note never closed, even though nothing
// can literally stay on screen once the app itself is closed).
export const loadAtTheTableDraft = () => load(KEYS.atTheTableDraft, null);
export const saveAtTheTableDraft = (draft) => save(KEYS.atTheTableDraft, draft);
export const clearAtTheTableDraft = () => save(KEYS.atTheTableDraft, null);

// Same reasoning as atTheTableDraft, for DetailModal's own "My Journal"
// compose box - that one had no persistence at all (plain useState), so
// closing the modal (or getting bumped out of it any other way) mid-entry
// silently threw the whole thing away (user report: "I was in the middle
// of a journal... left the page and went back - I lost it"). One global
// slot (not per-spot) matches atTheTableDraft's own convention - you can
// only realistically be composing one entry at a time anywhere in the app.
export const loadJournalComposeDraft = () => load(KEYS.journalComposeDraft, null);
export const saveJournalComposeDraft = (draft) => save(KEYS.journalComposeDraft, draft);
export const clearJournalComposeDraft = () => save(KEYS.journalComposeDraft, null);

// Anonymous, local-only tap counts per BottomNav destination (home/places/
// feast/favorites/settings) - no analytics SDK, no user id, never leaves the
// device (user request: real usage data to inform whether the bottom nav's
// current layout - e.g. Settings occupying one of only 5 slots - is actually
// worth its spot, since neither of us has real data on that today). Plain
// {key: count} object, incremented on every BottomNav tap.
export const loadNavTapCounts = () => load(KEYS.navTapCounts, {});
export const saveNavTapCounts = (counts) => save(KEYS.navTapCounts, counts);

// Which of BUDDY_AVATARS (src/buddyAvatars.js) is shown as the Settings
// tab's icon in BottomNav - null until the first-launch BuddyPicker has
// ever been completed, at which point App.js stops showing it
// automatically (same "seen once" pattern as loadOnboardingSeen). Still
// reachable afterward from Settings > Profile to change it.
export const loadBuddyAvatar = () => load(KEYS.buddyAvatar, null);
export const saveBuddyAvatar = (key) => save(KEYS.buddyAvatar, key);
