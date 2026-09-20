# Important resources & links

External accounts, consoles, and one-off generated artifacts that aren't
discoverable from the code itself. Update this file whenever a new external
resource gets created rather than letting the link live only in a chat
transcript or a buried TODO.md comment.

## Consoles / dashboards

- **Firebase Console** (project `nom-nom-83f11`): https://console.firebase.google.com/project/nom-nom-83f11/overview
  - Firestore rules: https://console.firebase.google.com/project/nom-nom-83f11/firestore/rules
- **Google Cloud Console — APIs & Credentials** (same project, backs Firebase Auth/OAuth): https://console.cloud.google.com/apis/credentials?project=nom-nom-83f11
  - **Google Auth Platform** (OAuth consent screen, now split into "Branding"/"Audience"/"Clients" sub-pages) lives under this same Cloud project — reachable from the left nav once on the Credentials page.
- **Google Play Console**: search for package `com.peach.nomnomapp` (no stable direct URL to link here since Play Console URLs are per-session).
  - Real closed-testing track name is **"Friends Beta"** (not the generic "alpha" track — confirmed via the Play Developer API; "alpha" exists but has never had a release). `eas.json`'s `closedTesting` submit profile targets this by name.
- **EAS / Expo dashboard**: https://expo.dev/accounts/isaacfinger/projects/Nomnom_App

## Privacy policy

- **Source file** (edit this): `docs/privacy-policy.html`
- **Live, publicly reachable URL** (deployed via Firebase Hosting 2026-09-20): https://nom-nom-83f11.web.app/privacy-policy.html
- **Original draft**, published as a Claude Artifact before the real hosted version existed: https://claude.ai/code/artifact/82119d59-1862-412c-b5a7-0e92fdd027b1 (kept for history/diff reference only — the hosted URL above is the one that should go in Play Console / Google Auth Platform branding / any store listing).

## Credential files (local only, gitignored, never commit)

- `C:/Users/Isaac/keys/nomnom-play-submit.json` — Play Store submission service account (used by `eas submit`)
- Firebase Admin SDK service account key for FCM V1 push (uploaded to Expo via `eas credentials`, not stored anywhere in this repo) — regenerate from https://console.firebase.google.com/project/nom-nom-83f11/settings/serviceaccounts/adminsdk if ever lost

## Other generated artifacts (design mockups, one-off tools)

- **Coin animation bench**: https://claude.ai/code/artifact/5ed1381e-5758-433f-a6a3-26b4c6405329 — tuned by eye, applied to `CoinSpinner.js`/`constants.js`.
- **Rewards system mockup**: https://claude.ai/code/artifact/4c3a5549-6c1d-4eb1-adf0-96fca96a00dd — 3 directions; Direction 1 (Taste Rank badge) partially implemented (`src/api/rewards.js`, `ReviewMilestoneBadge.js`).
- **Daily bug-triage cloud routine**: https://claude.ai/code/routines/trig_01MujHHJv6VsPvHunoYzNLak — 9am PT daily, reads new `bugReports`, attempts fixes on a pushed (unmerged) branch or flags `needs-feedback`.
