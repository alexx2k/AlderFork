# Tarn webOS pre-release audit

Scope: all code under `platforms/webos/` on feature/webos-client, beginning at 467b972d186c7e101eb51769fcd420e30a2aa24d. Android and main are out of scope. Package remains development ID `dev.tarn.webos.dev`, version 0.6.0. Existing poster-card JSX and CSS geometry are preserved.

## Confirmed issues addressed

| Area | Finding | Change |
| --- | --- | --- |
| Cloud identity | Previously bound profile could enqueue writes before verification of current token's account. | Require current user ID to equal durable binding. Before verification, changes remain local only. |
| Library resilience | JSON shape check admitted malformed rows/queues and could crash on render. | Validate rows and action queues, quarantine damaged data, retain recovery copy; if copy cannot be saved, keep original and pause writes. |
| Network memory | JSON and external subtitle responses were buffered without hard streaming limits. | Bound streaming reads (JSON 32 MiB, diagnostics 4 MiB, subtitles 2 MiB), cancel overflowing readers. Nonstreaming fallback checks after allocation. |
| Media lifecycle | Diagnostics left sample decoder/network active on navigation; stale play promise could change new-source UI. | Cancel probes, release decoder, ignore stale results. |
| Source retry | Source-local duration and focus survived retries; rejected old play promises could affect new attempts. | Clear attempt duration, restore focus, guard promise against serial. |
| Seeking | Skip and transport seek handling inconsistent; unresolved resume target could suppress updates indefinitely. | Validate seekable ranges, settle unconfirmed target after deadline when media is not seeking, record seeked snapshots. |
| Rewatch | The completion guard stayed set when replaying a finished video or selecting another source after natural end. | Reset progress tracking for a deliberate replay. |
| Focus | Episode options and sign-out dialog were not included in directional focus scope; Back left title rather than closing episode options. | Scope directional focus to active dialog and restore focus. |
| Link lifecycle | A profile-save failure could leave sign-in stuck at Opening Tarn; new code could be requested during save. | Propagate save failure to sign-in and disable buttons during commit. |
| Storage | Foundation DB handles were opened during each profile activation and not closed. | Close handles at cleanup and after initial name read. |
| Chromium 68 | Native lazy loading unsupported; Array.sort stable ties not guaranteed. | Shared IntersectionObserver fallback for artwork, explicit stable tie-breakers. |
| Cache | Entry count alone did not bound memory. | Approximate 8 MiB serialized-size LRU budget, 80-entry and TTL bounds retained. |
| Credits | Generic ending chapter could be interpreted as credits; known post-credits scenes could be skipped by autoplay. | Conservative chapter names and postpone autoplay until known scene ends; manual final-credit skip still lands at segment end. |
| Add-on permissions | String-valued protection flags were not consistently enforced. | Recognise true and "true" for protection and official lending exclusions. |

## Outstanding release gates

- Actual npm dependency installation, TypeScript typecheck, entire Node suite and Chrome 68 bundle build; execute `npm run audit`. Connector-only source review cannot replace them.
- Real webOS 5.0 and newer: codec matrix, Dolby audio, native tracks, seekable ranges, CORS/TLS, local file picker, long-running memory and focus testing.
- Source preparation resolves URLs only, not a second decoder. Playback gaps remain possible.
- Cloud writes are whole collection or datastore item operations without compare-and-swap. Verify on a disposable account; no cross-device race guarantee. Local-only actions before account verification are not automatically replayed. Unknown remote watched bits are preserved, but unsupported mappings need live validation.
- Native embedded subtitle styling, phone LAN avatar upload, thumbnail metadata, system integrations and IPK self-installation remain device/platform limitations.
- Content cache budget estimates serialized size, not actual JS heap; catalogue DOM is not virtualised. Storage recovery is best effort and does not automatically restore damaged records.
- No hardware-backed credential vault: profile PIN is a household lock, not cryptographic authentication. Do not share private transport URLs, login codes, tokens or inspector logs. HTTP providers are unencrypted; prefer trusted HTTPS.
- Full security penetration test, dependency vulnerability scan, LG store certification and physical-device memory profiling are outside the executed source checks.

Do not merge or publish until the checklist's release gates pass.

## Executed verification

- 91 focused cases passed against exact JS module source using an injected fixture URL implementation and assertion harness (audit policy, profiles, player preferences, advanced playback, viewing, add-ons, customisation). This is not the full Node suite.
- 4 additional Node 22.16 native smoke tests passed using the exact `auditPolicy.mjs` verified by Git blob SHA `dc8971805441098cf604a077cb17241b2a82e361`. Native Response and ReadableStream were exercised. The same tests are checked in as `tests/auditNative.test.mjs`.
- One new catalogue cache regression case is included in the normal Node suite, awaiting local execution. Browser lifecycle fixes require actual simulator/TV tests.
