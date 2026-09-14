# Nomnom TODO

Living list, kept in the repo so it survives across sessions (unlike chat history). Add to it as things come up; check items off as they land.

## Google Play Store launch (current focus — Android only for now)

- [x] Draft privacy policy — published as a Claude Artifact: https://claude.ai/code/artifact/82119d59-1862-412c-b5a7-0e92fdd027b1. Entity name (Isaac Finger), CCPA/California rights section, governing-law clause, and the no-Advertising-ID statement are all in. Still needs: a lawyer's sign-off, then the artifact shared so the URL is publicly reachable for Play Console.
- [x] Google Play Console account ($25 one-time)
- [x] EAS environment variables set (all 7 `EXPO_PUBLIC_*` vars pushed into both `production` and `preview` EAS environments; project linked to the `isaacfinger` account as `@isaacfinger/Nomnom_App`, ID `95d6c302-0f94-4e28-9ae7-c30723db7544` — see `extra.eas.projectId` in `app.config.js`)
- [x] `eas build --profile production --platform android` — first successful build. Logs: https://expo.dev/accounts/isaacfinger/projects/Nomnom_App/builds/7dd7c5ee-4dc6-48c1-9751-888a0a770fa9 · .aab: https://expo.dev/artifacts/eas/HciA0pF_Rtu8xtXs9US9iJhVH1W-oYOeaL_ZXgByT7Y.aab (versionCode 2 — EAS auto-incremented since eas.json now uses `appVersionSource: "remote"`; see git history for why)
- [ ] Play Store listing: screenshots, description, privacy policy URL, Data Safety form — location + friend/journal data need disclosing (policy Section 2), and explicitly declare no Advertising ID / no ad SDK to match Section 4 of the policy
- [ ] Closed testing track (Google requires 12+ testers for 14+ continuous days on new developer accounts before allowing production release)
- [ ] `eas submit --platform android` (needs a Play Console service-account JSON key)

## Apple App Store launch (deferred — revisit once Android feels stable)

- [ ] Apple Developer Program account ($99/year)
- [ ] `eas build --profile production --platform ios`
- [ ] App Store Connect listing + privacy policy URL (needs its own review pass — Apple's App Privacy "nutrition label" is stricter than Play's Data Safety form and requires an explicit App Tracking Transparency declaration)
- [ ] `eas submit --platform ios` (needs an App Store Connect API key)

## Known outstanding (from SESSION_HANDOFF.md, still true unless re-checked)

- [x] ~~Firebase Auth has no persistence configured~~ — false alarm, carried over from a stale handoff note. Checked `src/api/firebase.js` (2026-09-14): `getReactNativePersistence` is already wired into `initializeAuth`. Anonymous sign-in already survives restarts.

## Feed / Feast with Friends (in progress)

- [ ] Friends-first reformat of the feed strip once there are enough real friend connections to test with (see TODO comment in `FriendSpin.js`)
- [ ] Firestore security rules for the new `feedPhotos` collection — confirm read/write is actually allowed, or the feed silently stays empty

## Someday / vision

- [ ] Real user photo uploads on reviews (camera/picker + Firebase Storage) — the actual long-term feed vision, current feed is a placeholder seeded from Google Places photos
- [ ] Rewards system for completed reviews
- [ ] Bring back a fancier coin-spin animation (currently uses RN's built-in `Animated` API on purpose, not Reanimated, to stay Expo-Go-compatible)

## Industrial design opens (from SESSION_HANDOFF.md)

- [ ] Button/slider edge shimmer — a highlight that reads as light catching a glossy/beveled rim along the EDGE of a button/slider, not corner dots (a corner-dot attempt was tried and fully reverted 2026-08-01 — see git history if picking this back up)
