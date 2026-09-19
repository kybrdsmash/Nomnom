# Nomnom TODO

## Feast with Friends: slow "waiting for friend to join" on a device with no cached location (2026-09-19, logged, not fixed)

- [ ] User report: joining a Feast session took a very long time on a tablet. Root cause traced (not yet fixed): `joinSession` can't fire until the guest device has a resolved `location` - App.js seeds `location` instantly from `Location.getLastKnownPositionAsync()` before falling back to the slower `getCurrentPositionAsync()` (see the 2026-09-15 "slow initial locate" fix), but a device that's never been located before (or is WiFi-only, no GPS chip - this tablet) has nothing cached to seed from, so it falls straight through to a genuinely slow cold fix.
- [ ] **Confirmed environmental, not a regression**: the SAME tablet joined much faster on a second try, once it had a cached last-known position from the first attempt.
- [ ] Not fixed yet - App.js's location-acquisition effect is shared by the entire app (not just Feast), so changing its accuracy/timeout behavior needs real testing across every screen that depends on `location`, not a speculative tweak. Real options to weigh next time this is picked up: an explicit lower `Location.Accuracy` tier for the first fix specifically, a timeout that proceeds with a coarse/IP-based location rather than blocking indefinitely, or just a clearer "Getting your location…" indicator on the join screen so the wait doesn't look like something's broken.

## Feast with Friends: "Propose a place" + earlier chat access (2026-09-19, shipped, needs on-device verification)

- [x] "Propose a place": either player, only while it's NOT their turn, can flag one still-live bracket spot (`proposeSpot` in `friendSession.js`, a new `proposedId`/`proposedByUid` pair on the session doc) without spending a turn. The other player resolves it the next time their turn comes around - either "Agree" (`agreeToProposal`, ends the bracket immediately with that spot as winner) or the normal ✕ elimination (a soft decline, which also clears the proposal). Reset alongside `spots`/`eliminatedIds` on `startPlaying`/`requestNewBracket` so a stale proposal never survives into a new round.
- [x] Chat (`ScheduleMealModal`) used to only be reachable from the winner screen - user report: "no way anyone knows chat messaging is available until they're already at the calendar." Moved the modal instance out of the `step==='done'` branch so the SAME modal/state is reachable via a new chat icon next to the turn banner during the live bracket ('playing' step) too. The modal's calendar-link section is guarded on `spot` being present (it's `null` until there's a winner) so chatting/proposing a time mid-bracket doesn't hit an undefined-spot crash.
- [ ] Built and installed same session; needs a real two-device test of propose/agree/decline and the mid-bracket chat icon before considering this fully verified (only single-device screenshot/logcat checks done so far, not a live two-player round-trip).

## BottomNav: sliding highlight + full-screen swipe navigation (2026-09-18, scoped, sequenced after feather-drift)

- [ ] User request: the active-tab highlight currently snaps instantly between icons (confirmed - no animation exists; `SlidableSegmented`'s name is misleading, it only means "drag-to-select," its own active-segment styling snaps too, deliberately, to dodge an Android stale-paint bug). Want a persistent highlight that visibly SLIDES between tab positions instead, so it's always obvious where you are and where you're going. Scoped as contained, low-risk, self-contained-to-`BottomNav.js` work - an `Animated.Value` driving the highlight's x-position between each tab's slot.
- [ ] Also requested: swipe gesture to move between the 5 destinations (Home/Places/Feast/History/Settings), not just tapping. **Decided: full-screen swipe (like a classic tab-pager) is the target, not a smaller bar-only swipe** - user's explicit pick when asked to choose between the two.
- [ ] **Deliberately sequenced AFTER the feather-drift food animation (see the entry below), not before or alongside it.** Reasoning, from the user directly: RollingFoodStrip (today's horizontal food strip, with its own background scrub-gesture covering most of the Home screen's width) is going away once feather-drift ships, and until then a full-screen swipe gesture would fight it for touch ownership - exactly the "who owns this touch" bug class this codebase has hit before (SlidableSegmented's own history, FaveCuisineButton, etc.). Once RollingFoodStrip is actually gone, that specific conflict disappears and a full-screen swipe becomes much safer to add. The coin's flick-to-spin and the star-rating drag gestures still exist independently and need scoping around either way, but are smaller/more localized than the food strip was.
- [ ] User also flagged a secondary, not-yet-scoped need: once food items fall/drift instead of rolling in a strip, there'll need to be SOME way to navigate/interact with them (today's RollingFoodStrip has tap-to-pause, swipe-to-toss, long-press-for-detail, scrub-to-rewind - see its own file for the full feature list being replaced). Explicitly secondary to the 5-item bottom nav in the user's own words ("thats secondary in my mind to the primary functions") - don't let this block the nav work, but don't forget it either when feather-drift's own scope gets defined.

## Feather-drift food animation - NOT attempted yet, needs a real design pass with device access (2026-09-18)

- [ ] Design canvas landed on a specific physics spec for replacing the food UI: food spawns from the thought-cloud (`DaydreamRaccoon.js`), drifts to screen-center, then randomly branches left/right at a random height below the travel selector, following a parametric ellipse (`x(θ) = xc ∓ a·cos(θ)`, `y(θ) = yc + b·sin(θ)`, a=2b; a=30/b=15 for in-flight wobble, a=120/b=35 for the single final exit arc), gravity-correct swoop direction, translucent, falls BEHIND the buttons (drives the glass depth effect), only 1-2 visible at once, and must fully exit the screen before fading (never fades mid-frame). Full detail/reasoning lived in `.design-scratch/FoodFeatherDrift.dc.html` and `canvas.json`'s annotations - that scratch folder is gitignored, so if it's gone by the time this is picked up, the spec above is the durable summary.
- [ ] **Deliberately not implemented this session**, despite being part of the same "build everything" pass as the bottom nav / My Places hub / button styling above. Reasons, so a future pass doesn't have to re-discover them: (1) the animation this replaces, `RollingFoodStrip.js`, is not a simple visual - it's ~650 lines carrying a lot of hard-won, user-tested interactive behavior (tap-to-pause, swipe-to-toss, long-press for a food detail view, a background scrub gesture with a rewind/fast-forward history buffer, and a documented `Animated.loop` native-repeat bug workaround) built up over many rounds of real feedback. A vertical feather-fall from the thought-cloud is a fundamentally different layout (needs real screen-wide coordinates - the coin's position, the thought-cloud's position, button z-order - not the fixed-height horizontal strip RollingFoodStrip lives in) and (2) there's no way to visually verify an RN `Animated`-based reimplementation of an SVG `offset-path` effect without a human on a real device watching it - a wrong-looking (or gesture-losing) unattended replacement risks being strictly worse than what's there now, not just imperfect. (3) React Native has no `offset-path` equivalent at all - it would need to be hand-built as a sequence of `Animated.timing`/`interpolate` keyframes evaluating the ellipse equations above, checked against the exact device this already has documented Android elevation/GPU-compositing issues on (Galaxy S20 reports referenced in `RollingFoodStrip.js`/`App.js`).
- [ ] Real next step: decide together (with the user able to see it live) whether RollingFoodStrip's interactive gestures get ported onto the new vertical motion, get dropped in favor of the pure visual, or the two coexist as separate layers - that's a product call, not one to make unilaterally while building unattended.


Living list, kept in the repo so it survives across sessions (unlike chat history). Add to it as things come up; check items off as they land.

## Button styling: frosted glass + desaturated glow (2026-09-18, dual-tone edge picked; first real-app application shipped)

- [x] User request: buttons look "nice" today but not "interesting" - wants a variant that keeps the neon-glow identity but swaps today's solid accent fill + fully-saturated glow (`neonSelected` in `constants.js`: `shadowOpacity: 0.9`, glow color at `hslToHex(h, 85, 28)` off the accent hue) for a translucent "frosted glass" fill (blurred, semi-transparent) with the same glow desaturated to roughly 30-40%.
- [x] Mocked up 3 directions in `.design-scratch/ButtonGlowConcepts.dc.html`; **dual-tone gradient-edge** was the final pick over plain cool/warm variants.
- [x] Shipped as `frostedGlow()` in `constants.js` (desaturated companion to `neonSelected`, ~40% shadowOpacity + lower-saturation hues off the same accent hue) + a real `expo-blur`/`expo-linear-gradient` implementation in `BottomNav.js` - both packages were ALREADY real dependencies (expo-blur already proven live in `CuisineDropdown.js`), so this needed no new native module and no extra build risk. The ring uses the app's own existing `colors.neon`/`colors.gold` pair rather than inventing new mockup-only colors, so it follows whatever accent the user has picked in Settings > Appearance instead of being hardcoded cyan/gold.
- [ ] **Deliberately NOT applied anywhere else yet** (FabMenu, mode toggle, cuisine bubbles, FaveCuisineButton, etc.) - this batch was built and shipped unattended overnight with no way to visually verify on a real device before the user woke up, so the blast radius was kept to one new, low-legacy-risk component (BottomNav, added this same redesign) rather than touching the many existing buttons that already carry their own hard-won Android elevation/clipping fixes (see FabMenu.js/FilterPanel.js/CuisineDropdown.js comments). Rolling this out further should happen with the user able to check each one on-device, not in one more unattended batch.

## Someday: import Google Maps saved places (2026-09-17, scoped, deliberately not started)

- [ ] User request: let someone bring their existing Google Maps favorites/saved places into Nomnom on first use, since that's where most people already have a list before ever trying this app. No API exists for this - the only path is the user manually exporting via Google Takeout, then importing that file into Nomnom.
- [ ] Real shape of the work, confirmed via research (not guessed): Takeout gives TWO different formats depending on what's exported - named lists ("Want to go", custom lists) export as **CSV with no coordinates at all**; "Starred places" exports as **Saved Places.json**, which is actually **GeoJSON** (name + coordinates), with a known Google bug where some entries have broken `[0,0]` coordinates.
- [ ] Needs `expo-document-picker` (new native module - another build cycle) for the user to pick their exported file, plus a parser tolerant of both formats and bad/missing data.
- [ ] **The real cost isn't parsing - it's resolution.** Neither export format gives a Google Place ID our app's spot shape needs (photo/rating/price/etc, see `shapeSpot`/`shapeSearchResult` in `places.js`/`placeSearch.js`). Each imported entry needs a Google Places **Text Search** (a paid API call, unlike the Nearby Search calls already used liberally) to resolve "Joe's Pizza, 123 Main St" into a real place - and text matches aren't always exact (a same-named chain nearby could resolve wrong), so ambiguous matches need a review/confirm UI step, not silent auto-accept. Someone with 100 saved places = 100 paid searches + a review flow.
- [ ] Deliberately on hold - the app already has a lot of surface area (per the same conversation this was scoped in); adding an onboarding-import flow competes with the priority of making the EXISTING app feel more seamless first, not more feature-rich.

## Friend-spin join links now use real https App Links (2026-09-16)

- [x] User report: the join link/code sent via "Share" wasn't clickable - `ExpoLinking.createURL('join', ...)` generates a `nomnom://join?code=X` custom-scheme URL, and most messaging apps (SMS, WhatsApp, etc.) only auto-linkify `http(s)://` URLs, so it just showed as plain text.
- [x] Fixed with a real Android App Link: `public/.well-known/assetlinks.json` (the app's package name + SHA-256 signing cert fingerprint, from Play Console → Protected with Play → Manage Play app signing → classical key) hosted on Firebase Hosting (`firebase deploy --only hosting`, project `nom-nom-83f11`, live at `https://nom-nom-83f11.web.app`) + `app.config.js`'s `android.intentFilters` with `autoVerify: true` for that same host. `src/constants.js`'s `JOIN_LINK_BASE_URL` is the single source of truth for the host - **must stay in sync by hand** with both `assetlinks.json`'s implicit domain and the intentFilters host in app.config.js if this ever changes (e.g. a custom domain later).
- [x] `public/join/index.html` - fallback landing page for anyone without the app installed (or if App Link verification hasn't landed yet): shows the code, attempts the `nomnom://` deep link as a fallback, and links to the Play Store (currently the closed-testing opt-in link, since Production isn't live yet - **switch this to the real Play Store listing once the app actually launches publicly**, the testing link won't work for non-testers).
- [ ] **Needs a fresh native build to take effect** - `intentFilters` is baked into the compiled AndroidManifest at build time, so this doesn't work until the next build ships (unlike the Firebase Hosting/assetlinks.json side, which is already live independent of app builds).
- [ ] Not yet verified end-to-end on a real device (tap a shared link from another device with the new build installed, confirm it opens the app directly instead of a browser) - Android's own App Link verification can also take a little time to complete after first install.
- [ ] iOS equivalent (Universal Links, `apple-app-site-association` file) not done - Android-only for now, matching the rest of this project's "Android first" focus.

## Join links: auto-join for friends who don't have the app yet (2026-09-17)

- [x] User report: the App Link above only helps someone who already has Nomnom installed. A friend installing for the first time landed on `public/join/index.html`, had to remember/re-type the 4-letter code by hand after installing - "a huge barrier."
- [x] Cross-platform join (Android host ↔ iOS guest or vice versa) was already fine - confirmed `joinSession()` in `friendSession.js` is a plain Firestore doc read/write with no OS-specific logic at all. Nothing needed there.
- [x] Added `expo-application` (official Expo SDK module, no config plugin needed - autolinked) for `Application.getInstallReferrerAsync()`, Android's Play Install Referrer API. App.js reads it once per install (gated by `storage.js`'s `loadInstallReferrerChecked`/`saveInstallReferrerChecked` - the referrer string keeps answering the same value on every call, so without the gate, leaving a session and relaunching later would silently rejoin it) and feeds a found `code=` into the same `pendingJoinCode` path the URL-based join already uses.
- [x] `public/join/index.html` now offers two links: **"Install Nomnom & join automatically"** (the Play Store *listing* URL with `&referrer=code%3DXXXX` - confirmed via research this is the ONLY link shape Play preserves through to `getInstallReferrerAsync()`) and **"First time? Get tester access here"** (the existing `/apps/testing/...` opt-in URL, which does NOT carry the referrer through). Deployed live already (`firebase deploy --only hosting`).
- [ ] **Closed-testing caveat, not fixable from our side**: a brand-new tester needs the opt-in link ONCE, then has to come back and tap the auto-join link separately - two taps the first time only. Once this app reaches Play Production, the opt-in step disappears entirely and it's always one tap. Worth re-explaining this to friends until then.
- [ ] Known flake, not our bug: a managed/enterprise Google account on the installer's phone resets the referrer token (documented Play Store behavior) - would silently fall back to manual code entry for that specific device.
- [ ] **Needs a fresh native build to take effect** (`expo-application` needs to be in the compiled binary) - not live until the next EAS build ships and gets verified via the usual bundletool/adb crash-check process.
- [ ] iOS still has no deferred-deep-link path (Apple only supports it for paid Search Ads installs; Firebase Dynamic Links, the old free option, was sunset in 2025) - true one-tap join on iOS would need a third-party service like Branch.io. Deliberately deferred; iOS friends still need to paste the code by hand for now.

## Search: distance filter doesn't reach farther spots (open, reverted once already)

- [ ] User report: increasing the travel-distance filter significantly still only returns nearby options. Root cause: Google's Nearby Search `radius` param uses default *prominence* ranking, not an even geographic spread - in a dense area the ~60-result cap (Google's own hard limit) can fill up entirely with popular places clustered near the center regardless of how large `radius` is, so farther genuine matches never make it into the response at all.
- [ ] First fix attempt (switching `searchOnce` to `rankby=distance`, removing `radius`, enforcing the mile ceiling client-side) shipped and immediately broke live search - "zero spots found" on every spin, screen appeared frozen. Reverted same day (`git log` - "Revert rankby=distance nearbysearch change") before root-causing exactly why; suspects include a Places API constraint not accounted for, or `applyTypeAllowlist`/downstream filtering behaving differently against distance-ranked vs. prominence-ranked results. Not confirmed.
- [ ] Needs a safer next approach, verified against the real API (via a preview/dev build, not shipped straight to production) before it ships again - e.g. multiple ring-radius queries (progressively larger `radius` values, deduped) instead of switching ranking mode entirely, so a bug can't take down basic search the way this one did.

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

- [x] Pinch-to-zoom (1x-4x), zoom maintained until explicitly pinched back down, pan-vs-swipe-to-next-photo disambiguated by speed + edge-proximity per user spec. See `src/components/FullscreenImageViewer.js`. Confirmed working on-device 2026-09-14 after two real bugs found via live testing: (1) an outer Pressable was eating the first finger of every pinch before a second finger could join it - consolidated tap/pinch/pan/swipe into one PanResponder that claims every touch itself; (2) FlatList's native ScrollView recognizer could still interrupt mid-pinch despite `scrollEnabled={false}`, and sequential (not simultaneous) two-finger lift-off produced a phantom trailing "tap" that dismissed the viewer right after a successful zoom - fixed with `onPanResponderTerminationRequest: () => false` (same pattern as FaveCuisineButton.js) plus a short cooldown that ignores a stray tap-like release immediately after a real pinch/pan.

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

- [x] "Report a Bug" in Settings, submits to a new Firestore `bugReports` collection (`src/api/bugReports.js`). One-way mailbox - the app never reads it back. Originally an inline text field in the floating Settings panel; moved 2026-09-14 to its own popup modal (`src/components/ReportBugModal.js`) after the keyboard kept covering the inline field - root-caused to RN's `KeyboardAvoidingView` "position" behavior measuring its shift relative to its immediate parent, which came out wrong nested that deep inside the panel's absolutely-positioned wrapper. A `Modal` renders at the screen root, so the same keyboard-avoidance works correctly there instead.
- [x] Optional screenshot attachment (2026-09-16) - "Add a screenshot" picks from the photo library, uploads to Storage under `bugReportScreenshots/{uid}/{timestamp}.jpg` (same pattern as `journalPhotos.js`), and links the download URL on the Firestore doc as `screenshotUrl`. Uploaded before the Firestore doc write so a doc never references a failed upload.
- [ ] **Storage security rule for `bugReportScreenshots`** - needed for the screenshot upload above to actually work (Storage denies all reads/writes by default until configured), same shape as `journalPhotos`' rule below:
  ```
  match /bugReportScreenshots/{uid}/{filename} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
  ```
- [ ] **Firestore security rules for `bugReports`** — need write-only access for any signed-in (anonymous) user, no read/update/delete from the client at all (only the scheduled daily check, running server-side, needs to read/update status):
  ```
  match /bugReports/{reportId} {
    allow create: if request.auth != null;
    allow read, update, delete: if false;
  }
  ```
- [x] Push the repo to GitHub — done 2026-09-14, `https://github.com/kybrdsmash/Nomnom`.
- [x] Daily scheduled cloud routine created 2026-09-14: https://claude.ai/code/routines/trig_01MujHHJv6VsPvHunoYzNLak — 9am PT daily, reads new `bugReports`, attempts real fixes on a pushed branch (not merged), or flags `needs-feedback`; ends with one digest message. Firebase Admin credential lives as environment variables on the `Default` cloud environment (`FIREBASE_ADMIN_PROJECT_ID`/`FIREBASE_ADMIN_CLIENT_EMAIL`/`FIREBASE_ADMIN_PRIVATE_KEY`), not embedded in the routine prompt.
- [ ] Confirm the `bugReports` Firestore security rule (write-only for clients, below) is actually published in the Firebase console — given as text 2026-09-14, not yet confirmed applied:
  ```
  match /bugReports/{reportId} {
    allow create: if request.auth != null;
    allow read, update, delete: if false;
  }
  ```

## Play Store submission loose ends (2026-09-14)

- [ ] Data Safety form's "Do you provide a way for users to request that their data is deleted?" question didn't save (confirmed via the exported CSV - all three options came back blank). Should be **Yes** (privacy policy Section 13 already commits to deleting data on request via email). Re-enter Data safety editing from the main App content page (not in-flow back navigation) and re-answer it, in the "Data collection and security" step alongside the account-creation-methods question.

## Play Store content rating / UGC gap (2026-09-14)

- [ ] **No block/report/moderation on the schedule-a-meal chat** (`sendChatMessage` in `src/api/friendSession.js`) — Play Console's content rating questionnaire was answered honestly: no ability to block users, no ability to report users/content, no chat moderation. Chat is scoped to matched friend-spin players only (never strangers), which is why we're submitting as-is rather than blocking the initial closed-testing release on this - but if Google comes back requiring it before approval, or before any wider/public release, build at minimum: a "remove friend" action that also cuts off their chat/shared-photo access. Decided 2026-09-14 to prioritize getting the testing link out over building this preemptively.

## Sign-in (2026-09-14, planned fast-follow after initial closed-testing release)

- [ ] Google Sign-In — realistic near-term add, Firebase has first-class support. **Must be implemented via Firebase account *linking* (`linkWithCredential`), not a separate fresh sign-in** - this upgrades the existing anonymous user's UID to also carry a Google identity rather than creating a new one, so a tester's existing journal/history/friends (all keyed by that same anonymous UID already) carry over invisibly instead of being lost. Confirmed with the user this is the hard requirement before building it.
- [ ] Facebook Login — also realistic (Firebase-native), but needs a Facebook Developer app + Meta's app review process first, more setup overhead than Google.
- Instagram — not viable as a consumer "sign in with Instagram" option; Instagram's API is scoped to Business/Creator use cases, not general user login. Ruled out.
- TikTok — possible but meaningfully more work: not a built-in Firebase Auth provider, would need TikTok's own Login Kit plus a small backend (cloud function minting a Firebase custom token). Deferred, not ruled out.
- Play Console's "App access" declaration reflects the SUBMITTED BUILD, not future plans - answered "No, all functionality available without special access" for the initial closed-testing release since sign-in isn't built yet; update this declaration on whichever future release actually adds it.
- [ ] Ads - user wants to enable eventually; answered "No" on Play Console's Ads declaration for now (accurate for the current build). **When ads are actually added**, update three things together, not just the Play Console toggle: the Ads declaration, the Data Safety form, and `docs/privacy-policy.html` (Section 4 currently states plainly "Nomnom includes no advertising or analytics SDK of any kind" - that becomes false the moment ads ship and needs a real rewrite, not just a date bump).

## Randomizer experience packs (2026-09-15, big vision item, not started)

The subscription's actual value proposition, per the user: not gating the app's core function, but selling *how the reveal feels*. Same odds/result underneath, always - purely cosmetic, so this is an honest monetization model, not a gambling-adjacent manipulation of outcomes.

- [ ] **Current coin stays the free default** experience - what's live today after the 2026-09-15 bug fix (blank-coin-during-spin issue, food icons now render throughout the flip) is the baseline everyone gets free.
- [ ] **Additional themed "reveal" animations as real, distinct content** - not palette-swaps of the same coin physics. User's own examples, verbatim: a coin shooting sparks and landing perfectly "like a ballerina," a coin that lands "like a boulder crashing into soft dirt," a coin that flips and lands into a puddle like water. Each needs its own genuinely different motion/impact language, not just a new skin on the current bounce/roll/precession curve.
- [ ] **Not coin-specific long-term** - user explicitly said "dice rolling experience, or whatever odds-determining method they prefer" - the architecture should treat "how the result gets revealed" as a swappable/pluggable thing (a registry of reveal animations with a common interface: trigger, duration, done-callback), not something hardcoded to CoinSpinner.js the way it is today. Building the SECOND reveal type is the point where this abstraction actually needs to exist - don't build it speculatively before then.
- [ ] **Unlock model**: sample/preview other packs for free, pay to unlock. Exact mechanism (subscription-gated vs. one-off per-pack purchase) not decided - revisit once [[sign-in]] (needed for purchases to follow a person across devices) and Play Billing are actually being built.
- [ ] User's stated emotional target for ALL of these: "like opening a present - can't wait to see what's inside." This is the bar each reveal animation needs to clear, not just "looks nice."
- Building approach when this gets picked up: use the same live-tunable browser Artifact bench pattern already proven for the current coin (see the 2026-09-14 coin animation bench entry above) rather than blind iterate-and-rebuild-on-device - this scales especially well here since MULTIPLE distinct animations need tuning, not just one.

## Unified journaling / "At the Table" (2026-09-15)

Both the spot-detail "Journal" compose box and the new live-at-the-meal
capture flow now share one format instead of DetailModal's old single-photo/
single-note form.

- [x] **`src/components/MomentsEditor.js`** — shared, controlled (`moments`/
  `onChangeMoments`) editor: a leading text-only note, then any number of
  photo-on-top/text-below blocks, two separate "+" controls (Add a photo /
  Add more text — deliberately not one combined control, per user spec), a
  mic button per block (OpenAI Whisper, `src/api/transcribe.js`, needs
  `EXPO_PUBLIC_OPENAI_API_KEY` — cheapest-tier `whisper-1` today,
  `gpt-4o-mini-transcribe` is a same-endpoint drop-in at half the price if
  worth the swap later). Used by both `AtTheTableCompose.js` and
  `DetailModal.js`'s own compose box.
- [x] **"At the Table"** — third Journal tab (Mine / Friends / At the Table),
  quick capture while still at the meal: geolocation-assisted place lookup
  (tight 0.15mi radius) or manual search, an optional low-key occasion
  dropdown (tag icon, not an always-visible field — no guilt for skipping
  it), autosaves a single local draft (`storage.js`) so closing/reopening
  the app resumes exactly where it left off. Deliberately no star rating —
  see the new rating request below, not yet decided whether that changes
  this.
- [x] Fullscreen viewer extended (`noteTexts` array, not a single `noteText`)
  to swipe through an entry's whole photo set together, each photo paired
  with its own text — falls back to the last real blurb when a later photo
  has none (carry-forward fill), per user spec.
- [x] `KeyboardAvoidingView` added to both compose surfaces — text inputs
  were getting covered by the keyboard when scrolled low (same root cause
  class as `ReportBugModal`'s earlier fix: needs to be a Modal or otherwise
  not nested deep inside an offset container for the shift math to work).
- [x] Renames: "Your Reviews" → "My Journal" → just **"Journal"** (has
  Mine/Friends/At the Table tabs already, "My" was redundant per user).
- [x] Detail-page action row (Favorite/Try later/Share/Send) is icon-only
  now, one row, no text labels/wrapping.
- [x] Defensive fix: `useAudioRecorder` creates a real native object on
  mount (not lazily on first tap) — wrapped each `MicButton` in a small
  error boundary (`MicButtonBoundary`) after this crashed the ENTIRE
  compose form in one report. If expo-audio's native module isn't actually
  available (stale Metro/Expo Go cache right after adding the dependency is
  the leading suspect, not confirmed), voice-to-text just silently
  disappears instead of blocking text/photo entries.
- [ ] **Known gap**: friend photo-sharing (the "visible to friends" toggle)
  only works on the OLD single-photo entry shape — not wired up for
  multi-moment entries yet (would need per-moment share state, doesn't
  exist).
- [ ] **Per-photo/moment star rating** (2026-09-15, requested, not started)
  — each moment should carry its own optional 1-5 rating (quality of that
  specific dish/item), and the entry's overall rating should default to the
  average of whichever moments have one set, while still being manually
  overridable. Needs: a `rating` field added to the moment shape (`newMoment`
  in `MomentsEditor.js`), a small star row per moment (behind a `showRatings`
  prop so `AtTheTableCompose` can keep opting out, since a rating pressures
  against its "fast note, not a formal review" intent — flagged for the user
  to confirm whether they actually want it there too), and an auto-vs-manual
  toggle on the overall rating (recompute from the average unless the user
  has directly touched the overall stars themselves, with some way back to
  "auto" if they want it).

## Someday / vision

- [ ] **Slogan** (2026-09-15) — user is leaning toward "A better food app"
  but still deciding; flagged as vague/comparative (better than what?)
  versus the feature-graphic line already in use ("Can't decide where to
  eat?"), which names the actual problem solved. Alternatives floated: "The
  food app that actually picks for you" / "No more scrolling. Just eat."
  Revisit once the user has thought on it more - not applied anywhere yet.
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
