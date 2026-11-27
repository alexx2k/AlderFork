package dev.tarn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EpisodeAutoplayTest {
    private val duration = 40 * 60_000L

    @Test fun confidentIntroDbMarkerWinsOverChapters() {
        val chapters = listOf(MkvChapter(32 * 60_000L, "Credits"))
        assertEquals(30 * 60_000L, EpisodeAutoplayTiming.triggerAt(duration, 30 * 60_000L, chapters, 10))
    }

    @Test fun creditsChapterUsedWithoutIntroDb() {
        assertEquals(35 * 60_000L,
            EpisodeAutoplayTiming.triggerAt(duration, 0L, listOf(MkvChapter(35 * 60_000L, "End Credits")), 10))
    }

    @Test fun implausibleMarkersFallBackConservatively() {
        assertEquals(duration - 10_000L,
            EpisodeAutoplayTiming.triggerAt(duration, 10_000L, listOf(MkvChapter(3_000L, "Credits")), 10))
        assertEquals(duration - 10_000L,
            EpisodeAutoplayTiming.triggerAt(duration, duration - 1_000L, emptyList(), 10))
    }

    @Test fun postCreditSceneIsNotMistakenForCreditsStart() {
        assertEquals(duration - 10_000L,
            EpisodeAutoplayTiming.triggerAt(duration, 0L, listOf(MkvChapter(duration - 20_000L, "Post-credits scene")), 10))
    }

    @Test fun fallbackIsConfigurableButBounded() {
        assertEquals(duration - 30_000L, EpisodeAutoplayTiming.triggerAt(duration, 0, emptyList(), 100))
        assertEquals(duration - 5_000L, EpisodeAutoplayTiming.triggerAt(duration, 0, emptyList(), 0))
    }

    @Test fun shortOrUnknownDurationsCannotTriggerAutoplay() {
        assertNull(EpisodeAutoplayTiming.triggerAt(0, 0, emptyList(), 10))
        assertNull(EpisodeAutoplayTiming.triggerAt(90_000, 0, emptyList(), 10))
    }

    @Test fun countdownOnlyProgressesWhileVideoPlays() {
        val c = EpisodeAutoplayCountdown()
        repeat(3) { assertFalse(c.tick(false)) }
        repeat(4) { assertFalse(c.tick(true)) }
        assertEquals(1, c.remainingSeconds)
        assertTrue(c.tick(true))
        assertTrue(c.tick(true))
        assertEquals(0, c.remainingSeconds)
    }

    @Test fun defaultOriginIsDistinguishableFromRemoteAction() {
        assertFalse(EpisodeAdvanceOrigin.AUTOPLAY == EpisodeAdvanceOrigin.MANUAL)
    }
}
