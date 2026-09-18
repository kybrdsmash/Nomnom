# V2 Redesign — Build Changelog

What to actually test for on your phone, build by build. Newest at the top. Each entry lists what's NEW in that specific build; everything from earlier entries is still there too (this is cumulative, not a diff).

## versionCode 24 — BottomNav highlight now slides between tabs

The active-tab highlight used to snap instantly between icons - tap Places, it just teleported there with no sense of motion. It now animates: one shared highlight slides smoothly to whichever tab you tap, instead of each icon carrying its own on/off style. Static resting-state confirmed unchanged (screenshotted, matches v23 exactly) - the actual sliding motion needs to be checked live on your phone by tapping between tabs, since that can't be verified from a screenshot.

Full-screen swipe-to-navigate between destinations is the agreed next step after this, but deliberately held until the food-drift animation replaces RollingFoodStrip (removes a competing gesture surface first) - see TODO.md.

---

## versionCode 23 — Fix: grey box under BottomNav's active tab (built via new local pipeline)

One more round of the same "grey box" hunt from v18, caught after you spotted it live: the Home tab (the active one) still showed a small grey box under its icon even after v18's fix. Root cause: Android's `elevation` shadow always renders plain grey/black no matter what color you ask for via `shadowColor` - `shadowColor` is iOS-only. `frostedGlow()`'s "desaturated colored glow" idea silently does nothing on Android; the grey smudge WAS that shadow, just rendering as elevation always does. Every other "selected" button in this app has the same grey shadow - it's just usually hidden by an opaque background. Fix: the active tab no longer gets an elevation shadow at all (it still gets the real color signal - the border ring and translucent fill), so it reads as a clean lit glass tile instead of a lit tile sitting in a shadow-box.

**Also from tonight:** EAS's free-tier Android build quota (15/month) ran out mid-session (versionCode 19 never even got to build). Rather than wait 12 days or pay, we set up a fully local build pipeline instead - WSL2 + Ubuntu + JDK 17 + Android SDK/Gradle, driving the same `eas build --local` machinery but running the actual compile on this machine for free. It works end-to-end now (confirmed: this exact build, v23, compiled, bundled, signed, and installed with zero cloud credits used) and is the new default going forward - see the Expo-Go-first workflow note in TODO.md for when we'll still reach for a real cloud/local build vs. just testing in Expo Go.

Confirmed clean by installing v23 and screenshotting Home live - the grey box is gone, only the border/fill glow remains on the active tab.

---

## versionCode 18 — Fix: old Settings gear was hiding BottomNav's Home icon

Caught this by actually installing v17 and screenshotting it before handing off (rather than just shipping the diff blind) - the pre-existing standalone Settings gear button (bottom-left, predates this whole redesign) sits almost exactly on top of BottomNav's Home icon. Its solid circle was fully covering the Home icon, so the nav bar visually looked like it had two Settings gears and no Home button at all.

**Fix:** that old gear button is now hidden whenever BottomNav is showing (which is always, on Home) - BottomNav's own Settings icon already opens the exact same panel, so nothing is lost. The old hamburger (FabMenu, top-right) is unaffected - it doesn't overlap anything and stays as a known gap for a later pass.

Confirmed by actually installing v17, screenshotting the live Home screen, and finding this bug there. v18 has since been installed and screenshotted too - Home icon shows correctly now, no more duplicate gear.

---

## versionCode 17 — Home cleanup + reachability pass (built overnight, unattended)

You said to just build everything in one go and check it in the morning — this is that batch. Built and crash-checked on-device without a check-in, so look everything over carefully.

**New in this build:**
- "Feast with Friends" button removed from the Home screen's bottom controls — it was a redundant path to the same place the new Places/Feast nav icons already reach.
- Distance slider removed entirely. You now just tap the minutes readout and type a number (dotted-underline, tap-to-edit) — the old drag slider is gone. (Backed by the travel-time-budget research from earlier: people plan by time, not distance, and switching travel mode already changes how far that time reaches.)
- The Fave 1/2/3 cuisine-preset button moved out of the Cuisines dropdown and now sits directly next to the collapsed "Cuisines" trigger on Home — you can hot-swap a saved cuisine preset in one tap without ever opening the dropdown.
- The bottom nav pill is now real frosted glass — dual-tone (neon-to-gold) gradient ring around a blurred, theme-tinted panel, picked over the plain cool/warm directions from the design review. The active tab's fill is translucent now (not solid) with a softer, desaturated glow instead of the old full-strength neon halo, and its icon lights up in the neon accent color. This is the ONE place the frosted treatment landed — deliberately not rolled out to any other button yet (FabMenu, mode toggle, cuisine bubbles, etc. all still look exactly as before) since those already carry their own tuned Android fixes not worth touching blind overnight. See TODO.md for why.

**Known gaps — still not built, don't report as bugs:**
- Frosted glass is BottomNav-only for now — every other button in the app is unchanged.
- No feather-drift food animation yet — RollingFoodStrip is still the old rolling-icon strip. This turned out to be a much bigger, riskier change than it looked (it'd mean either rebuilding or dropping a lot of RollingFoodStrip's existing tap/swipe/long-press/rewind behavior) — see TODO.md for the full reasoning on why this got deliberately left for a session where you can watch it live on-device.
- No Cluster-Height-C repositioning of the Home layout — the changes above are the safe, self-contained subset of that increment; a full layout restructure was intentionally deferred rather than risked unattended (see TODO.md).
- Old hamburger (FabMenu) still on screen next to the new bottom nav.

---

## versionCode 16 — Bottom nav shell

**New in this build:**
- Persistent 5-icon floating pill nav at the bottom of the Home screen: Home, Places, Feast, History, Settings. Each is 1 tap.
- Custom "Places" icon (skyline + gold pin, the one approved in the design review).
- Old hamburger (FabMenu) and its individual buttons still present too, for safety — not yet retired.

**Known gaps — don't report these as bugs yet, they're just not built:**
- "Places" routes to the plain old Favorites screen — no tab selector for Favorites/Try Later/Journal yet (that's the next build).
- No frosted-glass buttons anywhere yet.
- No feather-drift food animation yet — RollingFoodStrip is unchanged.
- Home screen layout is unchanged (no Cluster Height C repositioning yet).
- Old hamburger menu and old Settings entry point still on screen alongside the new nav (not yet cleaned up).

---

## versionCode 15 — Join-link auto-join + app name fix (pre-redesign baseline, tagged `v1-pre-redesign`)

- Android install-referrer: a friend without the app yet can tap the referrer-carrying Play link and land straight in your session, no manual code entry.
- App's home-screen label fixed from "Nomnom_App" to "Nomnom".
