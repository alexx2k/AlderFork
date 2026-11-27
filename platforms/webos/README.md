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

---

# Tarn for LG webOS — Foundation 0.1.0

Independent experimental client. Targets webOS 5.0 (Chromium 68) or newer; actual TV support is not yet certified. Android Gradle files and release processes are untouched. No production release or cloud backend.

## Prerequisites (Windows 11)
Node.js 22.13+ (LTS recommended), npm, and LG's unified CLI: `npm install -g @webos-tools/cli`. Run `ares-config --profile tv` and `ares -V`. Use a regular PowerShell terminal. Run from this directory unless noted.

```powershell
npm install
npm run typecheck
npm test
npm run dev
```

Preview at http://127.0.0.1:4173. The classic IIFE bundle targets Chrome 68; npm run build copies Android's existing Inter font and launcher art into the isolated dist directory, converting icon sizes to 80/130 PNG. It does not write to app/. Commit the npm-generated lockfile after validating dependencies; initial pinned direct versions are included but a lockfile has not been generated in the offline implementation environment.

```powershell
npm run build
ares-package --no-minify -o packages dist
# Or:
powershell -ExecutionPolicy Bypass -File scripts/build-webos.ps1
```

## Device
Install Developer Mode from LG Apps, sign in, enable Dev Mode Status and restart. Reopen and enable Key Server. Computer and TV must be on the same network. Run `ares-setup-device` and add device lgtv, TV IP, port 9922, username prisoner. Then `ares-novacom --device lgtv --getkey` (enter TV passphrase), `ares-device --system-info --device lgtv`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-webos-dev.ps1 -Device lgtv
powershell -ExecutionPolicy Bypass -File scripts/debug-webos.ps1 -Device lgtv
```

Use -SkipBuild for an existing package. Development mode expires and can remove developer apps. Extend it on the TV. For the simulator install LG's simulator and use `ares-launch -s <installed-version> dist` or the simulator script. Simulator video is not representative of hardware.

## Manual acceptance checklist
- Home displays Tarn mark/wordmark and fictional samples; arrows, OK, pointer click; focus remains visible.
- Navigate across nav and cards; open a title and Back; focus returns to the originating card; repeated keys and edge behavior.
- Search samples, submit with Enter, test keyboard/remote entry, empty results.
- Settings: change test name, exit/relaunch, check saved name and launch count. Verify behavior when storage fails.
- Diagnostics: public JSON GET/POST and catalogue tests, note results without recording sensitive URLs or credentials. API errors can still show JSON connectivity; successful sign-in is not tested. CORS/TLS/server errors cannot be differentiated reliably by fetch alone.
- Play MP4 and HLS public samples independently; check image, audio, pause, seek, stop, back. Record exact TV model, webOS version, and any media error. No torrent engine or arbitrary media headers.
- On real TV verify no scroll/focus traps, keyboard, pointer, Back at entry, image and storage persistence.
- Android: from repository root run existing Gradle tests/build with existing signing setup; check diff contains only webOS/shared files.

## Scope and privacy
All displayed titles/artwork are fictional local fixtures. Network tests are initiated explicitly, no tokens/passwords stored or sent, no telemetry, no backend. Public test media: Blender Foundation Big Buck Bunny / Mux HLS sample. Storage is a single versioned IndexedDB record for a demo local profile; real multi-profile/watch history and Stremio sign-in are later milestones. No full playback controls or embedded subtitle support yet. Keep personal add-on URLs and auth keys out of diagnostics.

Official references:
- https://webostv.developer.lge.com/develop/getting-started/developer-mode-app
- https://webostv.developer.lge.com/develop/tools/cli-dev-guide
- https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
- https://webostv.developer.lge.com/develop/references/appinfo-json
- https://webostv.developer.lge.com/develop/guides/back-button

Branding derived directly from Tarn Android ic_tarn_mark.xml, tarn_lockup.xml and TarnPalette.kt. Existing repository GPL-3.0 applies; Inter is under SIL OFL 1.1.
