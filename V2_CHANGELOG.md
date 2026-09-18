# V2 Redesign — Build Changelog

What to actually test for on your phone, build by build. Newest at the top. Each entry lists what's NEW in that specific build; everything from earlier entries is still there too (this is cumulative, not a diff).

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
