# Nomnom TODO

Living list, kept in the repo so it survives across sessions (unlike chat history). Add to it as things come up; check items off as they land.

## Google Play Store launch (current focus — Android only for now)

- [x] Draft privacy policy — published as a Claude Artifact: https://claude.ai/code/artifact/82119d59-1862-412c-b5a7-0e92fdd027b1. Entity name (Isaac Finger), CCPA/California rights section, governing-law clause, and the no-Advertising-ID statement are all in. Still needs: a lawyer's sign-off, then the artifact shared so the URL is publicly reachable for Play Console.
- [x] Google Play Console account ($25 one-time)
- [x] EAS environment variables set (all 7 `EXPO_PUBLIC_*` vars pushed into both `production` and `preview` EAS environments; project linked to the `isaacfinger` account as `@isaacfinger/Nomnom_App`, ID `95d6c302-0f94-4e28-9ae7-c30723db7544` — see `extra.eas.projectId` in `app.config.js`)
- [x] `eas build --profile production --platform android` — first successful build. Logs: https://expo.dev/accounts/isaacfinger/projects/Nomnom_App/builds/7dd7c5ee-4dc6-48c1-9751-888a0a770fa9 · .aab: https://expo.dev/artifacts/eas/HciA0pF_Rtu8xtXs9US9iJhVH1W-oYOeaL_ZXgByT7Y.aab (versionCode 2 — EAS auto-incremented since eas.json now uses `appVersionSource: "remote"`; see git history for why)
- [ ] Play Store listing: screenshots, description, privacy policy URL, Data Safety form — location + friend/journal data need disclosing (policy Section 2), and explicitly declare no Advertising ID / no ad SDK to match Section 4 of the policy
- [ ] Closed testing track — set up in Play Console (Testing → Closed testing), add 12+ testers via an email list, share the opt-in link. Google requires 12+ testers opted in for 14+ continuous days on new developer accounts before allowing Production access. Start this ASAP since it's a clock, not just effort - recruit the 12 testers before finishing the rest of this list.
- [ ] Google Cloud service-account key for `eas submit` — create in GCP Console → IAM & Admin → Service Accounts, link it in Play Console → Setup → API access, download the JSON, point `eas.json`'s `submit.production.android.serviceAccountKeyPath` at it (currently empty: `"submit": { "production": {} }`)
- [ ] `eas submit --platform android` (blocked on the service-account key above; also don't bother until the 14-day closed-testing clock has cleared and Production access is actually unlocked)

## Apple App Store launch (deferred — revisit once Android feels stable)

- [ ] Apple Developer Program account ($99/year)
- [ ] `eas build --profile production --platform ios`
- [ ] App Store Connect listing + privacy policy URL (needs its own review pass — Apple's App Privacy "nutrition label" is stricter than Play's Data Safety form and requires an explicit App Tracking Transparency declaration)
- [ ] `eas submit --platform ios` (needs an App Store Connect API key)

## Known outstanding (from SESSION_HANDOFF.md, still true unless re-checked)

- [x] ~~Firebase Auth has no persistence configured~~ — false alarm, carried over from a stale handoff note. Checked `src/api/firebase.js` (2026-09-14): `getReactNativePersistence` is already wired into `initializeAuth`. Anonymous sign-in already survives restarts.

## Feed / Feast with Friends (in progress)

- [ ] Friends-first reformat of the feed strip once there are enough real friend connections to test with (deferred - not needed until there's a real friend graph to design against; see TODO comment in `FriendSpin.js`)
- [ ] Firestore security rules for the new `feedPhotos` collection — confirm read/write is actually allowed, or the feed silently stays empty

## Journal photos (2026-09-14)

- [x] User-attached photos on journal entries, local-only by default, with an explicit per-photo "share with friends" toggle. Picker: `expo-image-picker`; local persistence via `expo-file-system`'s new File/Paths API (not the deprecated function-style API — that throws at runtime on this SDK version); sharing uploads to Firebase Storage (`src/api/journalPhotos.js`) and unsharing actually deletes the remote copy, not just hides it client-side. UI lives in `DetailModal.js`'s "Your Reviews" section.
- [ ] Firebase Storage security rules — simpler than first thought: a Storage download URL carries its own access token once generated, so it works for anyone who has the URL regardless of Storage rules. Friends never need direct Storage read access at all - they just load the token-bearing `sharedPhotoUrl` already gated by the existing `journals/{uid}` Firestore rule. Storage rules only need to cover the owner's own read/write - instructions given 2026-09-14, awaiting confirmation it's published in the Firebase console:
  ```
  match /journalPhotos/{uid}/{entryId} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
  ```
- [ ] Known limitation: editing a journal entry's photo while it's already shared doesn't auto-refresh the shared copy - toggling share off/on again re-uploads. Left this way deliberately (re-sharing needs an explicit tap) rather than building silent re-upload-on-edit logic.

## Fullscreen photo viewer (2026-09-14)

- [x] Pinch-to-zoom (1x-4x), zoom maintained until explicitly pinched back down, pan-vs-swipe-to-next-photo disambiguated by speed + edge-proximity per user spec. See `src/components/FullscreenImageViewer.js`. **Needs real on-device testing** - velocity/edge thresholds are reused from CoinSpinner's already-tuned flick threshold as a starting point, not verified against this specific gesture feel.

## Cross-device audit (2026-09-14)

Full agent report has the file/line detail for every item below.

- [x] Real safe-area handling — `react-native-safe-area-context` installed, `SafeAreaProvider` wraps the app, every hardcoded top/bottom padding guess (App.js, FriendSpin.js, HistoryFavoritesOverlay.js incl. its FAB, JournalOverlay.js, FullscreenImageViewer.js) replaced with real `useSafeAreaInsets()` values, deliberate design offsets preserved on top. Fixed 2026-09-14.
- [x] `FabMenu.js` + `EliminationList.js` elevation-vanishing-view bug — pinned to elevation 10 in both style variants, matching the already-established fix pattern. Fixed 2026-09-14.
- [x] `FaveCuisineButton.js`'s PanResponder-inside-ScrollView — added `onPanResponderTerminationRequest: () => false` as a defensive iOS mitigation. **Not iOS-verified** — needs a real device/simulator check once available.
- [x] `DaydreamRaccoon.js` bubble — added `collapsable={false}` as preventive insurance against the same Android bug class already hit (and fixed) in RollingFoodStrip/CoinSpinner.
- [x] Missing iOS shadow properties in `BrowseList.js`, `EliminationList.js`, `SettingsPanel.js`, `FriendSpin.js` — now spread the existing `buttonDepth` helper. Fixed 2026-09-14.
- [ ] Tablet-specific layout — deliberately deferred (user: "worry about tablets later"). Considered a shared scale-utility approach (extending `useVerticalScale`'s existing pattern to width too) instead of a full redesign, since "just scale it to fit" is an acceptable v1 per the user - not built yet, revisit once there's an actual tablet to test against rather than half-applying it now.
- [ ] `maxFontSizeMultiplier` / accessibility text-scaling guard — also deferred, tied to the same "revisit with real devices" reasoning as tablets above. Low risk today since most text sits in flexible containers.
- [ ] `ResultCard.js` stacks ~300px of fixed (non-`vscale`-scaled) vertical chrome — not broken (already inside a `ScrollView`, so nothing is unreachable even on a small phone), just could scroll less on short screens if scaled like the rest of the home screen. Not urgent.

**Low risk, no action needed:** a couple of animated views lack `collapsable={false}` but have safely-pinned elevation (the harmless half of that bug class); two tab-toggle components change elevation between states but route through a component that already remounts on state change (a different, adequate fix); several small decorative dots/handles are sized relative to their own tiny parent control, never a "different phone" risk.

**Clean:** no stale `Dimensions.get()` calls anywhere (consistently uses `useWindowDimensions()`); `buttonDepth`/`neonSelected` helpers already ship correct cross-platform shadow properties, so the shadow gaps above were the exception, not the rule.

## In-app bug reporting (2026-09-14, in progress)

- [x] "Report a Bug" text field in Settings, submits to a new Firestore `bugReports` collection (`src/api/bugReports.js`). One-way mailbox - the app never reads it back.
- [ ] **Firestore security rules for `bugReports`** — need write-only access for any signed-in (anonymous) user, no read/update/delete from the client at all (only the scheduled daily check, running server-side, needs to read/update status):
  ```
  match /bugReports/{reportId} {
    allow create: if request.auth != null;
    allow read, update, delete: if false;
  }
  ```
- [ ] Push the repo to a private GitHub remote — required before the daily scheduled cloud agent can clone/access the code at all. In progress 2026-09-14.
- [ ] Set up the daily scheduled cloud routine (via Claude's `/schedule`) — reads new `bugReports` since last run, investigates, attempts real fixes on a branch (not pushed - user explicitly chose "attempt real fixes unattended" over "propose only"), and produces a daily digest split into: done/awaiting your approval to push, vs. needs your feedback before proceeding. Blocked on the GitHub push above.

## Someday / vision

- [x] Rewards system for completed reviews — v1 shipped 2026-09-14: per-city tier label (🥄 New Taster → 🍴 Regular → 🍜 Local Regular → 🗺️ Food Explorer → 🏆 Local Legend), inline next to each city header in JournalOverlay's "My Reviews" screen. Deliberately per-city, not global - see `src/api/rewards.js`.
- [x] Fancier coin-spin animation — bench built and tuned values applied 2026-09-14 (anticipation dip + micro-bounce enabled, impact squash/stretch left off). See `src/components/CoinSpinner.js`.

### Rewards: region strategy (background thinking, not blocking)

City is the v1 grouping (free, already computed everywhere via `groupByCity`/`cityFromAddress`). Two things flagged 2026-09-14 as worth continuing to think about, since the user travels for food and expects the app's core audience to as well:

- **State/country tagging for each city, without a paid API call.** Most journal entries only carry Google's Nearby Search "vicinity" address (`"{street}, {city}"` - no state/country at all); only manually-searched favorites get the fuller address. But every entry already has raw `lat`/`lng` regardless of source, so a bundled *offline* country/state boundary dataset (simplified GeoJSON, roughly 100KB-1MB) could do a local point-in-polygon lookup with zero network cost and zero per-lookup fee - distinct from Google's paid reverse-geocoding API, which was the wrong comparison to make the first time this came up. Not yet sourced/bundled - real but bounded scope of work whenever this becomes a priority.
- **Keeping it "seamless, not busy" as travel history grows.** The chosen v1 shape (a label riding along on each city's existing header, not a separate summary widget) was specifically picked because it doesn't need a redesign as the number of cities grows - no new list, no new scroll surface, no compressed cross-city number to keep legible. Worth deliberately re-testing this assumption once there's a data point for someone with a genuinely large multi-city/multi-country journal, rather than assuming it holds.

## Industrial design opens (from SESSION_HANDOFF.md)

- [ ] Button/slider edge shimmer — a highlight that reads as light catching a glossy/beveled rim along the EDGE of a button/slider, not corner dots (a corner-dot attempt was tried and fully reverted 2026-08-01 — see git history if picking this back up)

## Background agent outputs to review (2026-09-14)

- [x] **Coin animation bench**: https://claude.ai/code/artifact/5ed1381e-5758-433f-a6a3-26b4c6405329 — tuned by eye and applied to `src/components/CoinSpinner.js`/`src/constants.js` same day. Anticipation dip + secondary micro-bounce enabled; impact squash/stretch left off.
- [ ] **Rewards system mockup**: https://claude.ai/code/artifact/4c3a5549-6c1d-4eb1-adf0-96fca96a00dd — 3 directions mocked up (Taste Rank badge, reviewing streak, milestone celebration toast). Direction 1 (Taste Rank badge) is implemented as a real prototype: `src/api/rewards.js` (new, pure functions) + `src/components/ReviewMilestoneBadge.js` (new) + one added line in `JournalOverlay.js`. This was a best guess at an underspecified one-line idea - treat as a rough draft to react to, not a finished feature.
