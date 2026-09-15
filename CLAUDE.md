# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nomnom: an Expo/React Native app that picks a nearby restaurant for you. Point it at your location, set filters (distance, cuisine, rating, price, open-now), and either get one instant pick ("I Don't Care" mode) or run a 5-way elimination bracket. Supports a real-time "spin with a friend" mode where two phones jointly narrow down a bracket via Firestore.

## Commands

```
npm install              # install deps
npx expo start -c        # start dev server, clearing Metro cache (use after .env or dep changes)
npm start                # expo start (no cache clear)
npm run android           # expo start --android
npm run ios                # expo start --ios
npm run web                 # expo start --web
```

There is no test suite and no linter configured in this repo.

Building: `eas.json` defines a `preview` profile (internal-distribution Android APK) — build with `eas build --profile preview --platform android`. Requires `eas login` and EAS-side environment variables mirroring `.env` (EAS builds don't read the local `.env` file).

## Environment setup

Copy `.env.example` to `.env` and fill in:
- `EXPO_PUBLIC_GOOGLE_API_KEY` — Google Places API (Nearby Search, Place Details, Place Photos must be enabled), and Maps SDK for Android (for the friend-spin map preview in `FriendMap.js` — read into `app.config.js`'s `android.config.googleMaps.apiKey`; iOS needs no key since `react-native-maps` uses Apple Maps there)
- 6 `EXPO_PUBLIC_FIREBASE_*` values from Firebase console > Project settings > Your apps > Web app
- `EXPO_PUBLIC_OPENAI_API_KEY` — optional, powers the "At the Table" journal note's voice-to-text mic button (`src/api/transcribe.js`, OpenAI's Whisper endpoint). Missing this just disables the mic button (fails quietly, tells the user to type instead) rather than breaking anything.

All env vars use the `EXPO_PUBLIC_` prefix so Expo inlines them at build time. `.env` is gitignored. Friend-spin mode checks `isFirebaseConfigured` (`src/api/firebase.js`) and shows a fallback message instead of crashing when Firebase env vars are missing.

## Architecture

**`App.js`** is the single top-level state container — all app state (result, elimination bracket, filters, history/favorites/try-later lists, active view) lives here in `useState`/`useRef` and is passed down as props. There is no global store (no Redux/Context) and no navigation library — screen switching is done via an `activeView` string (`'main' | 'history' | 'favorites' | 'tryLater' | 'friend'`) that conditionally renders full-screen overlay components, with `Animated.Value` opacity crossfades between the filter screen, elimination bracket, and result card rather than a router.

**`src/api/places.js`** is the core search logic and the most complex file in the app:
- One Google Places `nearbysearch` request is made *per selected cuisine* (parallel, capped at 5) because Google rejects combined keywords like "Mexican Thai food"; results are interleaved round-robin so the pool stays cuisine-diverse.
- Results pass through a hard review-count floor (`MIN_REVIEW_COUNT`), then a self-calibrating statistical filter (`filterByReviewStats`) that drops spots more than `STATS_FILTER_SIGMA` standard deviations below the local mean of `log(review count)` — this adapts the effective quality bar between dense cities and rural areas instead of using a fixed threshold.
- The **entire filtered pool** (not just what's shown) is cached in module-level variables (`cachedPool`/`cachedKey`/`cacheShownIds`), keyed on a rounded-location + filter fingerprint. Repeat spins with unchanged filters serve from this cache for free; only a filter change or pool exhaustion triggers a new Google API call. This is why "flip again" mostly feels instant.

**`src/api/friendSession.js` + `src/components/FriendSpin.js`** implement the multiplayer mode as a single Firestore document per session (`sessions/{4-letter code}`), moving through the lifecycle `waiting → ready → playing → done`. The host computes the search radius/midpoint once both locations are present and writes the bracket; both clients subscribe via `onSnapshot` and alternate turns eliminating spots (`turnUid` flips each move) until one remains. There's no server/cloud function — all orchestration logic runs on the host client.

**`src/storage.js`** wraps AsyncStorage for history/favorites/try-later/seen-ids, one JSON blob per key, with read/write failures swallowed (storage is best-effort; the app still functions session-only if it fails). In `App.js`, persistence effects are gated on a `storageLoaded` flag so the empty initial state can't overwrite previously saved data on mount.

**`src/components/`** are presentational, driven entirely by props from `App.js` (no component reaches into global state or storage directly, except `FriendSpin` which owns its own Firestore subscription).

**`src/constants.js`** centralizes tunables that affect multiple files and must stay in sync: `COIN_ANIMATION_MS` must match the sum of `CoinSpinner.js`'s internal phase durations (`FAST_SPIN_MS` + `SLOW_SETTLE_MS`) since `App.js` blocks the result reveal on `Promise.all([apiCall, minWaitTimer])` so a fast API response never cuts the spin animation short; `STATS_FILTER_MIN_POOL`/`STATS_FILTER_SIGMA` tune the review-count filter in `places.js`.

`CoinSpinner.js` deliberately uses React Native's built-in `Animated` API rather than `react-native-reanimated`, because Reanimated 4 requires native code that Expo Go doesn't ship — this keeps the app runnable in Expo Go without a custom dev client.
