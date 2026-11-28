# Tarn multiplatform development

One repository, one eventual default integration branch (`main`), three independently built clients. No submodules and no requirement to install every platform toolchain.

| Platform | Project directory | Build and test commands (from repository root) |
| --- | --- | --- |
| Android TV / Google TV / Fire TV | Root Gradle project, `app/` | `./gradlew :app:assembleDebug`, `./gradlew :app:testDebugUnitTest`; Windows uses `gradlew.bat`. Production signing and packaging remain unchanged. |
| LG webOS | `platforms/webos/` | `cd platforms/webos`, `npm install`, `npm run audit`; follow its README for LG CLI packaging and TV installation. |
| Windows desktop | `platforms/desktop/` | `cd platforms/desktop`, `npm install`, `npm run audit`, `npm start` or `npm run dist:win`. |

Node 22.13+ is required for the TypeScript clients. Install each client's own dependencies. Do not commit generated packages, build output, credentials, signing keys or node_modules. Generate and validate separate lockfiles before stable releases; switch CI to npm ci after those lockfiles are committed.

## Branches and contributions

- `main`: canonical source tree for all platforms after integration review; a development client in this tree does not imply it has been released.
- `feature/android-<change>`, `feature/webos-<change>`, `feature/desktop-<change>`: short-lived branches from current main, merged by pull request after relevant checks.
- `feature/shared-<change>`: cross-platform changes; verify every affected client.
- `integration/multiplatform`: temporary consolidation and verification branch. Existing `webos`, `feature/webos-client`, and `feature/desktop-client` are preserved; coordinate any outstanding changes before retiring them. Never force-push or delete them as part of the migration.

Keep client source inside its directory. Android retains the existing upstream-compatible root Gradle layout. Design assets and project-level documentation can be shared; webOS and desktop currently have separate runtime code, including duplicated logic. Extract genuinely platform-neutral modules only in a subsequent tested refactor; do not share native playback, storage, navigation or Electron security policy blindly. Keep Chromium 68 compatibility for webOS.

## Independent releases

Do not synchronize platform version numbers or publish just because code is merged. Each client has its own version in its existing build manifest and must pass its own device/build tests. Existing Android tags, application ID, signing and download URLs must remain compatible.

Suggested future tags: `android-v2.0.1`, `webos-v0.6.0`, `desktop-v0.1.0`. These are conventions, not published releases. Keep existing Android tag conventions until its updater and website have been verified against platform-specific tags. Use assets that the corresponding updater expects:

- Android: `Tarn-2.0.1.apk` (existing convention; verify signing).
- webOS: `dev.tarn.webos.dev_0.6.0_all.ipk` (actual version must be greater than installed for update detection).
- Windows: `Tarn-Desktop-0.1.0-win-x64.exe` (stable version example).

GitHub's repository-wide latest release is not a per-platform channel. Until Android's updater and the website's /apk route are verified or changed to select the newest stable Android release by matching asset, do not publish a webOS-only or desktop-only release as repository-wide latest. Even non-latest releases require checking the actual consumer behavior before publishing. Keep development installers in Actions artifacts or explicitly isolated prereleases only after verifying consumers ignore prereleases. Never auto-publish from a PR.

## Verification and migration

1. Confirm Android Gradle, source, packaging and signing scripts are unchanged by consolidation. Build and test Android before merging.
2. Run webOS npm audit script and the physical [LG TV checklist](../platforms/webos/TV_TEST_CHECKLIST.md); check older webOS engine behavior.
3. Run desktop npm audit script and build Windows x64 installer; smoke test startup, playback, update notifications, search, profiles and keyboard controls.
4. Verify Android APK download and update behavior before and after any future non-Android release.
5. Merge the integration branch using a merge commit to retain both platform histories; keep existing branches until remaining work is accounted for.

See [webOS README](../platforms/webos/README.md), [desktop README](../platforms/desktop/README.md) and [root README](../README.md) for details.
