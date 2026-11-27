# Tarn webOS — 0.2.0-dev.1

Milestone 2A/2B: single Stremio account, device-code and locally generated QR sign-in, installed add-on retrieval, read-only real movie/series catalogues and artwork, basic title metadata, refresh, local account persistence and sign-out. The application manifest uses numeric version 0.2.0; this is a private development build, not a public release.

## Update from 0.1.0
From the webOS worktree:
```powershell
git pull --ff-only origin feature/webos-client
cd platforms/webos
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```
If already in platforms/webos omit the cd. A new dependency (qrcode) generates QR codes locally, without sending the code to a third party. Use npm install, not npm ci, until the local lockfile has been generated and committed. Reopen the simulator's dist folder after the build. Browser preview: npm.cmd run dev.

## Acceptance tests
1. Home displays Link Stremio account. Scan the QR or enter its code on Stremio's linking website. Never share the code or auth token in logs/screenshots.
2. Once approved, Home should populate with real catalogues from the linked account. Check Movies and Series tabs, artwork, details, Back and focus.
3. Refresh catalogues, close/reopen the app and verify account persistence. Sign out in Settings; reopen and check that the account is cleared. A remotely expired token should return to the link screen on refresh/relaunch.
4. Verify an unavailable add-on does not prevent other catalogue results. Diagnostics remains accessible without an account.
5. Full build and live sign-in must be verified on the simulator and subsequently a physical LG TV.

## Current scope and limits
Read-only account integration; no add-on changes or watch history writes. Initial catalogue requests are capped at 24 (four concurrent), 30 titles each, with six rows rendered at a time; refresh is manual and rows are cached in memory until reload. Discover currently browses the same loaded rows; genre/pagination and full add-on search are next. Search loaded titles is a local filter, not remote search. Basic metadata is requested where supported, no episode navigation or playback yet. The account token lives in app-origin IndexedDB (not hardware-backed encryption); never log it, send it to add-ons, or include personal configured add-on URLs in diagnostics. Sign-out removes the local token first, then attempts remote revocation. No Tarn Cloud or proxy. No Android changes.


## Tools and device setup
Node.js 22.13+ and LG unified CLI: `npm.cmd install -g @webos-tools/cli`, `ares-config --profile tv`. Browser preview uses port 4173. Open dist through File > Launch App in LG Simulator. For hardware, enable Developer Mode on the TV, connect both devices to the same network, add lgtv using ares-setup-device (port 9922, prisoner), then ares-novacom --device lgtv --getkey. Run scripts/build-webos.ps1 and scripts/install-webos-dev.ps1 from this folder, and scripts/debug-webos.ps1 to inspect. The simulator CLI may require --simulator-path; manually launching dist is fine. Developer Mode expires and can remove developer apps.

Official docs: https://webostv.developer.lge.com/develop/getting-started/developer-mode-app and https://webostv.developer.lge.com/develop/tools/cli-dev-guide.

Branding derived directly from Tarn Android ic_tarn_mark.xml, tarn_lockup.xml and TarnPalette.kt. Existing repository GPL-3.0 applies; Inter is SIL OFL 1.1.
