## Search navigation refresh

Search is now the first fixed navigation action, independently of configurable Home tabs. The LG search screen has a large labelled search field, high-contrast submit control, optional on-screen keyboard and explicit return to the previous tab. Search continues to query the existing installed add-ons and retains poster results and pagination. Search input is submitted explicitly; no per-keystroke network calls. Clear resets the submitted query and results. Physical keyboard/mouse or LG remote testing, typechecking and a full build are required before release.

# Pre-release audit — 0.6.0-dev.2

See [Physical LG TV test checklist](TV_TEST_CHECKLIST.md) and [Audit notes](AUDIT.md). Run `npm run audit` (Node 22.13+) before packaging. No new dependencies; application ID and package version unchanged. The audit hardens account-bound writes, corrupt library recovery, response limits, source retries/seeking, decoder disposal, modal focus, account-link failure handling, older-engine artwork loading, cache budget and stable source ordering. Native hardware and full local npm validation are release gates, not assumed passing.

# Tarn webOS — 0.6.0-dev.2

Profile editor supports local JPEG/PNG/WebP file selection (8 MiB, decoded dimension cap 24 megapixels, centre crop to at most 256×256 JPEG stored in existing profile IndexedDB), existing avatar gallery and optional HTTPS image address. No LAN upload server or cloud relay; actual LG file-picker availability is device-dependent. Home preferences are profile-scoped: startup tab, show/hide/reorder tabs, featured artwork, blur unwatched episode thumbnails, update checks. Continue Watching remains first; catalogue preferences still under My add-ons. Playback release-type and HDR/DV/SDR preferences use labels as soft ranking hints; fallback audio language uses native track metadata. Existing exact resume and preferred provider retain precedence. Release notifications query the public GitHub release list (latest 30, four-hour successful-check cadence across profile switches in the running app, 15-minute failure backoff or manual check), accept stable uploaded `dev.tarn.webos.dev_<version>_all.ipk` assets newer than installed package, ignore APKs and prereleases. QR links to the public release page. No silent installation or publication. App ID and package version remain unchanged. Platform limitations: native Android LAN upload, external player apps, Android system languages/integrations, native update installation and native HDR/audio controls cannot be ported as-is. No new dependencies. Full build, simulator and TV verification required.

# Tarn webOS — 0.6.0-dev.1

Settings → My add-ons. Browse installed descriptors, review and install a manifest URL (HTTP(S), bare address or stremio://), remove unprotected add-ons, and reorder account add-ons. Owner-only collection changes fetch the latest list, reject conflicts, preserve unknown fields, save and verify. Phone QR opens Stremio Web's add-ons page; install there using the same account, then Sync now. No transfer server or credentials in the QR. The manifest address is masked by default, and can be revealed for editing. Configured URLs remain in memory and are sent only to the relevant add-on or linked Stremio account; no raw transport URLs in catalogue preferences. Local profiles can browse owner add-ons and maintain independent Home/Discover catalogue visibility/order; no account writes or borrowed-provider management. Search and playback continue using the complete installed descriptor list. Stremio uses whole-collection replacement with no conditional write, so simultaneous edits can still race. CORS, actual cloud write and physical TV validation remain required. No new dependencies.

# Tarn webOS — 0.5.0-dev.2

Are You Still Watching follows Android's ephemeral profile-bound session: manual play starts a fresh session, only successful auto-starts count, intentional remote input resets the streak, prompt before episode five after three unattended auto-starts, Keep watching / Don't ask again this session / Stop watching. Native frame callback if available, otherwise advancing video time with decoded dimensions is the best-effort evidence of playback. No persistent suppression. Season navigation now defaults to the current library next/resume target, then first unwatched, shows aired unwatched counts, badges (future episodes remain manually selectable), and previous/next season controls. Timeline preview supports image and sprite cues on explicitly labelled native metadata tracks when the TV exposes them; otherwise displays the target timestamp. No speculative second decoder, capture, external thumbnail service or video download. No new dependencies. Actual TV, simulator and full build verification required.

# Tarn webOS — 0.5.0-dev.1

Advanced playback: profile-and-series scoped preferred provider memory, explicit manual source selection records the provider after successful playback; exact episode resume remains highest priority. Automatic attempts reserve the last try for another provider where possible. Next available unwatched aired episode uses the same ordering as Continue Watching. Sources are resolved in advance (within two minutes of the end/credits), held only in memory and reusable for up to two minutes, then re-ranked on transition; no hidden video decoder or speculative media-byte download. Five-second active-playback countdown, Play next, Watch credits, configurable fallback 5–30 seconds and autoplay switch. IntroDB public title/season/episode query and native chapter cues when exposed; validated skip intro/recap and credits markers, no guessed intro. A user can turn autoplay off while retaining manual next-episode controls. Countdown pauses while buffering, paused or backgrounded; natural end can advance immediately. A cancelled countdown stays cancelled for that episode. Final episode/movie credits can be skipped to the validated segment end, without jumping over a later scene. No new dependencies. IntroDB may fail due to CORS or missing timings. Native chapter access is device-dependent. Still Watching remains the next milestone. Real-device and full local build validation required.

# Tarn webOS — 0.4.0-dev.3

Player preferences: five-second controls timeout, remote timeline scrubbing (10/30/60-second repeat steps and 600 ms settle), pointer seek, per-profile quality preference, audio-codec-aware ranking, AAC/MP3 compatibility preference, per-title audio/subtitle choices and profile language defaults, subtitle size/colour/background/delay, Fit/Zoom/Stretch. Settings are local to each profile and accessible from the player and Settings. Explicit saved source memory still takes priority. Embedded tracks are native; only external subtitles support custom rendering/timing. Audio selection is limited to native tracks exposed by the device. Codec labels and canPlayType are hints, not proof of audio decoding. No audio button tries an unattempted source at current position. Track selections prefer an opaque ID or URL fingerprint, then matching label/provider/language. Reset remembered tracks in the player settings. Language and ranking changes apply on next source resolution. No new dependencies. Full simulator/TV validation remains required.

# Tarn webOS — 0.4.0-dev.2

Continue Watching is the first Home content row, before the featured banner. Landscape cards use episode artwork where available, show progress and resume directly. Long OK / options button offers resume, start over, details, watched and dismiss. My List and episode watched controls are per profile. Stremio owners read/write libraryItem records; local profiles never make cloud library requests. Cloud writes queue locally after identity binding and re-read the individual remote item before applying field-specific changes. If the first account lookup has not succeeded, changes stay local; a relink to a different Stremio user pauses sync rather than transferring old data. Unmappable remote watched bitfields are preserved rather than overwritten. The sync is best effort: Stremio offers no conditional datastore write, and device-clock differences or simultaneous edits may cause conflicts. Watched bitfields use zlib (fflate). Install dependencies again with npm.cmd install, then typecheck, test, build. Existing legacy movie/standard series progress is imported without automatic cloud writes. Unknown custom video IDs require matching metadata to recover title association. Physical TV and live Stremio sync must be tested. No Android modifications.

# Tarn webOS — 0.4.0-dev.1

Profile management: maximum five profiles, independent Stremio accounts or local profiles sharing an owner's login, profile names/colours/initials, gallery from existing Android avatar metadata, optional four-digit PIN, profile picker on launch and switching, rename/edit/delete, owner relinking and sign-out, opt-in household stream add-on lending (stream resource only; excludes official and personal-history add-ons). Local progress and source memory now use unique profile IDs. The old single login is moved transactionally into a default profile; on first selection existing account-scoped progress and source memory are copied without overwriting newer profile records. If identity or storage fails, a warning is displayed and migration can be retried on profile selection; any new profile records are not overwritten. Legacy account-scoped history remains as a backup (unlinked from other profiles); if the original credential expires before the first migration, the old history is retained but not automatically assigned to a newly linked account. No new npm dependencies.

Update with git pull --ff-only origin feature/webos-client, npm.cmd run typecheck, npm.cmd test, npm.cmd run build. Reopen dist using LG Simulator. Verify the migrated account and resume point before creating new profiles. Test local and separately linked profiles, PIN entry/edit/delete, owner dependency protection, sign-out/relink, avatar gallery, five-profile limit, restart persistence, playback and subtitle regression. The four-digit PIN is a local household UI lock, not secure credential encryption.

Deferred: QR phone upload (requires different webOS transfer mechanism), cloud library sync/Continue Watching and full settings parity. Android avatar images are remote references and can fail to load; initials remain available. No Android modifications.

# Tarn webOS — 0.3.0-dev.2

Playback fixes: remembers the last successfully played source for the exact movie/episode/account; exact URL fingerprint, then unique release filename/label, then provider, then ordinary ranking. Resolves fresh links, never stores raw source URLs. External SRT/WebVTT subtitles use a text overlay synced to video time instead of blob-based native tracks; source-specific subtitle requests include available filename/size and fall back to generic requests. Embedded tracks are listed when the device exposes them. No new dependencies. Existing resume timestamps migrate naturally; previous build did not record source identity, so play a source successfully once to establish memory. Browser CORS or unsupported subtitle formats can still prevent downloads.

# Tarn webOS — 0.3.0-dev.1

Milestone 3 initial direct playback. Native HTML video, installed add-on stream resolution, conservative compatibility ranking, automatic fallback (up to three attempts), manual source selection, play/pause and seeking, external SRT/WebVTT subtitles, native audio-track selection where exposed, local movie/episode resume scoped to Stremio user ID. No playback history is written to Stremio yet. Numeric manifest version 0.3.0; development build, no release.

## Update and test
```powershell
git pull --ff-only origin feature/webos-client
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```
No new npm packages; npm install may be needed to refresh the local lockfile version. Reopen dist in LG Simulator.
- Open a movie/episode you have rights to watch, select Play; check source resolution and playback.
- Try manual Sources, pause/resume, ±10 sec, Back, and reopen to check resume. Verify no accidental progress overwrite when a source fails.
- Test source failure, retry, no sources, torrent-only and header-dependent sources, and a title with multiple providers.
- Try external subtitles, Off, and audio tracks if exposed. Test diagnostics MP4/HLS independently.
- Verify the approved poster layout and all search/discover/detail navigation.
- Simulator media support differs from TV; native HLS, HEVC, HDR, audio decoding, embedded tracks, subtitle blob handling and seek/resume require real-TV testing.

## Boundaries
Direct HTTP(S) video only; sources marked notWebReady or requiring proxy headers, torrent-only, external links and known small action files are excluded. Ranking uses labels and reported codec support, not verified media inspection. No proxy, torrent engine, FFmpeg, DRM workaround, MSE HLS library, external backend, or cloud history. Native HLS support depends on the platform. Subtitle requests use normal browser CORS and a local VTT blob; unsupported subtitle formats are not converted. Local progress uses browser storage scoped by Stremio user ID, with session-memory fallback. Full cross-profile history, Preferred Server Memory, autoplay and inactivity prompts remain later milestones.

# Tarn webOS — 0.2.0-dev.2

Milestone 2C/2D: remote search across installed movie/series catalogues that advertise search, Discover with catalogue/type/genre selection and skip pagination, title detail metadata and season/episode navigation. Play prepares a selected title/episode and displays an explicit development notice; it does not resolve or stream media yet. Approved poster card structure and styles retained. Application manifest and npm version remain numeric 0.2.0 for LG packaging; UI identifies dev.2.

## Update and simulator acceptance
From the webOS worktree's platforms/webos directory:
```powershell
git pull --ff-only origin feature/webos-client
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```
Reopen dist in LG Simulator (File > Launch App). No new dependencies.
- Home: existing layout, poster sizes, artwork and focus unchanged. 
- Search: enter a title that is not present in Home (physical keyboard or optional D-pad keyboard) and submit; check results across searchable add-ons, duplicate removal, failed add-on reporting, empty results, More results, title details and Back focus.
- Discover: switch Movies/Series, select catalogue and genre, load more where skip is advertised, change filters while a request is running, retry errors. Unsupported genre/skip controls are not presented.
- Details: open a movie and series from Home, Search and Discover; verify artwork, rating/runtime/cast where supplied, season sorting, specials, episode thumbnails and descriptions. Play movie or select episode: confirm development notice, no playback. Test Back to previous results and focus.
- Settings: existing sign-in and sign-out, diagnostics and persistence remain available.

## Scope and performance
Home loads up to 24 catalogues, 30 titles per row; Search requests first page (up to 30 titles) of each eligible installed catalogue, four concurrent, with deduplicated results and incremental display. Discover uses the add-on's advertised skip capability and raw response length to advance; identical/empty pages stop pagination. Metadata and catalogue JSON cache is per session in memory (80 entries, five-minute TTL); refresh invalidates it, sign-out clears it. No persisted catalogue or query cache. Artwork still uses lazy image loading; unsupported engines may load eagerly. No genre options are invented; required extras use manifest defaults. No streaming or write operations. Full simulator and hardware verification still required.

## Tools and device setup
Node.js 22.13+ and LG unified CLI: `npm.cmd install -g @webos-tools/cli`, `ares-config --profile tv`. Browser preview uses port 4173. Open dist through File > Launch App in LG Simulator. For hardware, enable Developer Mode on the TV, connect both devices to the same network, add lgtv using ares-setup-device (port 9922, prisoner), then ares-novacom --device lgtv --getkey. Run scripts/build-webos.ps1 and scripts/install-webos-dev.ps1 from this folder, and scripts/debug-webos.ps1 to inspect. The simulator CLI may require --simulator-path; manually launching dist is fine. Developer Mode expires and can remove developer apps.

Official docs: https://webostv.developer.lge.com/develop/getting-started/developer-mode-app and https://webostv.developer.lge.com/develop/tools/cli-dev-guide.

Branding derived directly from Tarn Android ic_tarn_mark.xml, tarn_lockup.xml and TarnPalette.kt. Existing repository GPL-3.0 applies; Inter is SIL OFL 1.1.
