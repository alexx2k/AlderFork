## Desktop 0.2.0-dev.1

- Integrated, user-initiated Windows update download. Main process independently validates the desktop release/version and official installer/checksum, restricts redirects, enforces size bounds, verifies SHA-256 and asks before launching the unsigned standard installer and closing Tarn. No silent installation. Manual release link remains available. Older builds need one manual upgrade.
- Native Chromium picture-in-picture (P), persistent playback speed, and independent optional seek previews. Storyboard metadata takes priority; generated previews require seekable CORS-enabled sources. No main-video seeking for hover previews; timestamps remain if images fail.
- Remembers normal window bounds and maximized state, clamps to connected monitors, keeps fullscreen temporary. Existing playback and multilingual audio engine retained. Physical Windows runtime validation still required.

## Desktop updates — 0.1.0-dev.3

Checks at startup and hourly, with a prominent desktop update banner and manual check in Settings. Desktop preview channel includes newer dev builds and stable desktop releases; stable installations exclude prereleases. Installers open via the official GitHub release page. No silent installation. Existing v0.1.0-dev.2 installs need one manual upgrade to receive this behavior.

## Desktop player — 0.1.0-dev.2

Mouse-first controls, draggable seekbar, hover time/available thumbnails, volume, mute, fullscreen via a restricted native window bridge, double-click video, F/F11, Esc, Space/K, J/L and M. AudioVideoTracks is enabled explicitly in the sandboxed Chromium renderer. Embedded tracks are listed when exposed; English is preferred in Automatic mode, and Prefer English saves an explicit choice. A zero-track or single-track result does not establish that the file lacks other languages. Chromium may still need replacement by a native engine (MPV/libmpv) for full multilingual MKV support; no fake track labels or guaranteed decoding. Test with actual multilingual media. Existing subtitle/episode/progress logic retained. Windows installer and physical playback validation required.

## Search navigation refresh

Search is now the first fixed navigation action, independently of configurable Home tabs. The browse screen has a persistent search field and Ctrl+K (or Cmd+K) opens Search while not playing or in a modal. Search continues to query the existing installed add-ons and retains poster results and pagination. Search input is submitted explicitly; no per-keystroke network calls. Clear resets the submitted query and results. Physical keyboard/mouse or LG remote testing, typechecking and a full build are required before release.

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
