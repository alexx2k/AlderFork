# Tarn webOS — physical LG TV acceptance checklist

Build: 0.6.0-dev.2, development branch `feature/webos-client`. Use authorised public test media and a disposable Stremio account for destructive sync tests. Never include credentials or private provider URLs in a bug report.

## Record the environment
- [ ] TV model, approximate year, webOS version and firmware version.
- [ ] Screen resolution, Wi-Fi/Ethernet, network stability, remote type (Magic or standard).
- [ ] Sound output (TV speakers / soundbar / receiver), eARC/ARC and TV audio mode.
- [ ] Exact Git commit, package ID/version, date and tester.
- [ ] Confirm webOS 5.0 or later; ideally repeat on a second, newer TV.

## Build and install — release blocker
- [ ] Pull `feature/webos-client`, install dependencies (Node >=22.13), run `npm run audit`; all three commands must pass.
- [ ] Package `dist` with ares-package; confirm IPK ID and version.
- [ ] Install Developer Mode app, enable Dev Mode, reboot, enable Key Server and pair computer on same Wi-Fi.
- [ ] Install IPK and launch; cold-start twice, then return from Home/suspend.
- [ ] Reinstall a newer development build over the same ID without deleting storage; verify profiles and history survive.
- [ ] Record remaining Developer Mode session time; do not disable it during tests.

## Baseline diagnostics — release blocker
- [ ] Device diagnostics opens before linking; public JSON probes show reachable responses or clearly explain CORS/network failure.
- [ ] MP4 H.264/AAC sample: picture, audible dialogue/music, pause, resume, seek and stop.
- [ ] HLS sample: picture/audio if TV supports it; document unsupported playback separately.
- [ ] Exit diagnostics during loading/playing; no continuing audio, no frozen app.
- [ ] Compare simulator silence against physical-TV native audio using exactly the same lawful source.

## Profiles, sign-in and isolation — release blocker
- [ ] Stremio QR sign-in succeeds, account linked; expired/cancelled code can be retried.
- [ ] Create local profile, separately linked profile if available; verify distinct history, list, settings and avatar.
- [ ] PIN lock: wrong PIN rejected, correct PIN works, edit and deletion gated; PIN removal works.
- [ ] Preloaded avatar, initials, custom HTTPS image, local file picker if exposed; cancel upload preserves old image.
- [ ] Switch profiles during idle catalogue loading; no other profile's names, streams or progress leak.
- [ ] Local profile cannot mutate owner's add-on collection; owner relink propagates; dependent profile prevents owner deletion.
- [ ] Opt in to stream lending, verify only allowed stream resources; disable and verify subsequent resolutions stop lending.
- [ ] Sign out, relink same account and restart; local history remains. On different account, previous cloud binding pauses writes.
- [ ] Delete disposable local profile only; confirm unrelated profiles/settings/history remain.

## Home and discovery — release blocker
- [ ] Continue Watching first Home row when nonempty; approved portrait card size, title alignment, spacing and scrolling unchanged.
- [ ] Movies, Series, Discover, My List and search load; metadata image failures show placeholders.
- [ ] D-pad and OK navigate rows, horizontal scrolling, details, Back, search keyboard and return to original card.
- [ ] Discover: type/catalogue/genre selection, Load more, switching during requests, no duplicate titles.
- [ ] Search across installed providers, no results, punctuation, repeated query, Back and retry.
- [ ] Hide/reorder catalogue; search and playback still work; restore defaults.
- [ ] Change startup tab and reorder/hide tabs; Home always present; hidden startup tab falls back to Home.
- [ ] Toggle featured artwork and spoiler blur; unaffected profile keeps defaults.
- [ ] Browse many rows and scroll quickly; artwork appears when near viewport, no persistent blank cards.

## Playback codec matrix — release blocker
Use only legitimate media; test each supported format separately and record source codec/container, TV output, success/error, and whether source fallback was needed.
- [ ] 1080p H.264 + AAC stereo MP4.
- [ ] H.264 + AC3 and EAC3 5.1 where TV supports it; compare TV speakers vs external sound device.
- [ ] HEVC 1080p and 4K; HDR10 and Dolby Vision only on a compatible TV.
- [ ] MKV vs MP4; HLS if provided. Record DTS/TrueHD/AV1 unsupported cases, not automatic app failures.
- [ ] Auto quality vs 720p/1080p/4K preferences; AAC/MP3 compatibility preference.
- [ ] Manual source selection, provider memory across episodes, fallback to another provider, expired/unavailable URLs.
- [ ] No audio button changes source and preserves position; automatic failure stops after bounded attempts, then manual retry works.
- [ ] Pause/play; media keys; Back during loading and playback; no sound/decoder continues after leaving.
- [ ] Seek forward/back, hold D-pad on timeline (10/30/60 sec), pointer seek; verify nonseekable streams do not lock UI.
- [ ] Controls hide after five seconds, reveal by remote/pointer; disabled auto-hide works. Focus not lost when panel closes.
- [ ] Fit/Zoom/Stretch on 16:9 and letterboxed material; no stretched UI.
- [ ] Audio selection and fallback language if tracks exposed; preference survives new episode.
- [ ] External SRT and VTT, accented characters, timing ±0.25 s, colour/size/background, remembered choice, Off; native subtitles if exposed.
- [ ] Scrub timestamp always available; real thumbnail only if labelled metadata supported.

## History and library — release blocker
- [ ] Movie resume after 30+ seconds; source memory, Start over and completion near end.
- [ ] Series episode progress, season counts, watched/unwatched, first unwatched, next marker, skip specials/future episodes.
- [ ] Continue Watching options (long OK and menu), remove card without deleting My List; new playback restores.
- [ ] My List add/remove, sync with other Stremio client; owner changes sync, local profile changes remain local.
- [ ] Offline playback progress survives app restart; reconnect sync on same verified account.
- [ ] Concurrent edit from second client: verify no unexpected overwrite; record any conflict or unsupported bitfield.
- [ ] No stale previous-episode progress overwrites the new episode after autoplay.
- [ ] Test malformed storage only in disposable simulator profile, not on real personal history.

## Advanced playback and inactivity — release blocker
- [ ] Next episode pre-resolves near credits; transition stays inside player, correct episode/title/source.
- [ ] Five-second countdown during active playback; pause/buffer/background suspends; Watch credits cancels for current episode.
- [ ] Play next immediately, autoplay off, missing IntroDB metadata uses configured fallback.
- [ ] Intro/recap skip with known metadata; no guessed intro when missing; final credits skip preserves known later scene.
- [ ] For inactivity test use four consecutive short lawful episodes (or seek near end before beginning the unattended sequence). Episode 1 manual; episodes 2, 3 and 4 auto-start without remote input; prompt before 5.
- [ ] Keep watching resets streak; Don't ask again suppresses for session; Stop returns to browsing; Back closes prompt safely.
- [ ] Intentional remote input resets count; failed attempts do not increment; profile switch and manual new session reset suppression.
- [ ] Repeat with paused/buffering playback and remote held keys; no accidental confirmation.

## Add-ons and updates — release blocker for writes
- [ ] Installed list, resource labels, protected removal disabled, local profile read-only.
- [ ] Install a trusted test manifest, preview/cancel, invalid URL/manifest fails safely, duplicate rejected.
- [ ] Remove and reorder disposable add-on; verify another Stremio client sees correct collection.
- [ ] Simultaneous collection edit: refreshed conflict rather than stale index deletion; network failure during write requires Sync now.
- [ ] Phone QR opens correct public Stremio Web page with no token; sync after phone install.
- [ ] Update check ignores Android-only releases; no false notification when no compatible stable IPK. QR opens public release page; no automatic install.

## Endurance, failure recovery and release sign-off
- [ ] 30–60 min playback, 5+ episode transitions, 10 source changes, 10 profile switches and repeated browse/search.
- [ ] Test briefly with network disconnected, reconnect, then cold launch; no permanent loading spinner or loss of local state.
- [ ] TV Home/suspend, return and exit; check no overlapping audio, no crash, no persistent decoder lock.
- [ ] Inspector if available: record uncaught errors, repeated requests, long tasks, heap growth after repeated transitions. Redact tokens and URLs.
- [ ] Note initial and worst observed navigation responsiveness; compare with Android as qualitative baseline.
- [ ] Repeat install and key smoke tests on oldest supported webOS 5.0 device before calling that version supported.
- [ ] All blocker cases pass or have an explicit documented supported-platform exception; no data loss, security regression or fatal crash.
- [ ] Record outstanding issues, severity, reproduction, actual/expected result, TV model/firmware, commit, screenshots without secrets.

**Bug template:** ID | severity (blocker/high/medium/low) | TV / firmware | build commit | steps | expected | actual | media codec/container (no private URL) | reproducibility | redacted screenshot/log.

Do not publish a stable release solely on simulator results. Native track support, local file picker and IntroDB availability are hardware/service dependent; classify them rather than treating every missing optional capability as a fatal app bug.
