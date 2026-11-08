# Session handoff (as of 2026-11-08)

**Start here** when opening a new Claude Code session on Nomnom. `CLAUDE.md` is the stable architecture reference; this file is "where we left off." `TODO.md` is the long-form backlog, but it was last updated 2026-09-19 and is **stale** (see step 4 below).

## Do these first, in order

1. **Check nothing else is mid-edit.** Several Nomnom sessions were open at once on 2026-11-08. Before committing, confirm no other session is still writing to the working tree (ListAgents / ask the user).
2. **Commit the uncommitted work.** As of 2026-11-08 the working tree had ~1,200 uncommitted lines across 17 modified files (App.js, journal.js, FriendSpin.js, MyPlacesHub.js, InviteFriendModal.js, storage.js, SettingsPanel.js, BottomNav.js, firebase.js, places.js, rewards.js, ...) plus new untracked files:
   - `firestore.rules` + `firebase.json` now points at it
   - `src/api/analytics.js` (per-user spin/API-call counters on `users/{uid}`)
   - `src/components/FriendIndexReel.js`
   - `src/dev/fakeJournal.js` (100 fake places for testing Journal at volume)
   - `BUSINESS_PLAN.md` (tiers/pricing notes)
   - `.claude/agents/app-checker.md` (emulator QA agent)
   - Don't commit: `build-preview.log` (consider gitignoring `*.log`), `.claude/worktrees/`.
   Group into sensible commits by feature (`git diff` per file), on `v2-redesign`.
3. **Push the branch - it has never been pushed.** `v2-redesign` exists only on this PC: 100+ commits ahead of `origin/main` (Google Sign-In, iOS setup, Journal/Feast redesign, everything since mid-September). Run `git push -u origin v2-redesign`. This is the single biggest risk in the project right now.
4. **Refresh `TODO.md`** to match reality: check off Google Sign-In (shipped Oct 3-11, incl. persistence fix), At the Table star rating (Oct 11, Nov 4), Journal on its own BottomNav tab, friend-selection grid, iOS Firebase registration + simulator build profile; add the new items below.

## Things to verify before the next release

- **`firestore.rules` is local only, not deployed.** It covers sessions, pings, journals (+ `entries` subcollection), savedLists, bugReports (create-only), cuisineFeedback (create-only), users. It does **not** include `feedPhotos` - add it if that collection is still in use. Before `firebase deploy --only firestore:rules`, diff against the live rules in the Firebase console (deploy replaces them wholesale). Storage rules (`journalPhotos/{uid}`, `bugReportScreenshots/{uid}`) are still unconfirmed too - see TODO.md.
- **`analytics.js` vs. privacy claims.** It writes per-user usage counts to Firestore. Settings copy says "no analytics SDK, no user id," and `docs/privacy-policy.html` Section 4 says no analytics. Technically no SDK, but update the policy and Play's Data Safety form to mention usage counters.
- **Fake journal data** is tagged `fake: true`, excluded from the Firestore mirror in App.js, and its Settings button is meant to be `__DEV__`-only. Confirm that gate before a release build - the developer account is every new user's default friend, so a leak would show in real users' Friends tabs.
- **Version bump** to 1.2.0 is due at EAS build 100 (comment above `version` in `app.config.js`).

## Open work (priority order)

**Play Store launch (Android first):**
- Closed testing: 12+ testers opted in for 14+ days before Production unlocks - it's a clock, start ASAP.
- Play listing: screenshots, description, Data Safety "users can request deletion" = **Yes** (didn't save last time), update "App access" now that sign-in exists, privacy policy needs lawyer review + public URL.
- `eas submit` needs a GCP service-account key (`eas.json` submit config is empty).
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
