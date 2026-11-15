package dev.alder

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.exoplayer.audio.AudioCapabilities
import java.util.concurrent.Executor

interface Cancellable {
    fun cancel()
}

object StreamsResolver {
    const val TRY = 3

    fun rank(
        context: Context,
        streams: List<Stream>,
        videoId: String,
        metaId: String?,
        maxHeight: Int = 0,
        profileId: String? = null
    ): List<Stream> {
        val prefs = context.getSharedPreferences("sources", Context.MODE_PRIVATE)
        val file = prefs.getString("file:$videoId", null)
        val binge = metaId?.let { prefs.getString("binge:$it", null) }
        val tv = Device.of(context)
        val preferResolution = Settings.release(context) == "remux" && Settings.hdrPref(context) == "dv"
        val preferred = PreferredServers.forEpisode(context, profileId, metaId, videoId)
        return rank(streams, tv, Settings.displayHeight(context), file, binge, maxHeight > 0,
            preference(context), preferResolution, preferred)
    }

    internal fun rank(
        streams: List<Stream>,
        tv: Device,
        displayOverride: Int,
        file: String?,
        binge: String?,
        lower: Boolean,
        prefer: (Stream) -> Int,
        preferResolution: Boolean,
        preferredProviderId: String? = null
    ): List<Stream> {
        val displayHeight = if (displayOverride > 0) displayOverride else tv.height
        // P2P after every direct or debrid source: peers start slower and can't be checked first.
        // A P2P source its add-on says nobody shares (👤 0) can't start: after every other.
        val ranked = streams.sortedWith(compareBy<Stream> { it.torrent != null }
            .thenBy { it.torrent != null && it.seeders == 0 }
            .thenByDescending { if (lower) it.height else 0 }
            .thenByDescending { file != null && it.filename == file }
            .thenByDescending { binge != null && it.bingeGroup == binge }
            .thenBy { it.awkward }
            .thenBy { it.dolbyVisionOnly && !tv.dolbyVision }
            .thenByDescending { it.fit(tv, displayHeight) }
            .thenByDescending(prefer)
            .thenByDescending { if (preferResolution && it.height <= displayHeight) it.height else 0 }
            .thenByDescending { if (it.torrent != null) it.seeders ?: 0 else 0 })
        return preferProvider(ranked, preferredProviderId)
    }

    /** Preserve quality ranking inside each group; never choose a known zero-seed P2P stream as preferred. */
    internal fun preferProvider(ranked: List<Stream>, preferredProviderId: String?): List<Stream> {
        if (preferredProviderId.isNullOrBlank()) return ranked
        val (preferred, other) = ranked.partition {
            it.providerId == preferredProviderId && (it.torrent == null || it.seeders != 0)
        }
        return preferred + other
    }

    /** Keep one automatic alternative in the three-source retry list whenever possible. */
    internal fun playbackCandidates(ranked: List<Stream>, preferredProviderId: String?): List<Stream> {
        if (preferredProviderId.isNullOrBlank()) return ranked.take(TRY)
        val (preferred, other) = ranked.partition {
            it.providerId == preferredProviderId && (it.torrent == null || it.seeders != 0)
        }
        if (preferred.isEmpty() || other.isEmpty()) return ranked.take(TRY)
        val first = preferred.take(TRY - 1) + other.take(1)
        return (first + ranked).distinct().take(TRY)
    }

    @androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
    fun preference(context: Context): (Stream) -> Int {
        val release = Settings.release(context)
        val hdr = Settings.hdrPref(context)
        val dub = Settings.dub(context)
        val language = Settings.audioLanguage(context)
        val audio = if (Settings.decodeAudio(context)) null else AudioCapabilities.getCapabilities(context, AudioAttributes.DEFAULT, null)
        val trueHd = audio?.supportsEncoding(C.ENCODING_DOLBY_TRUEHD) == true
        val dtsHd = audio?.supportsEncoding(C.ENCODING_DTS_HD) == true
        return { s ->
            when (release) {
                "remux" -> if (s.remux) 3 else if (s.bluray) 1 else 0
                "encode" -> if (s.remux) -2 else if (s.bluray || s.web) 2 else 0
                "web" -> if (s.web && !s.remux) 2 else if (s.remux) -2 else 0
                else -> 0
            } + when (hdr) {
                "dv" -> if (s.dolbyVision) 2 else if (s.hdr) 1 else 0
                "hdr10" -> if (s.hdr) 2 else 0
                else -> 0
            } + when (dub) {
                "original" -> if (s.dubbed) -2 else 0
                "mine" -> if (s.mentions(language)) 2 else if (s.multiAudio) 1 else 0
                else -> 0
            } + if ((trueHd && s.trueHdAudio) || (dtsHd && s.dtsHdAudio)) 1 else 0
        }
    }

    fun wanted(context: Context, s: Stream, maxHeight: Int = 0): Boolean {
        val limitHeight = maxHeight.takeIf { it > 0 } ?: Settings.maxHeight(context)
        val maxBytes = Settings.maxSizeGb(context) * 1_073_741_824L
        return (limitHeight == 0 || s.height == 0 || s.height <= limitHeight) &&
            (maxBytes == 0L || s.size == 0L || s.size <= maxBytes) &&
            (Settings.hdr(context) || !s.isHdr) && !s.cam
    }

    fun resolve(
        context: Context,
        type: String,
        videoId: String,
        metaId: String,
        authKey: String?,
        profileId: String? = null,
        maxHeight: Int = 0,
        executor: Executor = Screen.pool,
        mainHandler: Handler = Handler(Looper.getMainLooper()),
        onReady: (List<Stream>) -> Unit,
        onFallback: () -> Unit
    ): Cancellable {
        val key = authKey ?: run {
            mainHandler.post(onFallback)
            return object : Cancellable { override fun cancel() {} }
        }

        var canceled = false
        var started = false
        var waitingForEarlier = false
        val tv = Device.of(context)

        val cancellable = object : Cancellable {
            override fun cancel() {
                canceled = true
            }
        }

        val lenders = Profiles.streamLenders(context)
        val preferredProviderId = PreferredServers.forEpisode(context, profileId, metaId, videoId)

        executor.execute {
            if (canceled) return@execute
            val res = runCatching {
                val own = Stremio.addons(key).filter { it.providesStreams }
                val lent = lenders.flatMap { lender ->
                    runCatching {
                        (Stremio.savedAddons(lender.authKey) ?: Stremio.addons(lender.authKey)).filter { it.shareable }
                    }.getOrDefault(emptyList())
                }
                val household = lent.filter { it.serves("stream", type, videoId) }.distinctBy { it.id }
                household + own.filter { it.serves("stream", type, videoId) }.filterNot { mine -> household.any { it.id == mine.id } }
            }

            val addons = res.getOrNull().orEmpty().sortedByDescending { it.id == preferredProviderId }
            if (addons.isEmpty()) {
                mainHandler.post { if (!canceled) onFallback() }
                return@execute
            }

            val answers = arrayOfNulls<List<Stream>>(addons.size)

            fun tryStart(allowGaps: Boolean = false) {
                if (canceled || started) return
                val ready = readyStreams(answers, allowGaps)
                val best = rank(context, ready.filter { it.isVideo && it.playableOn(tv) && wanted(context, it, maxHeight) },
                    videoId, metaId, maxHeight, profileId)
                if (best.isEmpty() && answers.any { it == null }) return
                // If the remembered add-on replied first, allow a brief window for an automatic
                // fallback from another add-on to join the player's retry list.
                if (!allowGaps && preferredProviderId != null && answers.any { it == null } &&
                    best.any { it.providerId == preferredProviderId } &&
                    best.none { it.providerId != preferredProviderId }) return
                if (best.isEmpty()) {
                    started = true
                    onFallback()
                    return
                }
                started = true
                onReady(playbackCandidates(best, preferredProviderId))
            }

            addons.forEachIndexed { i, addon ->
                executor.execute {
                    if (canceled) return@execute
                    // Retain the existing direct-play P2P policy unless the viewer explicitly chose this provider.
                    val streamsResult = runCatching { addon.streams(type, videoId,
                        allowTorrents = supportsTorrentPlayback && addon.id == preferredProviderId) }
                    mainHandler.post {
                        if (canceled) return@post
                        answers[i] = streamsResult.getOrNull()?.playable.orEmpty()
                        if (answers.all { it != null }) {
                            tryStart(allowGaps = true)
                        } else {
                            tryStart(allowGaps = false)
                            if (!started && !waitingForEarlier && readyStreams(answers, true).any { it.isVideo && it.playableOn(tv) && wanted(context, it, maxHeight) }) {
                                waitingForEarlier = true
                                val awaitingPreference = addons.indices.any { j ->
                                    addons[j].id == preferredProviderId && answers[j] == null
                                }
                                mainHandler.postDelayed({ tryStart(allowGaps = true) }, if (awaitingPreference) 3_000 else 800)
                            }
                        }
                    }
                }
            }
        }

        return cancellable
    }
}
