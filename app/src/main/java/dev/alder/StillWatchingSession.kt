package dev.alder

/**
 * Ephemeral, profile-bound binge-session policy. No disk writes, player objects or Android
 * dependencies: only a successful first video frame counts as an automatically played episode.
 *
 * A manual launch starts a new session. Automatic episode handoffs transport a snapshot through
 * their Intents, including via StreamsActivity if the prepared sources were unavailable.
 */
internal const val STILL_SESSION_PROFILE_ID = "stillWatchingProfileId"
internal const val STILL_SESSION_PROCESS_ID = "stillWatchingProcessId"

/** A cold launch or Android process death always starts a new viewing session. */
internal object StillWatchingProcess {
    val token: String = java.util.UUID.randomUUID().toString()
}
internal const val STILL_SESSION_AUTO_COUNT = "stillWatchingAutoStarts"
internal const val STILL_SESSION_SUPPRESSED = "stillWatchingSuppressed"
internal const val STILL_SESSION_PENDING_FRAME = "stillWatchingPendingAutoFrame"

internal enum class AutoplayDecision { PLAY_NEXT, ASK, STOP }

internal class StillWatchingSession(
    val profileId: String,
    initialAutoStarts: Int = 0,
    initialSuppressed: Boolean = false,
    initialPendingFrame: Boolean = false
) {
    companion object {
        const val THRESHOLD = 3

        /** Never reuse a session snapshot belonging to another local profile. */
        fun restore(
            profileId: String,
            carriedProfileId: String?,
            autoStarts: Int,
            suppressed: Boolean,
            pendingFrame: Boolean
        ): StillWatchingSession =
            if (profileId == carriedProfileId)
                StillWatchingSession(profileId, autoStarts, suppressed, pendingFrame)
            else StillWatchingSession(profileId)
    }

    var autoStarts: Int = initialAutoStarts.coerceIn(0, THRESHOLD)
        private set
    var suppressed: Boolean = initialSuppressed
        private set
    var pendingAutoFrame: Boolean = initialPendingFrame
        private set

    /** A failed stream/startup or source retry is not an automatically watched episode. */
    fun onFirstRenderedFrame() {
        if (!pendingAutoFrame) return
        pendingAutoFrame = false
        autoStarts = (autoStarts + 1).coerceAtMost(THRESHOLD)
    }

    /** Human remote input resets the streak, but not a session-wide "Don't Ask Again". */
    fun onIntentionalInput() {
        autoStarts = 0
        pendingAutoFrame = false
    }

    fun confirm(dontAskAgain: Boolean) {
        onIntentionalInput()
        if (dontAskAgain) suppressed = true
    }

    fun shouldConfirmBeforeNext(): Boolean = !suppressed && autoStarts >= THRESHOLD

    fun autoplayDecision(hasNext: Boolean, viewerStopped: Boolean = false): AutoplayDecision = when {
        !hasNext || viewerStopped -> AutoplayDecision.STOP
        shouldConfirmBeforeNext() -> AutoplayDecision.ASK
        else -> AutoplayDecision.PLAY_NEXT
    }

    /**
     * The autoplay count increments only in the *destination* player after its first frame.
     * Manually starting an episode is a deliberate interaction and clears the streak.
     */
    fun forAdvance(origin: EpisodeAdvanceOrigin): StillWatchingSession = StillWatchingSession(
        profileId = profileId,
        initialAutoStarts = if (origin == EpisodeAdvanceOrigin.AUTOPLAY) autoStarts else 0,
        initialSuppressed = suppressed,
        initialPendingFrame = origin == EpisodeAdvanceOrigin.AUTOPLAY
    )
}

/** Prepared URL lists are reusable briefly; do not replay stale URLs after a long TV sleep. */
internal fun preparedSourcesFresh(preparedElapsedMs: Long, nowElapsedMs: Long, maxAgeMs: Long = 120_000L): Boolean =
    preparedElapsedMs > 0 && nowElapsedMs >= preparedElapsedMs &&
        nowElapsedMs - preparedElapsedMs <= maxAgeMs
