# Nomnom TODO

Living list, kept in the repo so it survives across sessions (unlike chat history). Add to it as things come up; check items off as they land.

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
