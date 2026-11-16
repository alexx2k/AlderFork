package dev.alder

import org.junit.Assert.*
import org.junit.Test

class StillWatchingSessionTest {
    private fun autoStart(s: StillWatchingSession): StillWatchingSession =
        s.forAdvance(EpisodeAdvanceOrigin.AUTOPLAY).apply { onFirstRenderedFrame() }

    @Test fun manualFirstEpisodeIsNotCountedAndPromptComesBeforeEpisodeFive() {
        var s = StillWatchingSession("profile-one")
        s.onFirstRenderedFrame()
        assertEquals(0, s.autoStarts)
        repeat(2) {
            s = autoStart(s)
            assertEquals(AutoplayDecision.PLAY_NEXT, s.autoplayDecision(true))
        }
        s = autoStart(s)
        assertEquals(3, s.autoStarts)
        assertEquals(AutoplayDecision.ASK, s.autoplayDecision(true))
    }

    @Test fun failedStartOrAutomaticFallbackDoesNotCountAnEpisode() {
        val pending = StillWatchingSession("one").forAdvance(EpisodeAdvanceOrigin.AUTOPLAY)
        assertTrue(pending.pendingAutoFrame)
        assertEquals(0, pending.autoStarts)
        pending.onFirstRenderedFrame()
        pending.onFirstRenderedFrame()
        assertEquals(1, pending.autoStarts)
    }

    @Test fun intentionalRemoteInputClearsCountAndPendingAutoStart() {
        val s = autoStart(autoStart(StillWatchingSession("one"))).forAdvance(EpisodeAdvanceOrigin.AUTOPLAY)
        assertEquals(2, s.autoStarts)
        s.onIntentionalInput()
        s.onFirstRenderedFrame()
        assertEquals(0, s.autoStarts)
        assertFalse(s.pendingAutoFrame)
    }

    @Test fun manualNextEpisodeResetsCountAndCannotCountAsAutomatic() {
        val s = autoStart(autoStart(StillWatchingSession("one")))
            .forAdvance(EpisodeAdvanceOrigin.MANUAL)
        s.onFirstRenderedFrame()
        assertEquals(0, s.autoStarts)
        assertEquals(AutoplayDecision.PLAY_NEXT, s.autoplayDecision(true))
    }

    @Test fun keepWatchingStartsNewThreeEpisodeWindow() {
        var s = autoStart(autoStart(autoStart(StillWatchingSession("one"))))
        assertTrue(s.shouldConfirmBeforeNext())
        s.confirm(dontAskAgain = false)
        assertFalse(s.shouldConfirmBeforeNext())
        repeat(3) { s = autoStart(s) }
        assertEquals(AutoplayDecision.ASK, s.autoplayDecision(true))
    }

    @Test fun dontAskAgainSurvivesTransitionsAndHumanInputButNotNewSession() {
        var s = autoStart(autoStart(autoStart(StillWatchingSession("one"))))
        s.confirm(dontAskAgain = true)
        repeat(5) { s = autoStart(s) }
        assertEquals(AutoplayDecision.PLAY_NEXT, s.autoplayDecision(true))
        s.onIntentionalInput()
        assertTrue(s.suppressed)
        assertFalse(StillWatchingSession("one").suppressed)
    }

    @Test fun sessionIsAlwaysIsolatedByProfileId() {
        val old = autoStart(autoStart(autoStart(StillWatchingSession("one"))))
        assertEquals(0, StillWatchingSession.restore("two", old.profileId, old.autoStarts, old.suppressed, false).autoStarts)
        assertEquals(3, StillWatchingSession.restore("one", old.profileId, old.autoStarts, old.suppressed, false).autoStarts)
    }

    @Test fun noNextEpisodeOrViewerStopNeverPromptsOrAutoPlays() {
        val s = autoStart(autoStart(autoStart(StillWatchingSession("one"))))
        assertEquals(AutoplayDecision.STOP, s.autoplayDecision(hasNext = false))
        assertEquals(AutoplayDecision.STOP, s.autoplayDecision(hasNext = true, viewerStopped = true))
    }

    @Test fun cappedCountsAndBrieflyFreshPreparedSources() {
        var s = StillWatchingSession("one", initialAutoStarts = 100)
        assertEquals(3, s.autoStarts)
        s = autoStart(s)
        assertEquals(3, s.autoStarts)
        assertTrue(preparedSourcesFresh(1000, 120_000))
        assertFalse(preparedSourcesFresh(1000, 121_001))
        assertFalse(preparedSourcesFresh(1000, 900))
        assertFalse(preparedSourcesFresh(0, 10))
    }
}
