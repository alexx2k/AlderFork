# Tarn 2.0.0 — unreleased

- Introduce the Tarn identity and television-first visual redesign.
- Use distinct Android packages (`dev.tarn` and `dev.tarn.dev`); fresh installation required.
- Update launcher artwork, app names, development tooling and release asset naming.
- Restrict automatic updates to Tarn production APKs; disable remote crash submission until a Tarn-owned endpoint is available.

Previous Alder Fork and upstream release history follows unchanged.

# Changelog

Write each entry the way you would advertise it to a viewer on the sofa:

- Lead with what the viewer gets, in their words. Say "Torrentio without Real-Debrid", not "P2P sources".
- Start each entry with a short **bold** headline, then one or two short sentences. Keep spotlight descriptions under 25 words before any settings path.
- Use the names that Alder shows on the screen, in **bold**. Say where to find a setting.
- Put each entry under one heading: `### New`, `### Easier to use` or `### Fixes`, in that order, most important first.
- Group small fixes by where the viewer sees them: "Small fixes for Google TV: …".
- Mark at most five entries to show them first in **What's new**. Use `<!-- Spotlight -->` for a text highlight or
  `<!-- Spotlight: whats-new/name.webp -->` for a full 1920×1080 TV screenshot saved as WebP in
  `app/src/main/assets/whats-new/`. Add `<!-- Detail: whats-new/name.webp -->` for a smaller illustration or crop.
  Use `<!-- Player: VLC whats-new/icon.webp -->` to show an example app for external playback.
  Put a bold settings path at the end of the entry to show it on its own line. Remove old pictures after a release.

Put changes that are not released under `## Unreleased`. Before each release, read all of `## Unreleased` again and rewrite
each entry that does not follow these rules. Then rename that heading to the version number.

## 1.5.0

### New
<!-- Spotlight: whats-new/discover.webp -->
- **Explore more with Discover.** Browse films, shows and anime by genre, decade or streaming service in your country.
<!-- Spotlight -->
- **Seamless next episode.** A five-second countdown automatically starts the next episode at the credits. Select **Watch Credits** to cancel.
<!-- Spotlight -->
- **Are You Still Watching?** After three automatically started episodes without remote interaction, confirm before the next one. Choose **Keep Watching**, **Don't Ask Again** or **Stop Watching**.
<!-- Spotlight: whats-new/speed.webp -->
- **Watch at your speed.** Choose 0.75× to 2× in **Playback speed**. Your choice carries over to the next episode.
<!-- Spotlight: whats-new/anime.webp -->
- **Anime has its own tab.** Browse seasons and episodes when your add-ons offer an anime catalog.
- **More playback options.** Use a compatible external player, zoom or stretch the picture, or play supported P2P sources without a debrid account.
- **Make the app yours.** Reorder tabs, change text and poster size, and choose how new episode badges appear.
- **More languages and ratings.** Browse localized title information and Arabic menus, and optionally show Letterboxd ratings using an MDBList key.

### Easier to use
- **Faster, cleaner browsing.** Enjoy improved Home loading, consistent poster cards, search ranking and remote navigation.
- **A better My Alder.** Browse your saved titles in a filterable grid with more title information.
- **Compare and switch sources.** See more source details and change streams without losing your playback position.
- **Keep your favourite provider.** Remembered providers and automatic fallback work with the updated source resolver. Your selected audio language takes priority.
- **Your profiles stay yours.** Local profiles, independent viewing history, custom avatars and phone photo uploads remain available.
- **Clearer sound and subtitles.** Improved audio passthrough and fallback, subtitle matching and playback settings.

### Fixes
- **More reliable playback.** Improved recovery after brief network dropouts, 4K buffering on supported devices and stream failure messages.
- **More reliable subtitles.** Improved handling of subtitle files, ZIP archives and text encodings.
- **Keep your place.** Improved watch-progress saving and resume behaviour, including offline progress for signed-in accounts.
- **Better profile security and navigation.** Improved PIN checks, focus restoration and compatibility with older TV devices.

This release integrates 145 commits from upstream Alder 1.4 while retaining Alder Fork's custom features. Thanks to the original Alder project and its contributors.

## 1.2.0

### New
<!-- Spotlight -->
- **Preferred source add-on.** Choose a source for a show. Alder saves the add-on for this show and profile.
- **Automatic source fallback.** Alder uses the saved add-on for later episodes. If no source is available, Alder selects another add-on.

## 1.1.2

### Fixes
- **Build tools.** Update Gradle and the Android Gradle Plugin for new builds.

## 1.1.1

### Easier to use
<!-- Spotlight -->
- **Profile picture setup.** Select the portrait as you make a profile. Choose an avatar, send a phone photo or use initials.
- **Automatic portrait colour.** Alder selects a random background colour for each new profile. You do not need to choose one.

### Fixes
<!-- Spotlight -->
- **Continue in profile setup.** The Continue button is visible below the keyboard so you can finish the first step.
- **Profile picture selection.** An avatar that you select before you make a profile stays with that profile.

## 1.1.0

### New
<!-- Spotlight -->
- **Local profiles.** Share one Stremio account for streams. Each local profile has its own watch history and My List on this TV.
<!-- Spotlight -->
- **Phone photo upload.** Select **Upload from your mobile phone**. Scan the code and send a JPG photo from a phone on the same Wi-Fi.
<!-- Spotlight -->
- **More avatars.** Select **Browse pre-loaded avatars** to see Netflix, Disney+, HBO Max, Prime Video and Crunchyroll pictures.

### Easier to use
<!-- Spotlight -->
- **Faster avatar gallery.** The gallery loads pictures as you move through the list. It keeps recent pictures in a cache.
- **Avatar collections.** Select **Collection** to show one service or all services. Classic Netflix icons appear first.
- **Clear picture choices.** Select **Use initials instead** to show letters in place of a photo.

### Fixes
- **Avatar gallery display.** Pictures no longer show a second image behind them. The gallery has a black background.
- **Profile picture after restart.** Alder keeps the profile picture you select when you close and open the app.

## 1.4

### New

- **Movies in your language.** Titles, stories, posters and episode names follow Alder's language, not only English. Select **Settings → Language → App language**.
<!-- Spotlight: whats-new/p2p.webp -->
- **Torrentio without Real-Debrid.** Choose a **P2P** source from Torrentio and play it right in Alder, without a debrid account.
<!-- Spotlight: whats-new/discover.webp -->
- **Meet the new Discover tab.** Browse movies, shows and anime in **Discover**. Filter by genre, decade or streaming service in your country.
<!-- Spotlight: whats-new/anime.webp -->
- **Anime has its own tab.** Open **Anime** when your add-ons offer an anime catalog. Pick a series to browse its seasons and episodes.
<!-- Spotlight: whats-new/speed.webp -->
- **Watch at your speed.** Choose 0.75× to 2× in **Playback speed**. Alder remembers your choice for the next episode.
<!-- Spotlight -->
<!-- Player: VLC whats-new/external-icon.webp -->
- **Use an external player.** Choose a video app installed on this TV. Alder passes it the stream, playback position and selected subtitle. **Settings → Streams → Video player**.
<!-- Detail: whats-new/sources.webp -->
- **Find more sources.** Alder checks more add-ons for each title. Slower debrid add-ons have up to 45 seconds to answer.
- **Fill more of your TV screen.** Choose **Zoom** or **Stretch** to make black bars smaller. **Audio & subtitles → Sync & Style → Picture**.
- **Read comfortably from the sofa.** Make text, posters and buttons larger across Alder. **Settings → Picture & Sound → Text and poster size → Large**.
- **Hear lossless surround sound.** Alder can send Dolby TrueHD and DTS-HD to compatible audio equipment. When direct output fails, Alder decodes the same track on the TV.
- **See Letterboxd scores in Alder.** Show a film’s Letterboxd rating beside IMDb or on its own. Add a free **MDBList key** to use Letterboxd. **Settings → Profile → Ratings**.
<!-- Detail: whats-new/episodes.webp -->
- **New episodes at a glance.** A **+1** on a series poster means one episode came out since you last watched. Count aired episodes left in the season or turn badges off. **Settings → Profile → New episode badges**.
- **Use Alder in Arabic.** Read menus, buttons and settings in Arabic. **Settings → Language → App language → العربية**.
- **Send a crash report from your TV.** If Alder crashes, you can send a report the next time you open it. The report leaves out your account details.

### Easier to use

- **Home opens in half a second.** **Continue** shows right away, even after a night off, and background pictures come in faster.
- **The sharpest picture, first.** Press Play and Alder picks the sharpest copy your TV can show, not the first one an add-on lists. Your language and quality choices still come first. The **Add-on's order** choice is now called **Any release**.
- **See the updated My Alder.** The README shows how title details appear above the posters.
- **More space in My Alder.** The title and its details have more room below the filters.
- **Brighter art in My Alder and Discover.** The title you select lights up behind its name, and the posters stay easy to see.
- **See more in Discover.** Above the posters, see a title's year or run, genre, seasons and ratings, like in **My Alder**.
- **See more in My Alder.** See a title's year, genre, seasons and ratings. If you add it on this device, see the date too.
- **See Alder in action.** New pictures in the README show Home, Search, My Alder, and the player on a TV.
- **A cleaner look from Home to playback.** Browse with consistent poster cards and smoother transitions. See more of the picture behind the player controls.
- **Find your saved titles in My Alder.** **My Alder** puts your list in a poster grid you can filter by **Genre** or **Year**. Alder asks before removing a title.
- **Put your favorite tabs first.** Show, hide or reorder tabs, including tabs from your add-ons. **Settings → Profile → Tabs**.
- **Change streams and keep your place.** **Change stream** leaves the picture visible while you choose. The new stream picks up at the same point.
- **Compare streams before you press Play.** Check file size, audio format, seeders and debrid status. You can also show the original listing. **Settings → Streams → Source list → As the add-on writes it**.
- **Get to the right title faster.** **Search** puts closer matches first. Type “Matrix” and **The Matrix** appears ahead of the short film called “Matrix”.
- **Find subtitles that match your video.** Alder puts matching subtitles first. Choose **Gray** when you want softer text in a dark room.
- **Keep your place in Movies and Shows.** When you return to a row, the poster you left is still in focus.
- **Find what’s new in Alder.** The release notes show sharper TV pictures, full titles and settings paths.
- **Know what to try when a stream fails.** Alder names the add-on or service that failed and suggests a next step.

### Fixes

- **Full row names.** **More like** rows show the whole movie name, and long row names end with a whole word instead of stopping mid-word.
- **Keep your audio language.** **My language first** tries your language, then English. Select **Settings → Picture & Sound → Fallback audio language** to try another language before English or turn fallback off.
- **Keep your watch progress offline.** Alder saves where you stopped on the TV and sends it to Stremio again when it can connect.
- **Resume from the same spot.** **Continue Watching**, the title page and the player now use the saved position. This also works if you press **Play** before the title page finishes loading.
- **See Skip intro on more episodes.** The button appears on more anime and MKV videos. It can also reappear when you go back into the intro.
- **Keep browsing when an add-on fails.** One failed add-on can no longer clear **Home**. Adding an add-on also keeps your existing list intact.
- **Fewer pauses on large 4K files.** On TVs with enough memory, Alder can keep up to 200 MB of video ready to play.
- **See why an add-on found no sources.** The source list shows which add-ons came back empty and what happened.
- **Stay on the same stream through short dropouts.** A brief network interruption gives the current stream a chance to recover.
- **Load more subtitle files correctly.** Alder handles subtitles from SubDL and OpenSubtitles, subtitles in ZIP files, and Arabic, Polish and Russian text more reliably.
- **Stay paused when you come back.** A video you paused stays paused when you leave Alder and return.
- **See the right Watch Next items on Google TV.** The row follows the active profile. Alder also keeps its channel logo and shows a clearer launcher icon.
- **Open Alder on older TVs again.** Fixed a startup crash on Android 6 and 7 and reduced memory use on older devices.
- **Get the right 4K label and source.** Wide 4K films show **4K**, and **Best picture** can choose a 4K source even on TVs that report a lower resolution.
- **Keep locked profiles behind their PIN.** Alder asks for the PIN when you enter a locked profile from the profile picker.
- **Keep sign-ins tied to this TV.** Android backups exclude Alder profiles, sign-ins and PINs. Sign in again when you move to another TV.
- **Reopen Alder after switching back to an older build.** Fixed a startup crash when Alder reads a profile saved by a newer build.
- **Keep Search results steady as add-ons reply.** Visible posters load first. If a poster still fails after a retry, its card shows the title name.
- **Keep remote focus when the screen updates.** Focus stays on the title page while its details refresh. Removing the last **Continue Watching** poster moves focus to the next row or the top bar.
- **Keep Discover results in step with your filters.** Fast filter changes show the latest results. Larger text leaves room for the filter bar, and Right works across **Discover** and **My Alder** filters in Arabic.

## 1.3.1

### Fixes
- **Alder.apk download.** The release file uses the Alder.apk name.

## 1.3

### New
<!-- Spotlight -->
- **Alder in your language.** Alder shows menus, buttons and settings in Spanish, Portuguese, French, German, Hindi or Italian. Alder uses the TV language. To change it, select **Settings → Language → App language**.
<!-- Spotlight -->
- **Trailers on the title page.** Select **▷ Trailer** on a movie or show to play its trailer. Alder does not add trailers to your watch history.
- **Subtitle colors.** Choose White, Yellow, Cyan, Cream, or Warm white in **Settings → Subtitles** or while you watch in **Audio & subtitles**.
<!-- Spotlight -->
- **Live TV and sport.** If your add-ons have TV channels, sport or events, select **Live** at the top. Select a channel to play it. To choose a source, hold OK.
<!-- Spotlight -->
- **Directors and cast.** See directors and lead actors on the title screen. Select a person to see their other works. A label shows the title and year of the focused poster. Select **ⓘ** to see the full story and all cast members with portraits.
<!-- Spotlight -->
- **Chapter markers and chapter snap.** See chapter marks and intro marks on the progress bar. Press Up on the bar to jump between chapters.
<!-- Spotlight -->
- **Clear dialogue.** Turn on **Settings → Clear dialogue** to boost voices above music and loud effects on TV speakers. You can also turn it on while you watch.
- **Foreign audio subtitles.** Alder can start subtitles automatically only when the audio is in a different language. Select **Settings → Subtitles → Foreign audio only**.
- **Still watching?** If you do not press a remote button for 3 episodes, Alder stops before the next episode. Select **Play** or **Exit to Home**.
- **Sleep timer.** In the player, select **Audio & subtitles**, then select **Sleep**. Choose **After this episode** or **In 60 min**.
- **Mark episodes as watched.** Hold OK on an episode in the episode guide. Select **Mark as watched**, **Mark as unwatched**, or **Mark previous episodes watched**. Hold OK on a season button to mark all episodes of that season.
- **New episode tags.** A tungsten tag shows on Continue Watching when a new episode is available.
- **Protect unreleased episodes.** Alder shows the air date for future episodes and disables playback until they air.
- **Default tab.** Choose which tab opens when you start Alder. Select **Settings → Profile → Default tab**.
- **Show or hide tabs.** Turn tabs on or off in **Settings → Profile**.
- **Featured rows on Home.** Show top recommendations and popular titles below Continue Watching. Turn on **Settings → Profile → Featured on Home**.
- **Hide rows.** Hold OK on a title in a row, then select **Hide row**. To put it back, select **Settings → Profile → Hidden rows**.
- **30 GB file limit.** Select **30 GB** in **Settings → Largest file**.
- **Blur episode thumbnails.** Turn on **Settings → Profile → Blur episode thumbnails**. Alder blurs pictures of unwatched episodes to prevent spoilers.

### Easier to use
<!-- Spotlight -->
- **House Lights logos.** Alder uses the tungsten mark on the TV banner, transparent app icon, and small transparent logo. The profile picker and Settings headers use vector art.
- **Content ratings on the title page.** A badge shows the content rating, for example PG-13, R, or TV-MA, before the year.
- **Compact Up next prompt.** The Up next card uses a smaller width, smaller text, and a single Next episode button.
- **QWERTY Search keys.** The Search keyboard uses QWERTY letter rows. The microphone icon stays dim until voice search is available.
- **Audio and subtitle tabs.** Select **Subtitles**, **Audio**, or **Sync & Style**. Active, preferred, and recent tracks appear first. Adjust subtitle sync in the panel.
- **Clearer title page.** Cast names stay clear in dark glass capsules.
- **Clearer menus.** Add-on lists, Search, and choice menus use glass that is easy to read.
- **Clearer player controls.** The control bar shows more video. Player tags and panels use dark glass.
- **What's new showcase.** The update screen shows important changes first. Select **See all changes** to read the full list.
<!-- Spotlight -->
- **Direct play.** When you select Play, Alder starts the video directly. A progress indicator shows while Alder finds the best source. To see all sources, hold OK.
<!-- Spotlight -->
- **Cinematic video start.** When you select Play, Alder shows the title art and bottom controls immediately. The progress bar pulses with warm light while Alder connects to the source, and the video fades in smoothly.
- **Format and debrid badges in the player.** Open the player controls to see badges for resolution, Dolby Vision, HDR, Dolby Atmos, DTS, audio language, subtitles, and your debrid service below the title.
- **Faster access to Audio & subtitles.** Press Left once from Play / Pause in the player to open **Audio & subtitles**.
- **Live subtitle sync.** Adjust subtitle delay with Left and Right while the video plays. This works for embedded subtitles and add-on subtitles.
- **Close player controls.** Press Back to close the controls while the video plays. Press Back again to leave the player.
- **Exact subtitle remembered.** When you play a video again, Alder uses the exact subtitle track that you selected before.
- **Update notification dot.** A dot on your profile avatar shows when a new version of Alder is ready.
- **Install an update from the profile menu.** Select your profile avatar, then select **Install update**. Alder installs version 1.3 over version 1.2.
- **Faster update checks.** Alder checks for new releases every 4 hours instead of once a day.

### Fixes
- **Subtitle language list in Audio & subtitles.** All add-on subtitle languages appear under Subtitles. Quick sync sits below the list so remote focus moves smoothly.
- **Up next episode card.** When credit times are available, Alder shows Up next only after the credits start. The fallback starts in the final 15 to 25 seconds.
- **Skip intro button.** Alder reads MKV intro chapters first. Alder filters IntroDB segments with low confidence and stops false prompts at the start of a video.
- **Remote focus and scroll in Audio & subtitles.** When you select a track, remote focus stays on it and the list keeps its position. The list moves smoothly and stays in its panel.
- **Smoked glass overlay in Audio & subtitles.** The Audio & subtitles sheet uses the Alder smoked glass recipe for high contrast over video.
- **Cleaner title page.** The light around **Play** and **Resume** sits in the center. Cast names stay inside the screen margins. Action buttons align in the center.
- **Install on Fire TV.** Alder installs on Fire TV and Fire OS devices without a package parse error.
- **Support older TV devices.** Alder supports Android 6.0 and Fire OS 6 devices, such as Fire TV Stick 4K.
- **Cleaner player controls.** The audio, subtitle, format, and debrid badges sit in one row below the title, and the top progress bar no longer appears while you seek.
- **Back button on Android 16.** The Back button closes panels and player controls correctly on Android 16.

## 1.2

### New
- **Sources in your language.** Select a language above the source list. Alder shows only the sources in that language.
- **All audio and subtitle languages.** Select them in **Settings**. Each profile keeps its own languages.
- **Alder keeps your player choices.** The next episode starts with the audio and the subtitles that you selected.
- **Remove titles from Continue Watching.** Hold OK on a title. To put it back, select **Settings → Profile → Hidden from Continue Watching**.
- **See the debrid service.** The source list and the player show the service, for example **RD** for Real-Debrid.

### Easier to use
- **Help when there is no source.** Alder tells you why. Scan the QR code to set up the add-on on your phone. Then select **Try again**.
- **See your subtitles quickly.** The player shows the audio and the subtitles that play.
- **What's new after each update.** To read it again, select **Settings → About → What's new**.

### Fixes
- **Fixed sources that did not show.** Add-ons with an http:// address work. Some add-ons do not block Alder now. Dolby Vision sources show on all TVs.
- **Fixed skip forward.** Some movies, for example .ts files, do not start again from the beginning.
- **Fixed empty pages.** When an add-on gives no details, Alder uses the next add-on. All AIOMetadata catalogs show.
- **Fixed sign-in problems.** A profile stays after Stremio signs it out. Alder tells you when 2 profiles use the same account.
- **Fixed updates on Fire TV.** Alder does not stop during an update.
- **Fixed language problems.** Subtitles and audio tracks match in all add-ons.

## 1.1

- Each profile keeps its own streaming add-ons. Add-ons that you add or remove in Stremio show in Alder on the next page.
- Continue Watching shows correctly when Home opens for the first time.
- The **Audio & subtitles** panel in the player opens correctly.
- In **Search**, the selected poster is no longer cut off at the top.

## 1.0

- **Press Play and it plays.** Alder picks a good source and starts it. Hold OK on **Play** to see every source.
- **Automatic fallback.** When a stream fails, Alder tries the next one from the same second.
- **Only what your TV can play.** Alder checks your TV for 4K, HDR, Dolby Vision, HEVC, AV1 and DTS. It hides files that the TV cannot play.
- **Profiles.** Up to 5 profiles, each with its own Stremio account. A PIN is optional.
- **Stream preferences in plain words:** **Best picture**, **Balanced** or **Fast start**.
- **Series.** The next episode keeps the same release and quality. **Skip intro** is built in.
- **Continue Watching on the Google TV home screen.**
- **Frame-rate matching.** The TV changes to the film's frame rate.
- **Sync with Stremio.** Watch progress matches your phone and computer.
- **Updates.** Alder finds new versions on GitHub and installs them.
