# Tarn Desktop 0.1.0-dev.1

Windows x64 experimental port of Tarn's webOS application at 60ebff8c60e7c60fd94aaeb89a1447b7fa230c9e. Desktop-specific code lives in this folder; Android and webOS source are not modified. GPL-3.0 upstream license and Inter font notice are included in builds. The desktop implementation uses Electron (sandboxed, context-isolated Chromium) rather than the proposed Rust/WebView2/MPV stack to reuse existing playback state and profile logic.

## Run from Windows

Install Node.js 22.13+ (LTS recommended) and Git. From the repository root:

```powershell
cd platforms/desktop
npm install
npm run audit
npm start
```

Run `npm run dist:win` to attempt an unsigned Windows x64 NSIS installer under `release/`. Node dependencies are pinned at the top level but a lockfile is not yet generated; commit a validated lockfile before stable release. No installer has been built or signed by this commit.

## Test scope

- Create two local profiles, upload an avatar, restart, verify preferences and watch history are separate.
- Link a Stremio account by QR or browser, check Home, Discover, Search, My List, add-on management and catalogue order.
- Test legitimate direct HTTPS MP4 streams, seeking, subtitles, resume, source fallback, preferred provider, automatic episode advance, inactivity prompt before episode 5, skip intro/credits and playback controls.
- Test mouse, arrow navigation, window resizing, fullscreen F11, and the player fullscreen button.
- Check update notifications; stable Windows installer assets must be named Tarn-Desktop-VERSION-win-x64.exe. No silent install.
- Verify sign-out, account-switch isolation, corrupted storage recovery and diagnostic connectivity.

## Limitations

This is not a fully validated release. Direct HTTP(S) browser-compatible playback only; no integrated MPV, torrent engine, guaranteed HEVC/MKV/HLS/HDR, arbitrary request headers, native track switching, PiP, Discord presence, cross-device local profile sync, automatic installation or calendar view. Chromium and add-on CORS/mixed-content restrictions remain enabled. Thumbnail previews depend on source metadata. Next episode preparation resolves URLs; no hidden decoder prebuffer. No production website updates or release publishing. Windows runtime, dependency installation, full test suite, GPU/codec and installer verification are required. No security bypass flags are used. Account data is persisted locally as in the port; Windows credential-vault integration is not implemented.
