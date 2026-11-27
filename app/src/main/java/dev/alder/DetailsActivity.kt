package dev.alder

import android.content.Intent
import android.content.SharedPreferences
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.TextUtils
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextClock
import android.widget.TextView
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal fun castChipLabel(member: CastMember): String = member.name

/**
 * Selects the people shown on the title page's compact cast strip: at most one primary director plus lead actors,
 * capped so the strip fits inside the hero column without horizontal scrolling.
 */
internal fun heroCastPreview(allMembers: List<CastMember>, maxCount: Int = 3): List<CastMember> {
    if (allMembers.isEmpty() || maxCount <= 0) return emptyList()
    val directors = allMembers.filter { it.isDirector }
    val actors = allMembers.filterNot { it.isDirector }
    if (actors.isEmpty()) return directors.take(maxCount)
    val ordered = listOfNotNull(directors.firstOrNull()) + actors
    return ordered.take(maxCount)
}

private val dayPattern = Regex("\\d{4}-\\d{2}-\\d{2}")

// Made once per thread, not per episode: building them for every episode of every series in Continue held Home's
// main thread for 1.5 s at start (SimpleDateFormat isn't thread-safe, so not one shared copy).
private class EpisodeDates {
    val utcDay = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false; timeZone = TimeZone.getTimeZone("UTC") }
    val utcTime = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    val localDay = SimpleDateFormat("yyyy-MM-dd", Locale.US)
}
private val episodeDates = object : ThreadLocal<EpisodeDates>() { override fun initialValue() = EpisodeDates() }

internal fun isEpisodeAired(released: String?, now: Long = System.currentTimeMillis()): Boolean {
    if (released.isNullOrBlank()) return true
    val day = released.take(10).takeIf { it.matches(dayPattern) } ?: return true
    val f = episodeDates.get()!!
    if (runCatching { f.utcDay.parse(day) }.getOrNull() == null) return true

    if (released.length >= 19 && released.contains('T')) {
        val full = runCatching { f.utcTime.parse(released.take(19)) }.getOrNull()
        if (full != null && full.time <= now) return true
    }

    f.localDay.timeZone = TimeZone.getDefault()
    val localToday = f.localDay.format(Date(now))
    val utcToday = f.utcDay.format(Date(now))
    return day <= localToday || day <= utcToday
}

/** "14 Nov" for an episode that airs later, in the viewer's language; the screen puts it in "Airs …". */
internal fun airDay(released: String?, locale: Locale = Locale.getDefault()): String? {
    val day = released?.take(10)?.takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) } ?: return null
    val source = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false; timeZone = TimeZone.getTimeZone("UTC") }
    val parsed = runCatching { source.parse(day) }.getOrNull() ?: return null
    return SimpleDateFormat("d MMM", locale).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(parsed)
}

internal fun isRecentlyAired(released: String?, now: Long = System.currentTimeMillis()): Boolean {
    if (!isEpisodeAired(released, now)) return false
    val day = released?.take(10)?.takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) } ?: return false
    val source = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false; timeZone = TimeZone.getTimeZone("UTC") }
    val parsed = runCatching { source.parse(day) }.getOrNull() ?: return false
    val age = now - parsed.time
    return age in 0..(8L * 24 * 60 * 60 * 1000L)
}

internal fun episodeDate(value: String?, locale: Locale = Locale.getDefault()): String? {
    val day = value?.take(10)?.takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) } ?: return null
    val source = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false; timeZone = TimeZone.getTimeZone("UTC") }
    val parsed = runCatching { source.parse(day) }.getOrNull() ?: return null
    return SimpleDateFormat("d MMM yyyy", locale).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(parsed)
}

internal enum class HeroControlFocus {
    PLAY,
    TRAILER,
    START_OVER,
    LIST,
    INFO,
    CAST,
}

internal data class HeroFocusState(
    val control: HeroControlFocus = HeroControlFocus.PLAY,
    val castIndex: Int = 0,
)

internal data class DetailsOverlayState(
    val guideOpen: Boolean = false,
    val infoOpen: Boolean = false,
    val similarOpen: Boolean = false,
    val filmographyOpen: Boolean = false,
) {
    val anyOpen: Boolean
        get() = guideOpen || infoOpen || similarOpen || filmographyOpen
}

internal enum class FilmographyReturnTarget {
    LAST_FOCUSED_ACTOR,
    INFO_OVERLAY,
    PLAY_BUTTON,
}

internal fun shouldShowHero(overlays: DetailsOverlayState): Boolean = !overlays.anyOpen

internal fun shouldRefreshHeroOnOverlayClose(
    heroNeedsRefresh: Boolean,
    overlays: DetailsOverlayState,
): Boolean = heroNeedsRefresh && !overlays.anyOpen

internal fun shouldCloseInfoOnRestart(infoOpen: Boolean, filmographyOpen: Boolean): Boolean =
    infoOpen && !filmographyOpen

internal fun shouldRefreshInfoOnCastLoad(infoOpen: Boolean, filmographyOpen: Boolean): Boolean =
    infoOpen && !filmographyOpen

internal fun shouldIncludeResumeAtExtra(resumeAt: Long, startOver: Boolean): Boolean =
    !startOver && resumeAt > 0L

internal fun resolveHeroFocusTarget(
    saved: HeroFocusState,
    hasTrailer: Boolean,
    hasStartOver: Boolean,
    castCount: Int,
): HeroFocusState = when (saved.control) {
    HeroControlFocus.TRAILER -> if (hasTrailer) saved else HeroFocusState(HeroControlFocus.PLAY)
    HeroControlFocus.START_OVER -> if (hasStartOver) saved else HeroFocusState(HeroControlFocus.PLAY)
    HeroControlFocus.CAST -> if (castCount > 0) {
        HeroFocusState(HeroControlFocus.CAST, saved.castIndex.coerceIn(0, castCount - 1))
    } else {
        HeroFocusState(HeroControlFocus.PLAY)
    }
    HeroControlFocus.PLAY, HeroControlFocus.LIST, HeroControlFocus.INFO -> saved
}

internal fun resolveFilmographyReturnTarget(
    actorAttached: Boolean,
    infoOpen: Boolean,
): FilmographyReturnTarget = when {
    actorAttached -> FilmographyReturnTarget.LAST_FOCUSED_ACTOR
    infoOpen -> FilmographyReturnTarget.INFO_OVERLAY
    else -> FilmographyReturnTarget.PLAY_BUTTON
}

internal fun resolveFilmographyHeroFocus(
    actorAttached: Boolean,
    castIndex: Int,
): HeroFocusState = if (actorAttached && castIndex >= 0) {
    HeroFocusState(HeroControlFocus.CAST, castIndex)
} else {
    HeroFocusState(HeroControlFocus.PLAY)
}

// A title stays in place over its art; episodes and related titles open over the same scene.
class DetailsActivity : Screen() {
    private val type by lazy { intent.getStringExtra("type") ?: "movie" }
    private val metaId by lazy { intent.getStringExtra("id")!! }
    private val name by lazy { intent.getStringExtra("name") ?: "" }
    private val poster by lazy { intent.getStringExtra("poster") }
    private val initialArt by lazy { intent.getStringExtra("background") }

    private lateinit var key: String
    private lateinit var libraryProfile: Profile
    override val backdrop get() = heroArt
    private lateinit var root: FrameLayout
    private lateinit var hero: FrameLayout
    private lateinit var heroArt: ImageView
    private lateinit var guide: FrameLayout
    private lateinit var guideRows: LinearLayout
    private lateinit var seasonStrip: LinearLayout
    private var seasonButtons = emptyMap<Int, TextView>()
    private lateinit var previewImage: ImageView
    private lateinit var previewTitle: TextView
    private lateinit var previewFacts: TextView
    private lateinit var previewAbout: TextView
    private lateinit var previewProgress: FrameLayout
    private lateinit var similarOverlay: FrameLayout
    private var similarFirst: View? = null
    private lateinit var buttonRow: LinearLayout
    private val castChips = mutableListOf<View>()
    private lateinit var filmographyOverlay: FrameLayout
    private var filmographyOpen = false
    private var filmographyFirst: View? = null
    private var lastFocusedActor: View? = null
    private lateinit var listButton: TextView
    private lateinit var playButton: TextView
    private lateinit var infoButton: TextView
    private var trailerButton: TextView? = null
    private var startOverButton: TextView? = null
    private lateinit var infoOverlay: FrameLayout
    private var guideOpen = false
    private var similarOpen = false
    private var infoOpen = false
    private var heroNeedsRefresh = false

    private fun overlays() = DetailsOverlayState(guideOpen, infoOpen, similarOpen, filmographyOpen)

    private fun anyOverlayOpen() = overlays().anyOpen
    private val infoCastCards = mutableListOf<View>()
    private var storyScrollView: ScrollView? = null
    private var richCast: List<CastMember> = emptyList()
    private var castStripSlot: FrameLayout? = null
    private var selectedSeason = 1
    private var episodeRows = emptyList<View>()
    private var meta: Meta? = null
    private val episodic get() = hasEpisodes(type, meta?.videos)
    private var item: JSONObject? = null // the title's library item: progress and whether it's in My List
    private var itemChangedHere = false
    private var savingEdit = false
    private var similarRequested = false
    private var imdbTrailers: List<Stream> = emptyList()
    private var trailerRequested = false
    private var certificate: String? = null
    private var certificateRequested = false
    private var letterboxdScore: String? = null
    private var letterboxdRequested = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        libraryProfile = Profiles.active(this) ?: return finish()
        key = libraryProfile.authKey
        val artWidth = resources.displayMetrics.widthPixels
        heroArt = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; alpha = 0f }
        hero = FrameLayout(this).apply { clipChildren = false }
        root = FrameLayout(this).apply {
            clipChildren = false
            addView(hero, FrameLayout.LayoutParams(-1, -1))
            addView(TextClock(this@DetailsActivity).apply {
                format12Hour = "h:mm a"
                format24Hour = "HH:mm"
                textSize = SMALL
                setTextColor(TEXT_2)
                typeface = text("", SMALL).typeface
            }, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.END).apply {
                topMargin = dp(36); rightMargin = dp(PAD)
            })
            val (loading, loadingText) = loadingOverlay()
            loadingView = loading
            loadingStatus = loadingText
            addView(loadingView, FrameLayout.LayoutParams(-1, -1))
        }
        setWindowed(root, heroArt)

        // The art arrives: a touch close, settling back as the page opens (a transform only, no redraw of the art).
        (initialArt ?: poster)?.let { Images.load(it, heroArt, artWidth, urgent = true) {
            heroArt.alpha = 1f; heroArt.scaleX = ARRIVE; heroArt.scaleY = ARRIVE
            heroArt.enter(ART_MS).scaleX(1f).scaleY(1f).start()
            refrost()
        } }

        fun show(m: Meta) {
            meta = m
            val art = m.background ?: initialArt ?: poster
            if (heroArt.tag != art) Images.load(art, heroArt, artWidth, urgent = true) {
                heroArt.enter().alpha(1f).start()
                refrost()
            }
            richCast = m.castMembers
            certificate = m.certification ?: certificate
            val wasGuide = guideOpen // fresh details can land while the guide is open: rebuild it open, as onRestart does
            if (anyOverlayOpen()) heroNeedsRefresh = true else showHero(m)
            if (hasEpisodes(type, m.videos) && m.videos.isNotEmpty()) { buildGuide(m.videos); if (wasGuide) showGuide() }
            if (!hasEpisodes(type, m.videos) && !similarRequested) { similarRequested = true; loadSimilar() }
            loadRichCast()
            if (!certificateRequested && certificate == null && m.id.startsWith("tt")) {
                certificateRequested = true
                background<String?>({ imdbCertificate(m.id) }) { r ->
                    val resolved = r.getOrNull()
                    if (resolved != null && resolved != certificate) {
                        certificate = resolved
                        if (anyOverlayOpen()) heroNeedsRefresh = true else showHero(meta)
                    }
                }
            }
            if (!letterboxdRequested && Settings.wantsLetterboxd(this, type, m.id)) {
                letterboxdRequested = true
                letterboxdScore = knownLetterboxd(m.id)
                val key = Settings.mdblistKey(this)
                background({ letterboxd(m.id, key, fresh = true) }) { r ->
                    val score = r.getOrNull()
                    if (score != null && score != letterboxdScore) {
                        letterboxdScore = score
                        if (anyOverlayOpen()) heroNeedsRefresh = true else showHero(meta)
                    }
                }
            }
            if (!trailerRequested && m.id.startsWith("tt")) {
                trailerRequested = true
                background({ imdbTrailerStreams(m.id) }) { r ->
                    val resolved = r.getOrDefault(emptyList())
                    if (resolved.isNotEmpty()) {
                        val hadTrailer = m.trailerStreams.isNotEmpty() || m.trailerYtId != null || imdbTrailers.isNotEmpty()
                        imdbTrailers = resolved
                        if (!hadTrailer) {
                            if (anyOverlayOpen()) heroNeedsRefresh = true else showHero(meta)
                        }
                    }
                }
            }
        }
        background({
            (Stremio.savedAddons(key) ?: Stremio.addons(key)).savedMeta(type, metaId, episodes = true) to ProfileLibrary.savedLibrary(applicationContext, libraryProfile)?.firstOrNull { it.optString("_id") == metaId }
        }) { result ->
            result.getOrNull()?.let { (saved, libraryItem) ->
                if (!itemChangedHere && item == null && libraryItem != null) {
                    item = libraryItem
                    if (meta != null) {
                        if (anyOverlayOpen()) heroNeedsRefresh = true else showHero(meta)
                    }
                }
                if (meta == null) saved?.let(::show)
            }
        }
        background({ Stremio.addons(key).meta(type, metaId, together = true, reportFailure = true, episodes = true) }) { result ->
            val fresh = result.getOrNull()
            if (fresh != null) show(fresh)
            else if (meta == null) {
                val failure = result.exceptionOrNull()?.let(::failureOf) ?: Failure.MISSING
                FailureLog.record(FailureLog.Operation.DETAILS, failure)
                showHero(null, failure)
            }
        }
        background({ ProfileLibrary.library(applicationContext, libraryProfile, listOf(metaId)).firstOrNull() }) { result ->
            if (!itemChangedHere && !savingEdit) {
                val loaded = result.getOrNull()
                if (loaded != null) item = loaded
                if (meta != null) {
                    if (anyOverlayOpen()) {
                        if (loaded != null) heroNeedsRefresh = true
                    } else {
                        showHero(meta)
                    }
                }
            }
        }
    }

    // ---------- title and watch window ----------

    private fun captureHeroFocus(): HeroFocusState? {
        val focused = currentFocus ?: return null
        if (!::hero.isInitialized || !isInside(focused, hero)) return null
        val castIndex = castChips.indexOfFirst { it === focused || isInside(focused, it) }
        if (castIndex >= 0) return HeroFocusState(HeroControlFocus.CAST, castIndex)
        return when {
            ::playButton.isInitialized && (focused === playButton || isInside(focused, playButton)) ->
                HeroFocusState(HeroControlFocus.PLAY)
            trailerButton?.let { focused === it || isInside(focused, it) } == true ->
                HeroFocusState(HeroControlFocus.TRAILER)
            startOverButton?.let { focused === it || isInside(focused, it) } == true ->
                HeroFocusState(HeroControlFocus.START_OVER)
            ::listButton.isInitialized && (focused === listButton || isInside(focused, listButton)) ->
                HeroFocusState(HeroControlFocus.LIST)
            ::infoButton.isInitialized && (focused === infoButton || isInside(focused, infoButton)) ->
                HeroFocusState(HeroControlFocus.INFO)
            else -> HeroFocusState(HeroControlFocus.PLAY)
        }
    }

    private fun heroFocusView(target: HeroFocusState): View? = when (target.control) {
        HeroControlFocus.PLAY -> if (::playButton.isInitialized) playButton else null
        HeroControlFocus.TRAILER -> trailerButton ?: if (::playButton.isInitialized) playButton else null
        HeroControlFocus.START_OVER -> startOverButton ?: if (::playButton.isInitialized) playButton else null
        HeroControlFocus.LIST -> if (::listButton.isInitialized) listButton else null
        HeroControlFocus.INFO -> if (::infoButton.isInitialized) infoButton else null
        HeroControlFocus.CAST -> castChips.getOrNull(target.castIndex) ?: if (::playButton.isInitialized) playButton else null
    }

    private fun restoreHeroFocus(target: View?) {
        if (target == null || anyOverlayOpen()) return
        if (!hero.isAttachedToWindow || !target.requestFocus()) {
            target.post { if (!anyOverlayOpen() && target.isAttachedToWindow) target.requestFocus() }
        }
    }

    private fun refreshHeroIfNeeded(
        preferredFocus: HeroControlFocus? = null,
        preferredCastIndex: Int = 0,
    ): Boolean {
        if (!shouldRefreshHeroOnOverlayClose(heroNeedsRefresh, overlays())) return false
        val currentMeta = meta ?: return false
        val focusState = preferredFocus?.let { HeroFocusState(it, preferredCastIndex) }
        showHero(currentMeta, preferredFocus = focusState)
        return true
    }

    private fun revealHero(preferredFocus: HeroControlFocus) {
        if (!shouldShowHero(overlays())) return
        hero.visibility = View.VISIBLE
        if (!refreshHeroIfNeeded(preferredFocus)) {
            when (preferredFocus) {
                HeroControlFocus.INFO -> if (::infoButton.isInitialized) infoButton.requestFocus()
                else -> if (::playButton.isInitialized) playButton.requestFocus()
            }
        }
    }

    private fun showHero(
        m: Meta?,
        failure: Failure? = null,
        preferredFocus: HeroFocusState? = null,
    ) {
        heroNeedsRefresh = false
        val savedFocus = preferredFocus ?: captureHeroFocus() ?: HeroFocusState(HeroControlFocus.PLAY)
        castChips.clear()
        castStripSlot = null
        trailerButton = null
        startOverButton = null
        hero.removeAllViews()
        val title = text(m?.name ?: name, SERIF_HERO, serif = true).onArt().apply {
            maxLines = 2; ellipsize = TextUtils.TruncateAt.END; gravity = Gravity.BOTTOM or Gravity.START
            // The box is a fixed height: at large font sizes a two-line name shrinks to fit instead of clipping.
            // Android 8+ only; older TVs ellipsize the second line instead.
            if (android.os.Build.VERSION.SDK_INT >= 26)
                setAutoSizeTextTypeUniformWithConfiguration(20, SERIF_HERO.toInt(), 1, android.util.TypedValue.COMPLEX_UNIT_SP)
        }
        val titleArea = FrameLayout(this).apply {
            addView(title, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM or Gravity.START))
            if (m != null) {
                val logo = ImageView(this@DetailsActivity).apply {
                    adjustViewBounds = true
                    scaleType = ImageView.ScaleType.FIT_START
                    maxWidth = dp(260)
                    maxHeight = dp(75)
                    visibility = View.GONE
                }
                addView(logo, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START))
                Images.load(m.logo ?: Images.logoFor(m.id), logo, dp(520), urgent = true, failed = {
                    title.visibility = View.VISIBLE; logo.visibility = View.GONE
                }) {
                    title.visibility = View.GONE; logo.visibility = View.VISIBLE
                }
            }
        }
        val stack = column(Gravity.START).apply { addView(titleArea, LinearLayout.LayoutParams(-1, -2)) }
        if (m == null) {
            val error = failed(failure?.let { failureMessage(R.string.details_load_failed, it) }
                ?: getString(R.string.details_load_failed)) { recreate() }
            stack.addView(error.marginTop(16))
            error.post { if (!anyOverlayOpen() && error.isAttachedToWindow) error.getChildAt(1).requestFocus() }
        } else {
            stack.addView(buildMetadataRow(m, detailed = false), wrap().apply { topMargin = dp(12) })
            m.description?.takeIf { it.isNotBlank() }?.let {
                stack.addView(text(it, BODY, color = TEXT).onArt().apply {
                    maxLines = 3; ellipsize = TextUtils.TruncateAt.END
                }, LinearLayout.LayoutParams(dp(470), -2).apply { topMargin = dp(8) })
            }
            val initialCast = richCast.ifEmpty {
                val dirMembers = m.directors.map { CastMember(it, character = getString(R.string.cast_director), role = "director") }
                dirMembers + m.castMembers
            }
            buildCastChips(initialCast)?.let { castStrip ->
                val slot = FrameLayout(this).apply {
                    clipChildren = false
                    clipToPadding = false
                    addView(castStrip)
                }
                castStripSlot = slot
                stack.addView(slot, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
            }
            addWatch(m, stack)
        }
        hero.addView(stack, FrameLayout.LayoutParams(dp(HERO_W), -2, Gravity.BOTTOM or Gravity.START).apply {
            leftMargin = dp(PAD); bottomMargin = dp(92)
        })
        val hasEpisodes = hasEpisodes(type, m?.videos) && m?.videos?.isNotEmpty() == true
        if (hasEpisodes || ::similarOverlay.isInitialized) {
            hero.addView(caps(if (hasEpisodes) R.string.details_episodes_below else R.string.details_more_below, TEXT_2).onArt().apply {
                isFocusable = true
                setOnClickListener { if (hasEpisodes) showGuide() else showSimilar() }
                rowFocus(rest = { null })
            }, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply {
                leftMargin = dp(PAD); bottomMargin = dp(28)
            })
        }
        if (m != null) {
            val resolved = resolveHeroFocusTarget(
                saved = savedFocus,
                hasTrailer = trailerButton != null,
                hasStartOver = startOverButton != null,
                castCount = castChips.size,
            )
            restoreHeroFocus(heroFocusView(resolved))
        }
    }

    /** Where you are, then the main action and three small glass controls. */
    private fun addWatch(m: Meta, stack: LinearLayout) {
        val target = playTarget(m)
        val episode = target?.second
        val resumeAt = item?.let { Library.resumeAt(it, target?.first ?: metaId) } ?: 0L
        val videos = m.videos
        val watched = Library.watched(item, videos)
        val airedVideos = videos.filter { it.season > 0 && isEpisodeAired(it.released) }
        val currentVideoId = item?.optJSONObject("state")?.text("video_id")
        val currentVideo = videos.firstOrNull { it.id == currentVideoId }
        val unairedNext = when {
            // Unfinished playback always resumes
            resumeAt > 0 -> null
            // Unpremiered show: first target episode is unaired
            episode != null && !isEpisodeAired(episode.released) -> episode
            // Caught up pointer is unaired
            currentVideo != null && !isEpisodeAired(currentVideo.released) -> currentVideo
            // All aired episodes watched: next in line is unaired
            airedVideos.isNotEmpty() && airedVideos.all { it.id in watched } ->
                videos.firstOrNull { it.season > 0 && !isEpisodeAired(it.released) && it.id !in watched }
            else -> null
        }

        val hasTrailer = m.trailerStreams.isNotEmpty() || m.trailerYtId != null || imdbTrailers.isNotEmpty()

        if (episodic && unairedNext != null) {
            val airDate = airDay(unairedNext.released) ?: getString(R.string.details_airs_soon)
            val caughtUp = getString(if (airedVideos.isEmpty()) R.string.details_premiere else R.string.details_up_to_date,
                unairedNext.season, unairedNext.episode, airDate)
            stack.addView(text(caughtUp, SMALL, bold = true).onArt().apply {
                maxLines = 1; ellipsize = TextUtils.TruncateAt.END
            }.marginTop(16))

            playButton = pill(R.string.action_episodes).apply {
                setOnClickListener { showGuide() }
            }
            val trailer = if (hasTrailer) iconButton("", getString(R.string.action_trailer), iconRes = R.drawable.ic_trailer) { playTrailer(m) } else null
            trailerButton = trailer
            startOverButton = null
            infoButton = iconButton("ⓘ", getString(R.string.action_more_info)) { showInfo() }
            listButton = buildListButton()
            buttonRow = LinearLayout(this).apply {
                gravity = Gravity.CENTER_VERTICAL
                clipChildren = false
                clipToPadding = false
                addView(playButton, wrap().apply { marginEnd = dp(14) })
                trailer?.let { addView(it, LinearLayout.LayoutParams(dp(ICON_BUTTON_H), dp(ICON_BUTTON_H)).apply { marginEnd = dp(8) }) }
                addView(listButton, LinearLayout.LayoutParams(dp(ICON_BUTTON_H), dp(ICON_BUTTON_H)).apply { marginEnd = dp(8) })
                addView(infoButton, LinearLayout.LayoutParams(dp(ICON_BUTTON_H), dp(ICON_BUTTON_H)))
            }
            stack.addView(buttonRow, wrap().apply { topMargin = dp(16) })
            return
        }
        val duration = item?.optJSONObject("state")?.optLong("duration") ?: 0L
        val remaining = timeLeft(duration, resumeAt)
        if (resumeAt > 0) {
            val stopped = getString(R.string.stopped_at, android.text.format.DateUtils.formatElapsedTime(resumeAt / 1000))
            val where = listOfNotNull(episode?.let { "S${it.season} E${it.episode}" }, episode?.title?.takeIf { it.isNotBlank() }, remaining, stopped)
            stack.addView(text(where.joinToString(DOT), SMALL, bold = true).onArt().apply {
                maxLines = 2; ellipsize = TextUtils.TruncateAt.END
            }.marginTop(16))
        }
        if (remaining != null) stack.addView(progressBar(resumeAt.toFloat() / duration), LinearLayout.LayoutParams(dp(240), dp(3)).apply { topMargin = dp(8) })

        playButton = pill(if (resumeAt > 0) R.string.action_resume else R.string.action_play, R.drawable.ic_play).apply {
            setOnClickListener { openSources(target?.first ?: metaId, startOver = false) }
            // Held OK: every source, to choose one by hand.
            setOnLongClickListener { openSources(target?.first ?: metaId, startOver = false, pick = true); true }
        }
        val trailer = if (hasTrailer) iconButton("", getString(R.string.action_trailer), iconRes = R.drawable.ic_trailer) { playTrailer(m) } else null
        val startOver = if (resumeAt > 0) iconButton("↺", getString(R.string.action_start_over)) {
            openSources(target?.first ?: metaId, startOver = true)
        } else null
        trailerButton = trailer
        startOverButton = startOver
        infoButton = iconButton("ⓘ", getString(R.string.action_more_info)) { showInfo(focusCast = false) }
        listButton = buildListButton()
        buttonRow = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            clipChildren = false
            clipToPadding = false
            addView(playButton, wrap().apply { marginEnd = dp(14) })
            trailer?.let { addView(it, LinearLayout.LayoutParams(dp(ICON_BUTTON_H), dp(ICON_BUTTON_H)).apply { marginEnd = dp(8) }) }
            startOver?.let { addView(it, LinearLayout.LayoutParams(dp(ICON_BUTTON_H), dp(ICON_BUTTON_H)).apply { marginEnd = dp(8) }) }
            addView(listButton, LinearLayout.LayoutParams(dp(ICON_BUTTON_H), dp(ICON_BUTTON_H)).apply { marginEnd = dp(8) })
            addView(infoButton, LinearLayout.LayoutParams(dp(ICON_BUTTON_H), dp(ICON_BUTTON_H)))
        }
        stack.addView(buttonRow, wrap().apply { topMargin = dp(16) })
    }

    private fun buildMetadataRow(m: Meta, detailed: Boolean): LinearLayout {
        val seasonCount = if (hasEpisodes(type, m.videos)) {
            m.videos.map { it.season }.filter { it > 0 }.distinct().size.takeIf { it > 0 }?.let(::seasons)
        } else null
        val genreText = if (detailed) {
            m.genres.take(3).joinToString(" / ").ifEmpty { null }
        } else {
            m.genres.firstOrNull()
        }
        val lengthParts = if (detailed) {
            listOfNotNull(seasonCount, m.runtime)
        } else {
            listOfNotNull(seasonCount ?: m.runtime)
        }
        val facts = (listOfNotNull(m.year, genreText) + lengthParts).joinToString(DOT)
        return LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            certificate?.let { cert ->
                addView(text(cert, 9.5f, bold = true, color = TEXT_2).apply {
                    includeFontPadding = false
                    setLineSpacing(0f, 1f)
                    setPadding(dp(5), dp(2), dp(5), dp(2))
                    background = GradientDrawable().apply {
                        cornerRadius = dp(3).toFloat()
                        setStroke(dp(1), GLASS_EDGE)
                    }
                })
                if (facts.isNotBlank()) addView(text(DOT, SMALL, color = TEXT_2).onArt())
            }
            if (facts.isNotBlank()) {
                addView(text(facts, SMALL, color = TEXT_2).onArt().apply {
                    maxLines = 1; ellipsize = TextUtils.TruncateAt.END
                })
            }
            val ratings = shownRatings(Settings.ratings(this@DetailsActivity), m.rating, letterboxdScore)
            if (ratings.isNotEmpty()) {
                if (facts.isNotBlank() || certificate != null) addView(text(DOT, SMALL, color = TEXT_2).onArt())
                addRatings(this, ratings, tagSp = 9.5f, firstGap = 0)
            }
        }
    }

    private fun seasonName(season: Int) = if (season == 0) getString(R.string.season_specials) else getString(R.string.season_number, season)

    /** What Play opens: the episode Continue Watching points at, or the first episode, or the movie itself. */
    private fun playTarget(m: Meta?): Pair<String, Video?>? {
        val videos = m?.videos.orEmpty()
        item?.let { entry ->
            val saved = Library.savedVideoId(entry)
            if (Library.resumeAt(entry, saved) > 0 || Library.nextEpisodePending(entry)) {
                return saved to videos.firstOrNull { it.id == saved }
            }
        }
        if (videos.isEmpty()) return metaId to null
        val current = item?.optJSONObject("state")?.text("video_id")
        val video = videos.firstOrNull { it.id == current } ?: videos.firstOrNull { it.season > 0 } ?: videos.first()
        return video.id to video
    }

    private fun buildListButton(): TextView {
        val inList = Library.inList(item)
        val desc = getString(if (inList) R.string.action_remove_from_list else R.string.action_add_to_list)
        return iconButton(if (inList) "✓" else "+", desc, action = ::toggleList)
    }

    private fun toggleList() {
        val profile = Profiles.active(this)?.takeIf { it.id == libraryProfile.id } ?: return
        val dates = Library.listDates(this, profile.id)
        val add = !Library.inList(item)
        editLibrary({ Library.setInList(it, add) }, R.string.list_update_failed, listDates = dates) {
            listButton.text = if (add) "✓" else "+"
            val desc = getString(if (add) R.string.action_remove_from_list else R.string.action_add_to_list)
            listButton.contentDescription = desc
        }
    }

    // ---------- glass and episode guide ----------

    private fun glassPane() = FrameLayout(this).apply {
        background = glassOver(this, 14, shade = FROST_DENSE)
        clipToOutline = true
        outlineProvider = object : android.view.ViewOutlineProvider() {
            override fun getOutline(view: View, outline: android.graphics.Outline) =
                outline.setRoundRect(0, 0, view.width, view.height, dp(14).toFloat())
        }
    }

    private fun buildGuide(videos: List<Video>) {
        if (::guide.isInitialized) root.removeView(guide)
        guideOpen = false
        val x = dp(PAD)
        val top = dp(128)
        val width = resources.displayMetrics.widthPixels - x * 2
        val height = resources.displayMetrics.heightPixels - top - dp(27)
        val largeText = resources.configuration.fontScale > 1.15f
        guide = FrameLayout(this).apply { visibility = View.GONE }
        guide.addView(View(this).apply {
            background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(0xD90E0C0A.toInt(), 0x800E0C0A.toInt(), 0x000E0C0A))
        }, FrameLayout.LayoutParams(-1, dp(136), Gravity.TOP))
        val smallLogo = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_START }
        guide.addView(smallLogo, FrameLayout.LayoutParams(dp(150), dp(42)).apply {
            leftMargin = x; topMargin = dp(27)
        })
        val fallback = text(meta?.name ?: name, SERIF_TITLE, serif = true).onArt().apply {
            maxLines = 1; ellipsize = TextUtils.TruncateAt.END; visibility = View.GONE
        }
        guide.addView(fallback, FrameLayout.LayoutParams(dp(250), -2).apply {
            leftMargin = x; topMargin = dp(28)
        })
        Images.load(meta?.logo ?: Images.logoFor(metaId), smallLogo, dp(300), urgent = true, failed = {
            smallLogo.visibility = View.GONE; fallback.visibility = View.VISIBLE
        })

        seasonStrip = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        // Room around the chips for the focused one to grow into: flush with the strip, its left edge was cut flat.
        val room = dp(8)
        guide.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            setPadding(room, room, room, room)
            clipToPadding = false
            addView(seasonStrip)
        }, FrameLayout.LayoutParams(width + 2 * room, dp(32) + 2 * room).apply { leftMargin = x - room; topMargin = dp(88) - room })

        val pane = glassPane()
        guideRows = column(Gravity.START)
        pane.addView(ScrollView(this).apply {
            isVerticalScrollBarEnabled = false
            // The row past the panel's foot fades out instead of running into the edge.
            isVerticalFadingEdgeEnabled = true
            setFadingEdgeLength(dp(40))
            addView(guideRows)
        }, FrameLayout.LayoutParams(dp(380), height - dp(28)).apply {
            leftMargin = dp(14); topMargin = dp(14)
        })
        val previewX = dp(414)
        val previewWidth = width - previewX - dp(14)
        previewImage = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = rounded(BASE, 8)
            clipToOutline = true
        }
        pane.addView(previewImage, FrameLayout.LayoutParams(previewWidth, dp(200)).apply {
            leftMargin = previewX; topMargin = dp(14)
        })
        previewProgress = FrameLayout(this)
        pane.addView(previewProgress, FrameLayout.LayoutParams(previewWidth - dp(20), dp(3)).apply {
            leftMargin = previewX + dp(10); topMargin = dp(203)
        })
        previewTitle = text("", 22f, serif = true).onArt().apply {
            maxLines = 1; ellipsize = TextUtils.TruncateAt.END
        }
        pane.addView(previewTitle, FrameLayout.LayoutParams(previewWidth, -2).apply {
            leftMargin = previewX; topMargin = dp(225)
        })
        previewFacts = text("", SMALL, color = TEXT_2).onArt().apply {
            maxLines = 1; ellipsize = TextUtils.TruncateAt.END
        }
        pane.addView(previewFacts, FrameLayout.LayoutParams(previewWidth, -2).apply {
            leftMargin = previewX; topMargin = dp(if (largeText) 259 else 254)
        })
        previewAbout = text("", SMALL, color = TEXT).onArt().apply {
            maxLines = if (largeText) 3 else 5
            ellipsize = TextUtils.TruncateAt.END
        }
        pane.addView(previewAbout, FrameLayout.LayoutParams(previewWidth, -2).apply {
            leftMargin = previewX; topMargin = dp(if (largeText) 287 else 278)
        })
        guide.addView(pane, FrameLayout.LayoutParams(width, height).apply {
            leftMargin = x; topMargin = top
        })
        root.addView(guide, FrameLayout.LayoutParams(-1, -1))
        selectedSeason = playTarget(meta)?.second?.season ?: videos.first().season
        fillGuide()
    }

    private fun fillGuide() {
        val videos = meta?.videos.orEmpty()
        val seasons = videos.map { it.season }.distinct()
        seasonStrip.removeAllViews()
        seasonButtons = seasons.associateWith { season ->
            chip(if (season == selectedSeason) seasonName(season)
                else if (season == 0) getString(R.string.season_specials) else season.toString(), season == selectedSeason).apply {
                setOnClickListener {
                    selectedSeason = season
                    fillGuide()
                    seasonButtons[season]?.requestFocus()
                }
                setOnLongClickListener {
                    seasonMenu(season)
                    true
                }
                seasonStrip.addView(this, LinearLayout.LayoutParams(-2, dp(24)).apply {
                    if (seasonStrip.childCount > 0) marginStart = dp(8)
                })
            }
        }
        guideRows.removeAllViews()
        val watched = Library.watched(item, videos)
        val currentId = playTarget(meta)?.first
        episodeRows = videos.filter { it.season == selectedSeason }.map { video ->
            val row = FrameLayout(this).apply { tag = video.id }
            val number = text("%02d".format(video.episode), BODY, color = TEXT_3)
            row.addView(number, FrameLayout.LayoutParams(dp(32), -2, Gravity.CENTER_VERTICAL).apply {
                leftMargin = dp(12)
            })
            val resumeAt = item?.let { Library.resumeAt(it, video.id) } ?: 0L
            val duration = item?.optJSONObject("state")?.takeIf { it.text("video_id") == video.id }
                ?.optLong("duration") ?: 0L
            val aired = isEpisodeAired(video.released)
            val status = when {
                !aired -> airDay(video.released)?.let { getString(R.string.airs_on, it) }.orEmpty()
                video.id in watched -> "✓"
                else -> timeLeft(duration, resumeAt) ?: meta?.runtime.orEmpty()
            }
            val titleColor = when {
                !aired -> TEXT_3
                video.id in watched -> TEXT_2
                else -> TEXT
            }
            row.addView(text(video.title.ifBlank { getString(R.string.episode_number, video.episode) }, BODY,
                color = titleColor).apply {
                maxLines = 1; ellipsize = TextUtils.TruncateAt.END
            }, FrameLayout.LayoutParams(dp(225), -2, Gravity.CENTER_VERTICAL).apply { leftMargin = dp(46) })
            if (status.isNotEmpty()) row.addView(text(status, SMALL,
                color = if (!aired) TEXT_3 else if (video.id in watched) TUNGSTEN else TEXT_2).apply { gravity = Gravity.END },
                FrameLayout.LayoutParams(dp(98), -2, Gravity.CENTER_VERTICAL or Gravity.END).apply {
                    rightMargin = dp(12)
                })
            row.rowFocus(9) { focused -> if (focused) updatePreview(video) }
            if (aired) {
                row.setOnClickListener {
                    val next = videos.getOrNull(videos.indexOf(video) + 1)?.id
                    openSources(video.id, startOver = false, next = next, label = "S${video.season} E${video.episode}")
                }
                row.setOnLongClickListener {
                    episodeMenu(video)
                    true
                }
            }
            guideRows.addView(row, LinearLayout.LayoutParams(-1, dp(45)))
            row
        }
        videos.firstOrNull { it.id == currentId && it.season == selectedSeason }?.let(::updatePreview)
            ?: videos.firstOrNull { it.season == selectedSeason }?.let(::updatePreview)
    }

    private fun updatePreview(video: Video) {
        val blur = Settings.blurThumbnails(this) && video.id !in Library.watched(item, meta?.videos.orEmpty())
        Images.load(video.thumbnail, previewImage, dp(870), orElse = meta?.background, look = if (blur) Images.blurred else null)
        previewTitle.text = video.title.ifBlank { getString(R.string.episode_number, video.episode) }
        previewFacts.text = listOfNotNull("S${video.season} E${video.episode}", meta?.runtime,
            episodeDate(video.released)).joinToString(DOT)
        previewAbout.text = video.overview.orEmpty()
        previewAbout.visibility = if (video.overview.isNullOrBlank()) View.GONE else View.VISIBLE
        previewProgress.removeAllViews()
        val state = item?.optJSONObject("state")?.takeIf { it.text("video_id") == video.id }
        val resumeAt = item?.let { Library.resumeAt(it, video.id) } ?: 0L
        val duration = state?.optLong("duration") ?: 0L
        if (resumeAt > 0 && duration > resumeAt) {
            previewProgress.addView(progressBar(resumeAt.toFloat() / duration),
                FrameLayout.LayoutParams(-1, -1))
        }
    }

    private fun showGuide() {
        if (!::guide.isInitialized || guideOpen) return
        guideOpen = true
        hero.visibility = View.INVISIBLE
        guide.visibility = View.VISIBLE
        guide.alpha = 0f
        guide.translationY = dp(28).toFloat()
        guide.enter().alpha(1f).translationY(0f).start()
        // The film steps back behind the guide, so the chips and panel read over a bright backdrop.
        heroArt.animate().alpha(GUIDE_ART).setDuration(ENTER_MS).withEndAction { refrost() }.start()
        leftShade(false) // the episode list sits on glass: the art can run to the left edge as it does on the right
        val currentId = playTarget(meta)?.first
        (episodeRows.firstOrNull { it.tag == currentId } ?: episodeRows.firstOrNull())?.requestFocus()
    }

    private fun hideGuide() {
        guideOpen = false
        heroArt.enter().alpha(1f).withEndAction { refrost() }.start()
        leftShade(true)
        guide.exit().alpha(0f).translationY(dp(24).toFloat()).withEndAction {
            guide.visibility = View.GONE
            revealHero(HeroControlFocus.PLAY)
        }.start()
    }

    private fun editLibrary(change: (JSONObject) -> Unit, title: Int = R.string.library_edit_failed,
                            previous: Failure? = null, listDates: SharedPreferences? = null, done: () -> Unit) {
        if (savingEdit) return
        savingEdit = true
        val entry = Library.newItem(metaId, type, meta?.name ?: name, meta?.poster ?: poster)
        background({
            ProfileLibrary.editLibrary(applicationContext, libraryProfile, metaId, entry, listDates, change)
        }) { result ->
            savingEdit = false
            if (isFinishing) return@background
            result.onSuccess {
                previous?.let { FailureLog.record(FailureLog.Operation.LIBRARY_EDIT, it, recovered = true) }
                itemChangedHere = true
                item = it
                done()
            }.onFailure {
                val failure = failureOf(it)
                FailureLog.record(FailureLog.Operation.LIBRARY_EDIT, failure)
                choose(getString(title), listOf(getString(R.string.action_try_again), getString(R.string.action_cancel)),
                    getString(failure.message)) { choice -> if (choice == 0) editLibrary(change, title, failure, listDates, done) }
            }
        }
    }

    private fun refreshAfterEdit(focusEpisodeId: String? = null, focusSeason: Int? = null) {
        fillGuide()
        if (anyOverlayOpen()) heroNeedsRefresh = true else meta?.let(::showHero)
        if (focusEpisodeId != null) {
            val target = (0 until guideRows.childCount).map { guideRows.getChildAt(it) }
                .firstOrNull { it.tag == focusEpisodeId }
            target?.requestFocus()
            meta?.videos?.firstOrNull { it.id == focusEpisodeId }?.let(::updatePreview)
        } else if (focusSeason != null) {
            seasonButtons[focusSeason]?.requestFocus()
        }
    }

    private fun episodeMenu(video: Video) {
        val videos = meta?.videos.orEmpty()
        val watched = Library.watched(item, videos)
        val isWatched = video.id in watched
        val prior = Library.priorEpisodes(videos, video)

        val options = mutableListOf(R.string.action_choose_source, if (isWatched) R.string.action_mark_unwatched else R.string.action_mark_watched)
        if (prior.isNotEmpty()) {
            options.add(R.string.action_mark_previous_watched)
        }

        val epNumber = if (video.season > 0) "S${video.season} E${video.episode}" else "E${video.episode}"
        val title = video.title.ifBlank { epNumber }
        val message = if (video.title.isNotBlank()) epNumber else null

        choose(title, options.map(::getString), message = message) { selected ->
            when (options[selected]) {
                R.string.action_choose_source -> {
                    val next = videos.getOrNull(videos.indexOf(video) + 1)?.id
                    openSources(video.id, startOver = false, next = next,
                        label = "S${video.season} E${video.episode}", pick = true)
                }
                R.string.action_mark_watched -> markEpisodeWatched(video, true)
                R.string.action_mark_unwatched -> markEpisodeWatched(video, false)
                R.string.action_mark_previous_watched -> markPreviousEpisodesWatched(video, prior)
            }
        }
    }

    private fun markEpisodeWatched(video: Video, watched: Boolean) {
        val videos = meta?.videos.orEmpty()
        editLibrary({ entry ->
            val s = entry.state
            if (watched) {
                Library.markWatched(entry, videos, video.id)
                s.put("timesWatched", maxOf(1, s.optInt("timesWatched")))
                val nextEp = Library.nextEpisode(videos, video)
                if (nextEp != null) {
                    s.put("video_id", nextEp.id)
                    s.put("timeOffset", 0L)
                    s.put("flaggedWatched", 0)
                } else {
                    s.put("video_id", video.id)
                    s.put("timeOffset", 0L)
                    s.put("flaggedWatched", 1)
                }
            } else {
                Library.markUnwatched(entry, videos, video.id)
                s.put("video_id", video.id)
                s.put("timeOffset", 0L)
                s.put("flaggedWatched", 0)
            }
            entry.put("_mtime", Library.now())
        }) { refreshAfterEdit(focusEpisodeId = video.id) }
    }

    private fun markPreviousEpisodesWatched(video: Video, prior: List<Video>) {
        val videos = meta?.videos.orEmpty()
        editLibrary({ entry ->
            val s = entry.state
            Library.markEpisodesWatched(entry, videos, prior.map { it.id })
            s.put("timesWatched", maxOf(1, s.optInt("timesWatched")))
            s.put("video_id", video.id)
            s.put("timeOffset", 0L)
            s.put("flaggedWatched", 0)
            entry.put("_mtime", Library.now())
        }) { refreshAfterEdit(focusEpisodeId = video.id) }
    }

    private fun seasonMenu(season: Int) {
        val videos = meta?.videos.orEmpty()
        val seasonVideos = videos.filter { it.season == season }
        if (seasonVideos.isEmpty()) return
        val watched = Library.watched(item, videos)
        val allWatched = seasonVideos.all { it.id in watched }
        val title = seasonName(season)
        val option = getString(if (allWatched) R.string.mark_season_unwatched else R.string.mark_season_watched, title)
        choose(title, listOf(option)) { selected ->
            if (selected == 0) {
                markSeasonWatched(season, !allWatched)
            }
        }
    }

    private fun markSeasonWatched(season: Int, watched: Boolean) {
        val videos = meta?.videos.orEmpty()
        val seasonVideos = videos.filter { it.season == season }
        val seasonIds = seasonVideos.map { it.id }.toSet()
        editLibrary({ entry ->
            val s = entry.state

            if (watched) {
                Library.markEpisodesWatched(entry, videos, seasonIds)
                s.put("timesWatched", maxOf(1, s.optInt("timesWatched")))
                val nextEp = Library.nextEpisodeAfterSeason(videos, season)
                if (nextEp != null) {
                    s.put("video_id", nextEp.id)
                    s.put("timeOffset", 0L)
                    s.put("flaggedWatched", 0)
                } else {
                    seasonVideos.lastOrNull()?.let { s.put("video_id", it.id) }
                    s.put("timeOffset", 0L)
                    s.put("flaggedWatched", 1)
                }
            } else {
                Library.unmarkEpisodesWatched(entry, videos, seasonIds)
                seasonVideos.firstOrNull()?.let { firstEp ->
                    s.put("video_id", firstEp.id)
                    s.put("timeOffset", 0L)
                    s.put("flaggedWatched", 0)
                }
            }
            entry.put("_mtime", Library.now())
        }) { refreshAfterEdit(focusSeason = season) }
    }

    /**
     * The whole story and complete cast, with circular portraits above actor and character names.
     * Remote navigates between the story text and cast cards, with OK on any actor revealing their filmography.
     */
    private fun showInfo(focusCast: Boolean = false) {
        val m = meta ?: return
        if (::infoOverlay.isInitialized) root.removeView(infoOverlay)
        infoOpen = true
        hero.visibility = View.INVISIBLE
        infoCastCards.clear()
        storyScrollView = null

        infoOverlay = FrameLayout(this)
        infoOverlay.addView(View(this).apply {
            background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(0xEB0E0C0A.toInt(), 0xD90E0C0A.toInt(), 0x990E0C0A.toInt()))
        }, FrameLayout.LayoutParams(-1, -1))

        val content = column(Gravity.START).apply {
            clipChildren = false
            clipToPadding = false
        }

        content.addView(text(m.name, SERIF_TITLE, bold = true, serif = true).onArt().apply {
            maxLines = 2; ellipsize = TextUtils.TruncateAt.END
        })
        content.addView(buildMetadataRow(m, detailed = true), wrap().apply { topMargin = dp(8) })

        m.description?.takeIf { it.isNotBlank() }?.let { desc ->
            content.addView(caps(R.string.details_the_story, TEXT_2).onArt().marginTop(14))
            val story = ScrollView(this).apply {
                isVerticalScrollBarEnabled = false
                isVerticalFadingEdgeEnabled = true
                setFadingEdgeLength(dp(20))
                isFocusable = true
                setPadding(dp(8), dp(6), dp(8), dp(6))
                setOnFocusChangeListener { v, has ->
                    v.background = if (has) rounded(ROW_FOCUSED, 8) else null
                }
                addView(text(desc, BODY, color = TEXT).onArt())
            }
            storyScrollView = story
            content.addView(story, LinearLayout.LayoutParams(dp(HERO_W), dp(110)).apply {
                topMargin = dp(6)
                leftMargin = -dp(8)
            })
        }

        val fullCast = richCast.ifEmpty {
            val directors = m.directors.map { CastMember(it, getString(R.string.cast_director), null, role = "director") }
            val directorNames = directors.map { it.name.lowercase() }.toSet()
            directors + m.castMembers.filter { it.name.lowercase() !in directorNames }
        }
        if (fullCast.isNotEmpty()) {
            content.addView(caps(R.string.details_cast, TEXT_2).onArt().marginTop(14))
            val castRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.TOP
                clipChildren = false
                clipToPadding = false
            }

            val avatarSize = dp(56)

            fullCast.forEachIndexed { index, actor ->
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    isFocusable = true
                    clipChildren = false
                    clipToPadding = false
                    setPadding(dp(8), dp(8), dp(8), dp(8))
                }

                val avatarContainer = FrameLayout(this).apply {
                    clipChildren = false
                    alpha = 0.65f
                }

                val avatarFrame = FrameLayout(this).apply {
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(0x33F3D9B1.toInt())
                    }
                    clipToOutline = true
                    outlineProvider = object : android.view.ViewOutlineProvider() {
                        override fun getOutline(view: View, outline: android.graphics.Outline) =
                            outline.setOval(0, 0, view.width, view.height)
                    }
                }
                val initials = text(actor.initials, 15f, bold = true, color = 0xFFF3D9B1.toInt(), serif = true).apply {
                    gravity = Gravity.CENTER
                    includeFontPadding = false
                }
                avatarFrame.addView(initials, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))

                if (!actor.photo.isNullOrBlank()) {
                    val photoView = ImageView(this@DetailsActivity).apply {
                        scaleType = ImageView.ScaleType.CENTER_CROP
                        visibility = View.GONE
                    }
                    avatarFrame.addView(photoView, FrameLayout.LayoutParams(-1, -1))
                    Images.load(actor.photo, photoView, avatarSize, failed = {
                        photoView.visibility = View.GONE
                        initials.visibility = View.VISIBLE
                    }) {
                        photoView.visibility = View.VISIBLE
                        initials.visibility = View.GONE
                    }
                }
                avatarContainer.addView(avatarFrame, FrameLayout.LayoutParams(avatarSize, avatarSize, Gravity.CENTER))

                card.addView(avatarContainer, wrap())

                val nameView = text(actor.name, SMALL, bold = true, color = TEXT_2).apply {
                    gravity = Gravity.CENTER_HORIZONTAL
                    textAlignment = View.TEXT_ALIGNMENT_CENTER
                    maxLines = 2
                    ellipsize = TextUtils.TruncateAt.END
                }
                card.addView(nameView, LinearLayout.LayoutParams(dp(96), -2).apply { topMargin = dp(8) })

                val role = if (actor.isDirector) getString(R.string.cast_director) else actor.character
                val charView = if (!role.isNullOrBlank()) {
                    text(role, 11f, color = TEXT_3).apply {
                        gravity = Gravity.CENTER_HORIZONTAL
                        textAlignment = View.TEXT_ALIGNMENT_CENTER
                        maxLines = 2
                        ellipsize = TextUtils.TruncateAt.END
                    }
                } else null
                charView?.let { card.addView(it, LinearLayout.LayoutParams(dp(96), -2).apply { topMargin = dp(2) }) }

                card.setOnFocusChangeListener { v, focused ->
                    v.background = if (focused) rounded(ROW_FOCUSED, 10) else null
                    avatarContainer.grow(focused)
                        .translationZ(if (focused) dp(CARD_LIFT).toFloat() else 0f)
                        .alpha(if (focused) 1f else 0.65f)
                        .start()
                    nameView.setTextColor(if (focused) TEXT else TEXT_2)
                    charView?.setTextColor(if (focused) TEXT_2 else TEXT_3)
                }

                card.setOnClickListener {
                    showFilmography(actor, card)
                }

                infoCastCards.add(card)
                castRow.addView(card, LinearLayout.LayoutParams(-2, -2).apply {
                    if (index > 0) marginStart = dp(8)
                })
            }

            val room = dp(8)
            val castScroll = HorizontalScrollView(this).apply {
                isHorizontalScrollBarEnabled = false
                isHorizontalFadingEdgeEnabled = true
                setFadingEdgeLength(dp(32))
                clipToPadding = false
                setPadding(room, room, room, room)
                addView(castRow)
            }
            content.addView(castScroll, LinearLayout.LayoutParams(-1, -2).apply {
                leftMargin = -room
                rightMargin = -room
                topMargin = dp(6) - room
                bottomMargin = -room
            })
        }

        infoOverlay.addView(content, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM or Gravity.START).apply {
            leftMargin = dp(PAD); rightMargin = dp(PAD); bottomMargin = dp(34)
        })
        root.addView(infoOverlay, FrameLayout.LayoutParams(-1, -1))
        infoOverlay.alpha = 0f
        infoOverlay.translationY = dp(20).toFloat()
        infoOverlay.enter().alpha(1f).translationY(0f).start()

        val story = storyScrollView
        if (focusCast && infoCastCards.isNotEmpty()) {
            infoCastCards.first().requestFocus()
        } else if (story != null) {
            story.post {
                val canScroll = story.canScrollVertically(1) || story.canScrollVertically(-1)
                if (canScroll || infoCastCards.isEmpty()) {
                    story.isFocusable = true
                } else {
                    story.isFocusable = false
                    infoCastCards.first().requestFocus()
                }
            }
            story.requestFocus()
        } else {
            infoCastCards.firstOrNull()?.requestFocus()
        }
    }

    private fun hideInfo() {
        infoOpen = false
        if (::infoOverlay.isInitialized) {
            val closing = infoOverlay
            closing.exit().alpha(0f).translationY(dp(20).toFloat()).withEndAction {
                root.removeView(closing)
                revealHero(HeroControlFocus.INFO)
            }.start()
        } else {
            revealHero(HeroControlFocus.INFO)
        }
    }

    private fun loadSimilar() {
        background({
            val fromAddons = Stremio.addons(key).firstNotNullOfOrNull { addon ->
                runCatching { addon.similar(type, metaId) }.getOrNull()?.takeIf { it.isNotEmpty() }
            }.orEmpty()
            fromAddons.ifEmpty { Tmdb.similar(metaId, type) }
        }) { result ->
            result.getOrNull()?.let { titles ->
                titles.asSequence().filter { it.id != metaId && it.type == type }
                    .distinctBy { it.id }.take(12).toList().takeIf { it.isNotEmpty() }
                    ?.let { showSimilar(getString(R.string.details_more_like_this), it) }
            }
        }
    }

    /** Shared poster-row overlay for "More like this" and cast filmography. */
    private fun buildPosterRowOverlay(heading: String, titles: List<Meta>, onFirstCard: (View?) -> Unit): FrameLayout {
        val overlay = FrameLayout(this).apply { visibility = View.GONE }
        overlay.addView(View(this).apply {
            background = GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP,
                intArrayOf(0xF70E0C0A.toInt(), 0xA60E0C0A.toInt(), 0x000E0C0A))
        }, FrameLayout.LayoutParams(-1, dp(280), Gravity.BOTTOM))
        val content = column(Gravity.START)
        val captionPill = caption("").apply {
            visibility = View.INVISIBLE
            maxWidth = dp(360)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(caps(heading).onArt())
            addView(captionPill, LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(14) })
        }
        content.addView(headerRow, LinearLayout.LayoutParams(-1, -2).apply {
            bottomMargin = dp(12)
        })
        onFirstCard(addPosterRail(content, titles, captionPill))
        overlay.addView(content, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply {
            leftMargin = dp(PAD); rightMargin = dp(PAD); bottomMargin = dp(38)
        })
        return overlay
    }

    /** Movies reveal one Home-sized poster row without moving the title off the screen. */
    private fun showSimilar(heading: String, titles: List<Meta>) {
        if (::similarOverlay.isInitialized) root.removeView(similarOverlay)
        similarOverlay = buildPosterRowOverlay(heading, titles) { similarFirst = it }
        root.addView(similarOverlay, FrameLayout.LayoutParams(-1, -1))
        if (anyOverlayOpen()) heroNeedsRefresh = true else showHero(meta)
    }

    private fun addPosterRail(content: LinearLayout, titles: List<Meta>, captionPill: TextView): View? {
        val room = dp(8)
        val rail = HorizontalCardRail(
            screen = this,
            cardGapPx = dp(CARD_GAP),
            paddingStartPx = room,
            paddingTopPx = room,
            paddingEndPx = room,
            paddingBottomPx = room,
            cullLeft = false,
        )
        var firstCard: View? = null
        titles.forEachIndexed { index, title ->
            val card = MediaCardView(this, title.name, title.poster, title.background, fadeIn = false).apply {
                dim(true, animate = false)
                setOnFocusChanged { has ->
                    dim(!has)
                    if (has) {
                        rail.scrollToCard(index)
                        val yearStr = title.year?.take(4)?.let { "  ·  $it" } ?: ""
                        captionPill.text = "${title.name}$yearStr"
                        captionPill.visibility = View.VISIBLE
                    }
                }
                setOnClickListener {
                    startActivity(Intent(this@DetailsActivity, DetailsActivity::class.java)
                        .putExtra("type", title.type).putExtra("id", title.id).putExtra("name", title.name)
                        .putExtra("poster", title.poster).putExtra("background", title.background))
                }
                load()
            }
            if (firstCard == null) firstCard = card
            rail.appendCard(card)
        }
        content.addView(rail.scroller, LinearLayout.LayoutParams(-1, dp(POSTER_H) + 2 * room).apply {
            leftMargin = -room
            rightMargin = -room
            topMargin = -room
            bottomMargin = -room
        })
        return firstCard
    }

    private fun showSimilar() {
        if (!::similarOverlay.isInitialized || similarOpen) return
        similarOpen = true
        hero.visibility = View.INVISIBLE
        similarOverlay.visibility = View.VISIBLE
        similarOverlay.alpha = 0f
        similarOverlay.translationY = dp(20).toFloat()
        similarOverlay.enter().alpha(1f).translationY(0f).start()
        similarFirst?.requestFocus()
    }

    private fun hideSimilar() {
        similarOpen = false
        similarOverlay.exit().alpha(0f).translationY(dp(20).toFloat()).withEndAction {
            similarOverlay.visibility = View.GONE
            revealHero(HeroControlFocus.PLAY)
        }.start()
    }

    private fun loadRichCast() {
        background({
            Tmdb.cast(metaId, type)
        }) { result ->
            val enhanced = result.getOrNull().orEmpty()
            if (enhanced.isNotEmpty()) {
                richCast = enhanced
                val focused = currentFocus
                val focusedCastIndex = if (!anyOverlayOpen()) {
                    focused?.let { v -> castChips.indexOfFirst { it === v || isInside(v, it) } } ?: -1
                } else -1
                val slot = castStripSlot
                if (slot != null) {
                    slot.removeAllViews()
                    buildCastChips(richCast)?.let { slot.addView(it) }
                } else if (meta != null) {
                    if (anyOverlayOpen()) heroNeedsRefresh = true else showHero(meta)
                }
                if (focusedCastIndex >= 0 && !anyOverlayOpen()) {
                    val resolved = resolveHeroFocusTarget(
                        saved = HeroFocusState(HeroControlFocus.CAST, focusedCastIndex),
                        hasTrailer = trailerButton != null,
                        hasStartOver = startOverButton != null,
                        castCount = castChips.size,
                    )
                    restoreHeroFocus(heroFocusView(resolved))
                }
                if (shouldRefreshInfoOnCastLoad(infoOpen, filmographyOpen)) {
                    showInfo(focusCast = currentFocus?.let { v -> infoCastCards.any { it === v || isInside(v, it) } } == true)
                }
            }
        }
    }

    private fun buildCastChips(allMembers: List<CastMember>): View? {
        castChips.clear()
        val members = heroCastPreview(
            allMembers,
            maxCount = if (allMembers.size <= 4 && allMembers.sumOf { it.name.length } <= 52) 4 else 3
        )
        if (members.isEmpty()) return null
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            clipChildren = false
            clipToPadding = false
        }

        members.forEachIndexed { index, actor ->
            val chip = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                isFocusable = true
                minimumHeight = dp(28)
                setPadding(dp(4), dp(4), dp(11), dp(4))
                val rest = glassOver(this, 14, shade = FROST_DENSE)
                background = rest

                val avatarSize = dp(20)
                val avatarFrame = FrameLayout(context).apply {
                    background = rounded(0x33F3D9B1.toInt(), 10)
                    clipToOutline = true
                    outlineProvider = object : android.view.ViewOutlineProvider() {
                        override fun getOutline(view: View, outline: android.graphics.Outline) =
                            outline.setRoundRect(0, 0, view.width, view.height, dp(10).toFloat())
                    }
                }
                val initialsText = text(actor.initials, 9f, bold = true, color = TUNGSTEN, serif = true).apply {
                    gravity = Gravity.CENTER
                    includeFontPadding = false
                }
                avatarFrame.addView(initialsText, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))

                if (!actor.photo.isNullOrBlank()) {
                    val photoView = ImageView(this@DetailsActivity).apply {
                        scaleType = ImageView.ScaleType.CENTER_CROP
                        visibility = View.GONE
                    }
                    avatarFrame.addView(photoView, FrameLayout.LayoutParams(-1, -1))
                    Images.load(actor.photo, photoView, avatarSize, failed = {
                        photoView.visibility = View.GONE
                        initialsText.visibility = View.VISIBLE
                    }) {
                        photoView.visibility = View.VISIBLE
                        initialsText.visibility = View.GONE
                    }
                }
                addView(avatarFrame, LinearLayout.LayoutParams(avatarSize, avatarSize).apply { marginEnd = dp(7) })

                val nameView = text(castChipLabel(actor), SMALL, color = TEXT_2).apply {
                    includeFontPadding = false
                    maxLines = 1
                }
                addView(nameView, wrap())

                setOnFocusChangeListener { v, has ->
                    v.background = if (has) glass(14, true) else rest
                    v.grow(has, CHIP_GROW).start()
                    nameView.setTextColor(if (has) TEXT else TEXT_2)
                }
                setOnClickListener { showFilmography(actor, this) }
            }
            castChips.add(chip)
            container.addView(chip, LinearLayout.LayoutParams(-2, -2).apply {
                if (index > 0) marginStart = dp(8)
            })
        }

        val totalCastCount = (richCast.ifEmpty { allMembers }).size
        val remainingCount = totalCastCount - members.size
        if (remainingCount > 0) {
            val moreChip = text(getString(R.string.cast_more, remainingCount), SMALL, color = TEXT_2).apply {
                gravity = Gravity.CENTER
                setSingleLine()
                includeFontPadding = false
                minHeight = dp(28)
                setPadding(dp(12), dp(4), dp(12), dp(4))
                val rest = glassOver(this, 14, shade = FROST_DENSE)
                background = rest
                isFocusable = true
                setOnFocusChangeListener { v, has ->
                    v.background = if (has) glass(14, true) else rest
                    setTextColor(if (has) TEXT else TEXT_2)
                    v.grow(has, CHIP_GROW).start()
                }
                setOnClickListener { showInfo(focusCast = true) }
            }
            castChips.add(moreChip)
            container.addView(moreChip, LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(8) })
        }

        val room = dp(4)
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            clipToPadding = false
            clipChildren = false
            setPadding(room, room, room, room)
            addView(container)
            layoutParams = FrameLayout.LayoutParams(-1, -2).apply {
                leftMargin = -room
                rightMargin = -room
                topMargin = -room
                bottomMargin = -room
            }
        }
    }

    private fun showFilmography(actor: CastMember, originView: View) {
        if (resolvingStreams != null) return
        lastFocusedActor = originView
        var canceled = false
        resolvingStreams = object : Cancellable { override fun cancel() { canceled = true } }
        loadingStatus.text = getString(R.string.filmography_loading)
        loadingView.visibility = View.VISIBLE
        loadingView.bringToFront()
        background({
            val creditedTitles = runCatching {
                Tmdb.personCredits(actor.tmdbId, actor.name, actor.isDirector)
            }.getOrDefault(emptySet())

            val searches = Stremio.addons(key).map { addon -> runCatching { addon.search(actor.name) } }
            // Every add-on failed: the viewer hears why, not an empty list.
            searches.takeIf { it.isNotEmpty() && it.all { r -> r.isFailure } }?.let { throw it.first().exceptionOrNull()!! }
            val allMetas = searches.flatMap { it.getOrNull().orEmpty() }.distinctBy { it.id }.filter { it.id != metaId }

            val actorLower = actor.name.lowercase().trim()

            allMetas.sortedWith(compareByDescending<Meta> { meta ->
                val metaTitleLower = meta.name.lowercase().trim()
                var score = 0
                if (metaTitleLower in creditedTitles || creditedTitles.any { it.contains(metaTitleLower) || metaTitleLower.contains(it) }) {
                    score += 100
                }
                if (actor.isDirector) {
                    if (meta.directors.any { it.lowercase().contains(actorLower) || actorLower.contains(it.lowercase()) }) {
                        score += 80
                    }
                } else {
                    if (meta.cast.any { it.lowercase().contains(actorLower) || actorLower.contains(it.lowercase()) }) {
                        score += 80
                    }
                }
                if (score == 0 && metaTitleLower.contains(actorLower)) {
                    score -= 50
                }
                score
            }.thenByDescending { it.year ?: "" }).filter { meta ->
                val metaTitleLower = meta.name.lowercase().trim()
                val isCredited = metaTitleLower in creditedTitles || creditedTitles.any { it.contains(metaTitleLower) || metaTitleLower.contains(it) }
                    || (if (actor.isDirector) meta.directors.any { it.lowercase().contains(actorLower) } else meta.cast.any { it.lowercase().contains(actorLower) })
                isCredited || allMetas.size <= 4 || !metaTitleLower.contains(actorLower)
            }.take(16)
        }) { result ->
            if (canceled) return@background
            cancelStreamResolution()
            result.exceptionOrNull()?.let { error ->
                val reason = failureOf(error)
                FailureLog.record(FailureLog.Operation.SEARCH, reason)
                choose(actor.name, listOf(getString(R.string.action_ok)),
                    failureMessage(R.string.filmography_failed, reason, advice = false)) {
                    val fallback = if (infoOpen) infoOverlay else if (::playButton.isInitialized) playButton else null
                    (originView.takeIf { it.isAttachedToWindow } ?: fallback)?.requestFocus()
                }
                return@background
            }
            val titles = result.getOrNull().orEmpty()
            if (titles.isEmpty()) {
                choose(actor.name, listOf(getString(R.string.action_ok)),
                    getString(R.string.filmography_empty)) {
                    val fallback = if (infoOpen) infoOverlay else if (::playButton.isInitialized) playButton else null
                    (originView.takeIf { it.isAttachedToWindow } ?: fallback)?.requestFocus()
                }
                return@background
            }
            val heading = if (actor.isDirector) getString(R.string.directed_by, actor.name) else actor.name
            buildFilmographyOverlay(heading, titles)
            openFilmography()
        }
    }

    private fun buildFilmographyOverlay(heading: String, titles: List<Meta>) {
        if (::filmographyOverlay.isInitialized) root.removeView(filmographyOverlay)
        filmographyOverlay = buildPosterRowOverlay(heading, titles) { filmographyFirst = it }
        root.addView(filmographyOverlay, FrameLayout.LayoutParams(-1, -1))
    }

    private fun openFilmography() {
        if (!::filmographyOverlay.isInitialized || filmographyOpen) return
        filmographyOpen = true
        if (infoOpen) {
            infoOverlay.visibility = View.INVISIBLE
        } else {
            hero.visibility = View.INVISIBLE
        }
        filmographyOverlay.visibility = View.VISIBLE
        filmographyOverlay.alpha = 0f
        filmographyOverlay.translationY = dp(20).toFloat()
        filmographyOverlay.enter().alpha(1f).translationY(0f).start()
        filmographyFirst?.requestFocus()
    }

    private fun focusFilmographyReturnTarget(actorAttached: Boolean) {
        val target = when (resolveFilmographyReturnTarget(actorAttached, infoOpen)) {
            FilmographyReturnTarget.LAST_FOCUSED_ACTOR -> lastFocusedActor
            FilmographyReturnTarget.INFO_OVERLAY -> infoOverlay
            FilmographyReturnTarget.PLAY_BUTTON -> if (::playButton.isInitialized) playButton else null
        }
        target?.requestFocus()
    }

    private fun hideFilmography() {
        if (!filmographyOpen) return
        filmographyOpen = false
        filmographyOverlay.exit().alpha(0f).translationY(dp(20).toFloat()).withEndAction {
            filmographyOverlay.visibility = View.GONE
            if (infoOpen) {
                infoOverlay.visibility = View.VISIBLE
                focusFilmographyReturnTarget(lastFocusedActor?.isAttachedToWindow == true)
            } else if (shouldShowHero(overlays())) {
                hero.visibility = View.VISIBLE
                val actorAttached = lastFocusedActor?.isAttachedToWindow == true
                val castIndex = if (actorAttached) castChips.indexOf(lastFocusedActor) else -1
                val heroFocus = resolveFilmographyHeroFocus(actorAttached, castIndex)
                if (!refreshHeroIfNeeded(heroFocus.control, heroFocus.castIndex)) {
                    focusFilmographyReturnTarget(actorAttached)
                }
            }
        }.start()
    }

    // ---------- shared ----------

    private var resolvingStreams: Cancellable? = null
    private lateinit var loadingView: FrameLayout
    private lateinit var loadingStatus: TextView

    private fun cancelStreamResolution() {
        resolvingStreams?.cancel()
        resolvingStreams = null
        if (::loadingView.isInitialized) loadingView.visibility = View.GONE
    }

    private fun playTrailer(m: Meta) {
        if (resolvingStreams != null) return
        val ready = m.trailerStreams + imdbTrailers
        if (ready.isNotEmpty()) {
            startTrailerPlayer(m, ready)
            return
        }
        if (!m.id.startsWith("tt")) {
            openExternalTrailer(m.trailerYtId)
            return
        }
        var canceled = false
        resolvingStreams = object : Cancellable { override fun cancel() { canceled = true } }
        loadingStatus.text = getString(R.string.loading_trailer)
        loadingView.visibility = View.VISIBLE
        loadingView.bringToFront()
        background({ imdbTrailerStreams(m.id) }) { result ->
            if (canceled) return@background
            cancelStreamResolution()
            val streams = result.getOrDefault(emptyList())
            if (streams.isNotEmpty()) {
                imdbTrailers = streams
                startTrailerPlayer(m, streams)
            } else {
                openExternalTrailer(m.trailerYtId)
            }
        }
    }

    private fun startTrailerPlayer(m: Meta, streams: List<Stream>) {
        startActivity(Intent(this, PlayerActivity::class.java)
            .putExtra("type", type)
            .putExtra("id", metaId)
            .putExtra("videoId", "$metaId:trailer")
            .putExtra("name", m.name.ifBlank { name })
            .putExtra("poster", m.poster ?: poster)
            .putExtra("background", m.background)
            .putExtra("logo", m.logo)
            .putExtra("isTrailer", true)
            .putExtra("trailerYtId", m.trailerYtId)
            .putExtra("sources", org.json.JSONArray(streams.map { it.toJson() }).toString()))
    }

    private fun openExternalTrailer(ytId: String?) {
        val id = ytId?.takeIf { it.isNotBlank() } ?: return
        val opened = runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("vnd.youtube:$id")))
        }.isSuccess
        if (!opened && runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://www.youtube.com/watch?v=$id")))
        }.isFailure) choose(getString(R.string.action_trailer), listOf(getString(R.string.action_ok)), getString(R.string.trailer_no_app)) {}
    }

    private fun openSources(videoId: String, startOver: Boolean, next: String? = null, label: String? = null, pick: Boolean = false) {
        if (resolvingStreams != null) return
        val m = meta
        val nextId = next ?: m?.videos?.let { vs -> vs.getOrNull(vs.indexOfFirst { it.id == videoId } + 1)?.id }
        val video = m?.videos?.firstOrNull { it.id == videoId }
        val short = label ?: video?.let { "S${it.season} E${it.episode}" }
        val resumeAt = if (startOver) 0L else item?.let { Library.resumeAt(it, videoId) } ?: 0L
        val intent = Intent(this, StreamsActivity::class.java)
            .putExtra("type", type).putExtra("id", metaId).putExtra("name", m?.name ?: name).putExtra("poster", m?.poster ?: poster)
            .putExtra("videoId", videoId).putExtra("nextVideoId", nextId).putExtra("startOver", startOver).putExtra("pick", pick)
            .putExtra("background", m?.background)
            .putExtra("label", listOfNotNull(m?.name ?: name, short).joinToString("  ·  "))
            // For the sources page: the title's logo, the episode's still and "S1 E3 · OutKast".
            .putExtra("logo", m?.logo).putExtra("still", video?.thumbnail).putExtra("runtime", m?.runtime)
            .putExtra("blurStill", Settings.blurThumbnails(this) && video != null && video.id !in Library.watched(item, m?.videos.orEmpty()))
            .putExtra("episode", video?.let { v -> listOfNotNull("S${v.season} E${v.episode}", v.title.takeIf { it.isNotBlank() }).joinToString("  ·  ") })
            .apply { if (shouldIncludeResumeAtExtra(resumeAt, startOver)) putExtra("resumeAt", resumeAt) }

        if (pick || Settings.alwaysList(this)) {
            startActivity(intent)
            return
        }

        startActivity(Intent(this, PlayerActivity::class.java).putExtras(intent))
    }

    override fun onPause() {
        cancelStreamResolution()
        super.onPause()
    }

    // Back from the player: progress, the resume point and My List may have changed.
    override fun onRestart() {
        super.onRestart()
        background({ runCatching { ProfileLibrary.library(applicationContext, libraryProfile, listOf(metaId)).firstOrNull() }.getOrNull()
            ?: ProfileLibrary.savedLibrary(applicationContext, libraryProfile)?.firstOrNull { it.optString("_id") == metaId } }) { result ->
            item = result.getOrNull() ?: item
            val wasGuide = guideOpen
            if (shouldCloseInfoOnRestart(infoOpen, filmographyOpen)) {
                root.removeView(infoOverlay)
                infoOpen = false
                storyScrollView = null
            }
            hero.visibility = if (shouldShowHero(overlays())) View.VISIBLE else View.INVISIBLE
            if (anyOverlayOpen()) {
                heroNeedsRefresh = true
            } else {
                showHero(meta)
            }
            meta?.videos?.takeIf { episodic && it.isNotEmpty() }?.let(::buildGuide)
            if (wasGuide) showGuide()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            if (event.keyCode == KeyEvent.KEYCODE_BACK && resolvingStreams != null) {
                cancelStreamResolution()
                return true
            }
            if (guideOpen) {
                val focused = currentFocus
                if (focused in seasonButtons.values) when (event.keyCode) {
                    KeyEvent.KEYCODE_DPAD_DOWN -> { episodeRows.firstOrNull()?.requestFocus(); return true }
                    KeyEvent.KEYCODE_DPAD_UP -> return true
                }
                val at = episodeRows.indexOf(focused)
                if (at >= 0) when (event.keyCode) {
                    KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> return true
                    KeyEvent.KEYCODE_DPAD_UP -> if (at == 0) { seasonButtons[selectedSeason]?.requestFocus(); return true }
                    KeyEvent.KEYCODE_DPAD_DOWN -> if (at == episodeRows.lastIndex) return true
                }
            } else if (filmographyOpen && event.keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                hideFilmography()
                return true
            } else if (similarOpen && event.keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                hideSimilar()
                return true
            } else if (infoOpen && !filmographyOpen) {
                if (event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    if (currentFocus === storyScrollView && infoCastCards.isNotEmpty()) {
                        infoCastCards.first().requestFocus()
                        return true
                    }
                } else if (event.keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    if (currentFocus?.let { v -> infoCastCards.any { it === v || isInside(v, it) } } == true &&
                        storyScrollView?.isFocusable == true) {
                        storyScrollView?.requestFocus()
                        return true
                    }
                }
            } else if (!infoOpen && !similarOpen && !filmographyOpen && currentFocus?.let { v -> castChips.any { it === v || isInside(v, it) } } == true) {
                val chipIndex = castChips.indexOfFirst { it === currentFocus || isInside(currentFocus!!, it) }
                when (event.keyCode) {
                    KeyEvent.KEYCODE_DPAD_DOWN -> { playButton.requestFocus(); return true }
                    KeyEvent.KEYCODE_DPAD_UP -> return true
                    KeyEvent.KEYCODE_DPAD_LEFT -> if (chipIndex == 0) return true
                    KeyEvent.KEYCODE_DPAD_RIGHT -> if (chipIndex == castChips.lastIndex) return true
                }
            } else if (!infoOpen && !similarOpen && !filmographyOpen &&
                currentFocus?.let { (::playButton.isInitialized && it === playButton) || (::buttonRow.isInitialized && isInside(it, buttonRow)) } == true) {
                if (event.keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    castChips.firstOrNull()?.requestFocus()
                    return true
                } else if (event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT && ::playButton.isInitialized && currentFocus === playButton) {
                    return true
                } else if (event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT && ::buttonRow.isInitialized &&
                    currentFocus === (0 until buttonRow.childCount).map { buttonRow.getChildAt(it) }.lastOrNull { it.visibility == View.VISIBLE && it.isFocusable }) {
                    return true
                }
            }
            if (!infoOpen && !similarOpen && !filmographyOpen && event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN &&
                currentFocus?.let { isInside(it, hero) } == true &&
                (if (episodic) ::guide.isInitialized else ::similarOverlay.isInitialized)) {
                if (episodic) showGuide() else showSimilar()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onBackPressed() {
        when {
            filmographyOpen -> hideFilmography()
            infoOpen -> hideInfo()
            guideOpen -> hideGuide()
            similarOpen -> hideSimilar()
            else -> super.onBackPressed()
        }
    }

    private companion object {
        const val GUIDE_ART = 0.45f // the film's brightness behind the episode guide
    }
}
