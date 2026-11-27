package dev.tarn

/**
 * Credits from a trusted marker take precedence over the conservative end-of-file fallback.
 * No network access or player state belongs here, so timing decisions can be unit tested.
 */
internal object EpisodeAutoplayTiming {
    private val creditsChapter = Regex("""(?i)\b(credits?|closing|outro|ending)\b""")
    private const val MIN_EPISODE_MS = 2 * 60_000L
    private const val MIN_REMAINING_MS = 5_000L

    private fun validMarker(durationMs: Long, startMs: Long): Boolean =
        durationMs >= MIN_EPISODE_MS &&
            startMs >= durationMs / 2 &&
            startMs <= durationMs - MIN_REMAINING_MS

    fun metadataStart(durationMs: Long, introDbAtMs: Long, chapters: List<MkvChapter>): Long? {
        if (validMarker(durationMs, introDbAtMs)) return introDbAtMs
        return chapters.asSequence()
            .filter { creditsChapter.containsMatchIn(it.title) }
            .filterNot { it.title.contains("post-credits", true) || it.title.contains("after credits", true) }
            .map { it.startMs }
            .filter { validMarker(durationMs, it) }
            .minOrNull()
    }

    /** Settings controls how many seconds before the end to offer autoplay without accurate markers. */
    fun triggerAt(durationMs: Long, introDbAtMs: Long, chapters: List<MkvChapter>, fallbackSeconds: Int): Long? {
        if (durationMs < MIN_EPISODE_MS) return null
        return metadataStart(durationMs, introDbAtMs, chapters)
            ?: (durationMs - fallbackSeconds.coerceIn(5, 30) * 1_000L).coerceAtLeast(0L)
    }
}

/** A one-shot, playback-time countdown. Pausing or buffering must not count as watched seconds. */
internal class EpisodeAutoplayCountdown(val totalSeconds: Int = 5) {
    init { require(totalSeconds > 0) }

    var remainingSeconds: Int = totalSeconds
        private set

    fun tick(isPlaying: Boolean): Boolean {
        if (isPlaying && remainingSeconds > 0) remainingSeconds--
        return remainingSeconds == 0
    }
}

/** Explicit origin keeps automated transitions separate from remote actions for future session policies. */
internal enum class EpisodeAdvanceOrigin { MANUAL, AUTOPLAY }
