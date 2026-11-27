# Tarn — Editorial development identity

Provisional working identity, not a release or legal clearance. Based on the approved written description of an arc and two flowing ribbons; the original raster board was not available in the development session. The geometry is an original, editable draft, not a crop or a trace. The outlined wordmark has four independent letter paths and requires no font at render time. Dark-background SVGs use flat silver, lake blue and slate blue; the dark monochrome and light-background variants use midnight/deep blue. The simplified solid palette is intentional for television-distance recognition and the API 23 minimum.

## Tokens and components

- Black #000000: base, title scrims, black-on-light buttons.
- Midnight #0B1624: solid panels and placeholders.
- Deep Blue #1E3A54: focused panel face.
- Slate Blue #3F6D89: quiet edges.
- Lake Blue #8CB9CF: focus outline and accent.
- Silver #E6F1F6: primary text.
- #C3D5DF and #9BB0C0: secondary and muted text.
- #24384A: progress track.

`TarnPalette.kt` owns programmatic colour tokens; XML colours mirror the six core tokens for Android themes and launcher assets. Existing Screen constants keep caller compatibility. Shared Screen functions own controls, cards, dialogs, chips, rows, focus, layout sizes and motion. Inter is the existing licensed typeface; headings use its semibold weight instead of loading Instrument Serif at runtime. Existing font files, licenses and attribution remain unchanged. Layout metrics, user scale settings and focus order are retained; verify long headings and all languages on TV.

Opaque panels replace frost rendering. An explicit 2 dp outline and/or scaling identifies focus; selection still uses existing dots, checks and text. Art masks and player control gradients remain where useful for legibility. Static launch artwork uses the system starting window and does not add a wait or video.

## Asset locations

- Editable SVGs in this directory: horizontal, stacked, symbol, wordmark, light-background, monochrome-light, monochrome-dark.
- Native vectors: `app/src/main/res/drawable/ic_alder_mark.xml` and `tarn_lockup.xml`.
- Android 8+ adaptive source asset: `drawable-anydpi-v26/logo.xml` (retained for internal compatibility).
- Manifest launcher icon: `drawable-nodpi/tarn_launcher_icon.png`, a transparent symbol-only raster, intentionally without an adaptive background or square frame. Fire OS sideloaded app tiles can ignore the Leanback banner and add their own side padding; this fallback avoids a second opaque tile inside the launcher plate. `tarn_launcher_banner.png` remains the full-bleed 320×180 Android TV banner. Fire OS controls the final tile shape; verify on device.
- PNG launchers: `drawable-nodpi/banner.png` (320×180), `logo.png`, `logo_foreground.png`, `logo_transparent.png` (144×144). Legacy resource names deliberately retained for compatibility, including the Watch Next URI. Bitmaps are rasterised from the same paths.
- Old upstream artwork and historical screenshots in documentation are not rebranded.

## Release gates

Compare the reconstructed paths against the original approved board before final adoption. Verify launcher crop on Fire TV and Google TV, lockup readability, and contrast over real art. Complete UKIPO/EUIPO/other relevant market trademark searches, domain and app-store naming checks, and confirm all upstream and bundled asset rights. Preserve the GPL-3.0 license, original copyright, Nuvio/Just Player/stremio-core/AndroidX acknowledgements, font licenses and Nuvio Engine notices. Existing avatar artwork may require separate rights review before public distribution. No repository rename, application ID change, production signing change or release has been made.
