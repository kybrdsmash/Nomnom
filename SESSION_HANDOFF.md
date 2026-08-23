# Session handoff (as of 2026-07-23)

Context for picking this project back up in a new Claude Code window/session (e.g. the VS Code extension). See `CLAUDE.md` for the stable architecture reference — this file is just "where we left off."

## Current state

- `npm install` done, `.env` created and populated with a real Google Places API key and all 6 Firebase config values (not reproduced here — see `.env` directly, it's gitignored).
- `CLAUDE.md` written, covering commands and architecture.
- Confirmed working end-to-end on the user's Pixel via Expo Go, running in **tunnel mode**.

## How to start the dev server

Use tunnel mode, not plain `npx expo start -c`:

```
npx expo start -c --tunnel
```

**Why tunnel and not LAN:** the phone's hotspot is unreliable, and the dev PC's Wi-Fi keeps auto-reconnecting to a corporate network (`corp.tfbnw.net`) instead of the hotspot, breaking direct-LAN connections. Tunnel mode routes through Expo's ngrok relay over the internet instead, so it doesn't matter which network either device is on. `@expo/ngrok` is already installed as a dependency, so no interactive install prompt should appear.

**Getting the connection URL/QR code:** running in a non-interactive terminal (like this session's background shell) means Expo's interactive QR/URL display won't render. To get the actual tunnel URL, query ngrok's local API instead:

```
curl -s http://127.0.0.1:4040/api/tunnels
```

Look for `public_url` — the exp:// connection string is `exp://<that host, without https://>`. Generate a QR code from it if useful with `npx qrcode "exp://<host>" -o out.png`.

## Bugs already found and fixed (context in case something similar resurfaces)

1. `babel.config.js` requires `babel-preset-expo`, but it was completely missing from `package.json`. Fixed via `npx expo install babel-preset-expo` (installs the SDK-matched version — currently 54.0.12 — not latest).
2. A stray plain `npm install --save-dev babel-preset-expo` had grabbed the *latest* version (57.x) into `devDependencies`, conflicting with the correct `~54.0.10` entry in `dependencies`. Removed the duplicate.
3. Windows Firewall had no inbound rule for Node/port 8081, silently blocking LAN connections (now moot since we use tunnel mode, but relevant if switching back to LAN testing).

## Known outstanding issue (non-blocking)

Firebase Auth (`src/api/firebase.js`) warns every run that it has no persistence configured — anonymous sign-in used by friend-spin mode won't survive app restarts (defaults to memory-only). Fix: wire up `getReactNativePersistence` from `@react-native-async-storage/async-storage` (already a dependency) into `initializeAuth`.

## Roadmap, in order

1. Finish testing on the Pixel (in progress — app loads and runs).
2. Try friend-spin mode for real — hosting solo only shows the code-entry screen; a genuine test needs a second phone to join as guest.
3. `eas login`, set EAS environment variables (mirroring `.env` — EAS builds don't read the local `.env` file), then a fresh EAS build (`eas build --profile preview --platform android`, per `eas.json`).
4. Feature roadmap after that: profile v1, a "find me something new" filter, and bringing back a fancier coin-spin animation (current one intentionally uses React Native's built-in `Animated` API instead of Reanimated, since Reanimated 4 needs native code Expo Go doesn't ship).

## Industrial design opens

Backlog of visual/tactile design ideas not yet implemented - revisit when there's room to explore polish, not urgent fixes.

1. **Button/slider edge shimmer.** Wanted: something that reads as the shimmer/specular highlight along the EDGE of a button or slider (like light catching a glossy or beveled rim) - not discrete corner accents. First attempt (2026-08-01) added small bright dots inset near the top-left/bottom-right corners of every `neonSelected()`-glowing button (mode/travel toggles, cuisine bubbles, Fave-slot flash, FAB buttons, result-card/calendar/friend-spin CTAs, the distance and Appearance-slider dials, the friend-map pin, friend-spin bracket card selection) - user feedback: not what was meant, fully reverted same session. Next attempt should look like an actual edge/rim highlight (e.g. a thin gradient arc following part of the border, or a subtle animated glint sweeping along the edge) rather than fixed corner dots.
