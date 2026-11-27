# Tarn development draft — review and device verification

Base: Alder Fork v1.5.0, commit 170513f7023251eb988990cbf0cbc2852084fe00. Branch: feature/tarn-redesign. No production release.

## Architecture and scope

The Android app uses Kotlin and framework Views, shared Screen helpers, eight landscape activities (profiles, home, search, details, settings, add-ons, streams and player), native focus handling, reusable card rails, asynchronous artwork loading with separate bounded LRU bitmap caches and an HTTP disk cache. Profiles and account-specific state use existing preferences, and playback uses Media3 1.9.0, Jellyfin FFmpeg decoder and Nuvio Engine 0.1.6. Coroutines and existing background executors remain. The profile picker is the launcher. The Gradle project targets SDK 36 with minSdk 23, ARM builds, JUnit unit tests and CI lint/build. GPL-3.0 upstream licensing and acknowledgements remain intact.

This pass changes presentation, not storage or stream selection. Shared Screen controls cover the eight activities, with additional colour updates for home, details, search, streams, settings, profiles, and player (including its still-watching prompt). Existing IDs, keys, page labels used internally, activities, provider preference, account sync, autoplay timing, player engines, subtitle colour preferences and distribution endpoints remain. Main activity layout, D-pad focus/restore logic, image pools and caching are preserved. The design system and visual assets are documented in design/tarn/README.md.

## Build and install

From the existing repository (a separate worktree avoids overwriting local edits):

```powershell
git fetch origin
git worktree add -b feature/tarn-redesign ..\AlderFork-Tarn origin/feature/tarn-redesign
Set-Location ..\AlderFork-Tarn
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug -PdebugKey
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb connect FIRE_TV_IP:5555
& $adb install -r .\app\build\outputs\apk\debug\app-debug.apk
& $adb shell am start -n dev.alderfork.dev/dev.alder.ProfilesActivity
```

Replace FIRE_TV_IP with the address displayed on your TV and accept the device's debugging prompt. If the branch exists locally, use a different worktree name or switch to the existing branch with a clean working tree. If Android SDK is elsewhere, change the adb path. Debug uses dev.alderfork.dev, separate from production. The release build with -PdebugKey still uses dev.alderfork and should not be installed over the production-signed build. Never uninstall the production app to resolve a signing mismatch. A true upgrade test requires a production-signed candidate with the same app ID and compatible version on a disposable test install; do not test that on family profiles until backups and recovery are agreed.

## Physical checklist

- Launch: force-stop, cold start, return from Home, background/resume, open from launcher, verify icon/banner and no splash delay.
- Profiles: create/switch two test profiles, verify PIN, initials, avatars, QR upload, independent progress and settings; restart.
- Home/library/discover: rapid directional input, selected vs focused tab, card visibility, focus restore, scroll, back, long titles, larger text, missing images.
- Search: keyboard, voice if supported, long results, repeated transitions, offline/no-results state.
- Details: episode and season selection, resume, add/remove library, focus restore, provider selection.
- Playback: direct and permitted P2P source, seek, subtitles/audio (including saved warm-white preference), source fallback, resume, autoplay and still-watching threshold; long session.
- Settings/add-ons: toggles, menu navigation, dialogs, disabled/selected states, readable labels, no trapped focus. Release notes and update UI should not trigger installation during testing.
- Network: slow/offline connection, retry, missing artwork, failed provider, recovery.
- Accessibility: bright/dark artwork, focus outlines, readable text at sofa distance, all available locales, larger UI settings and system animations disabled.
- Repeat with same debug application ID and signing key across the baseline and Tarn to test state retention. Do not uninstall or clear app data between builds.

## Benchmark protocol

Create a clean baseline worktree: `git worktree add --detach ..\AlderFork-baseline 170513f7023251eb988990cbf0cbc2852084fe00`. Build with the same JDK, Android SDK, Gradle options, build type and signing key as Tarn. Test both APKs on the same Fire TV Stick 4K Max (2nd gen), same display mode, account, add-ons, network and source. Keep device temperature and background apps comparable; repeat each run at least five times. Use the same title and input sequence. First collect warm-cache runs, then document a controlled clean-cache run only if safe on test profiles. Preserve the original output.

For each installed build run `scripts/measure-tarn.ps1` from the Tarn worktree with a distinct label (Baseline or Tarn). The script collects Activity Manager launch output, task resume output, graphics frame stats, memory and CPU snapshots. Android gfxinfo covers View/UI rendering, not all video frames. Inspect playback using the same known-good title and player statistics/logs; time from Play to first picture using a stopwatch or screen recording. Cold process start is not the same as network cache cold; launch TotalTime is not time-to-interactive. Record the point at which remote input first responds. Compare APK file sizes with Get-Item, and use repeated session tests for memory growth. For deeper analysis use device-supported Perfetto/Android Studio profiling and SurfaceFlinger frame timing; no device measurements have been collected here.

Targets: same or better median cold launch and playback startup; no meaningful memory or responsiveness regression; lower or equal jank and idle render work; approximately 16.67 ms frame budget at 60 Hz; no regressions in playback or data persistence. Confirm P95 frame times and janky frame counts, not just average. Report medians and variation, not a single favourable run.

## Verification status

Static connector inspection and GitHub comparison establish the modified files and preserved Gradle build configuration. Local Android SDK/dependency access and physical Fire TV are unavailable in this development environment. Added TarnPaletteTest checks WCAG contrast on opaque surfaces; standalone calculation confirms minimum 5.24:1 for the tested text combinations and 5.57:1 lake-blue focus against deep blue. PNG signatures, dimensions and chunk CRCs checked; all eight locale resource key/placeholder sequences unchanged. These checks do not establish successful Android compilation, installation, device rendering or performance. Existing automated tests should be run unchanged and failures investigated. Original branding board was unavailable; the vectors are provisional. No trademark clearance claimed.
