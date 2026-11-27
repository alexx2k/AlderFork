package dev.tarn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LibraryAutoplayTest {
    @Test fun earlyCreditsCompletionAdvancesWithoutInventingWatchTime() {
        val item = Library.newItem("tt123", "series", "Show", null)
        Library.record(item, "tt123:1:1", 26 * 60_000L, 42 * 60_000L, 10_000L)
        val totalBefore = item.state.optLong("overallTimeWatched")
        Library.completeAndAdvance(item, emptyList(), "tt123:1:1", "tt123:1:2")

        assertEquals("tt123:1:2", Library.savedVideoId(item))
        assertTrue(Library.nextEpisodePending(item))
        assertEquals(0L, Library.resumeAt(item, "tt123:1:2"))
        assertEquals(totalBefore, item.state.optLong("overallTimeWatched"))
        assertEquals(1, item.state.optInt("timesWatched"))
    }

    @Test fun staleEpisodeCannotClobberLaterProgress() {
        val item = Library.newItem("tt123", "series", "Show", null)
        Library.record(item, "tt123:1:2", 35_000L, 42 * 60_000L, 10_000L)
        Library.completeAndAdvance(item, emptyList(), "tt123:1:1", "tt123:1:2")
        assertEquals("tt123:1:2", Library.savedVideoId(item))
        assertEquals(35_000L, item.state.optLong("timeOffset"))
    }
}
