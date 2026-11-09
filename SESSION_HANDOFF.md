# Session handoff (as of 2026-11-09)

**Start here** when opening a new Claude Code session on Nomnom. `CLAUDE.md` is the stable architecture reference; this file is "where we left off." `TODO.md` is the long-form backlog, but it was last updated 2026-09-19 and is **stale**.

## State as of 2026-11-09

- All work is committed and `v2-redesign` is pushed to `origin` (rank change 9e8accf, analytics c8e4df5, journal sync v2 a07677a, rules/dev-flag 38c3cec). Intentionally uncommitted: `BUSINESS_PLAN.md`, `.claude/`.
- `firestore.rules` is **deployed** (2026-11-08), including `friendCodes` and `feedPhotos`. Storage rules (`journalPhotos/{uid}`, `bugReportScreenshots/{uid}`) are still unconfirmed - see TODO.md.
- **Build 80 (versionCode 80, 1.1.0) is live on closed testing "Friends Beta"** and confirmed on the user's phone. Release flow: `.build-verify/local-build.sh` via `wsl -d Ubuntu`, copy to `.build-verify/app-vNN-local.aab` (latest v30), then `npx eas-cli submit --platform android --profile closedTesting --path <aab> --non-interactive`. Claude can do all of this; it works.
- `DEV_SEED_FAKE_FRIENDS` in FriendSpin.js is now `false`.

## Do these first

1. **Refresh `TODO.md`** to match reality: check off Google Sign-In (shipped Oct 3-11), At the Table star rating, Journal on its own BottomNav tab, friend-selection grid, iOS Firebase registration + simulator profile.
2. **Phone-verify build 80:** journal migration, a new review syncing, Friends tab, Feast feed, Add a friend by code, "Send in a message" share sheet.
3. **Privacy:** update `docs/privacy-policy.html` Section 4, Settings copy, and Play Data Safety for `analytics.js` usage counters.

## Things to verify before the next release

- **Fake journal data** is tagged `fake: true`, excluded from the Firestore mirror in App.js, and its Settings button is meant to be `__DEV__`-only. Confirm that gate before a release build - the developer account is every new user's default friend, so a leak would show in real users' Friends tabs.
- **Version bump** to 1.2.0 is due at EAS build 100 (comment above `version` in `app.config.js`).

## Open work (priority order)

**Play Store launch (Android first):**
- Closed testing: 12+ testers opted in for 14+ days before Production unlocks - it's a clock, start ASAP.
- Play listing: screenshots, description, Data Safety "users can request deletion" = **Yes** (didn't save last time), update "App access" now that sign-in exists, privacy policy needs lawyer review + public URL.
- `eas submit --profile closedTesting` works (key at C:/Users/Isaac/keys/nomnom-play-submit.json, track "Friends Beta"); Claude can upload builds.
- Chat has no block/report/remove-friend - fine for closed testing, likely needed before public release.

**Needs a real build / second device to verify:**
- Feast "Propose a place" + mid-bracket chat icon (two-player test).
- https App Links + Play install-referrer auto-join. Switch `public/join/index.html`'s Play link to the real listing at launch.
- Google Sign-In on a release-signed build.

**Bugs:**
- Distance filter doesn't reach farther spots. `rankby=distance` attempt broke search and was reverted; next try: multiple ring-radius queries, deduped, verified on a dev build first.
- Feast join slow on devices with no cached location (fallback/timeout or a "Getting your location..." indicator).
- Multi-photo journal entries can't be shared with friends; per-dish ratings with an averaged overall rating not built.

**Design (do with the user watching on-device):**
1. Feather-drift food animation replacing `RollingFoodStrip` - decide whether its gestures carry over.
2. Then BottomNav sliding highlight + full-screen swipe between tabs (sequenced after #1 to avoid gesture conflicts).
3. Roll frosted-glow button style beyond BottomNav, one button at a time.

**API-cost options awaiting the user's approve/reject:** persist `places.js`'s `cachedPool` to AsyncStorage; cache Place Photos app-side. (`analytics.js` now measures cost per spin - see `BUSINESS_PLAN.md` - which can inform these.)

**Later:** App Store ($99/yr Apple account), Facebook login, alternative reveal animations (paid-tier idea, see BUSINESS_PLAN.md), Google Maps saved-places import, tablet layout, slogan, ads.

## Dev environment notes

- **Expo Go first** for UI/logic changes; real builds only for native config (sign-in, App Links, install referrer, new native modules).
- **Builds:** WSL2 local build (`.build-verify/local-build.sh`, gitignored) is the free default; EAS cloud free tier is 15 Android builds/month.
- **Emulator:** as of 2026-11-07 the app runs on a local Pixel 9 Pro XL emulator (commit c4860fd); the `app-checker` agent smoke-tests builds across emulated phone sizes.
- **Physical phone over Expo Go:** use tunnel mode (`npx expo start -c --tunnel`) - the PC's Wi-Fi tends to hop to a corporate network, breaking LAN mode. In a non-interactive shell, get the URL from `curl -s http://127.0.0.1:4040/api/tunnels` (`public_url` -> `exp://<host>`).
