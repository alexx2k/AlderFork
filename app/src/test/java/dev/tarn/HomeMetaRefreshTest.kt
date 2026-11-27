package dev.tarn

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class HomeMetaRefreshTest {
    private val stale = Meta(JSONObject().put("id", "tt1").put("type", "series").put("name", "Stale"))
    private val fresh = Meta(JSONObject().put("id", "tt1").put("type", "series").put("name", "Fresh"))
    private val ttlMs = 6 * 60 * 60 * 1000L

    @Test
    fun freshCacheSkipsRemoteFetch() {
        var remoteCalled = false
        val got = resolveMetaWithOfflineFallback(
            ttl = ttlMs,
            readSaved = { age -> if (age == ttlMs) fresh else null },
            fetchRemote = { remoteCalled = true; fresh },
        )
        assertEquals("Fresh", got?.meta?.name)
        assertEquals(true, got?.fresh)
        assertEquals(false, remoteCalled)
    }

    @Test
    fun expiredCacheRefreshesOnlineWhenAvailable() {
        val seenAges = mutableListOf<Long?>()
        val got = resolveMetaWithOfflineFallback(
            ttl = ttlMs,
            readSaved = { age -> seenAges += age; if (age == null) stale else null },
            fetchRemote = { fresh },
        )
        assertEquals("Fresh", got?.meta?.name)
        assertEquals(true, got?.fresh)
        assertEquals(listOf<Long?>(ttlMs), seenAges)
    }

    @Test
    fun expiredCacheFallsBackToDiskWhenOffline() {
        val seenAges = mutableListOf<Long?>()
        val got = resolveMetaWithOfflineFallback(
            ttl = ttlMs,
            readSaved = { age -> seenAges += age; if (age == null) stale else null },
            fetchRemote = { throw IOException("offline") },
        )
        assertEquals("Stale", got?.meta?.name)
        assertEquals(false, got?.fresh)
        assertEquals(listOf<Long?>(ttlMs, null), seenAges)
    }

    @Test
    fun diskOnlyPassNeverWaitsOnNetworkAndKeepsStaleCopy() {
        val got = resolveMetaWithOfflineFallback(
            ttl = ttlMs,
            readSaved = { age -> if (age == null) stale else null },
            fetchRemote = null,
        )
        assertEquals("Stale", got?.meta?.name)
        assertFalse(got!!.fresh) // stays expired, so the network pass after it refreshes
    }

    @Test
    fun expiredCacheFallsBackToDiskWhenRemoteReturnsNull() {
        val got = resolveMetaWithOfflineFallback(
            ttl = ttlMs,
            readSaved = { age -> if (age == null) stale else null },
            fetchRemote = { null },
        )
        assertEquals("Stale", got?.meta?.name)
        assertEquals(false, got?.fresh)
    }

    @Test
    fun noTtlDoesNotReReadDiskAfterMissAndOfflineFailure() {
        var reads = 0
        val got = resolveMetaWithOfflineFallback(
            ttl = null,
            readSaved = { reads++; null },
            fetchRemote = { throw IOException("offline") },
        )
        assertNull(got)
        assertEquals(1, reads)
    }

    @Test
    fun freshSeriesWithinTtlIsNotExpired() {
        val now = 10_000_000L
        assertFalse(isMetaExpired("series", fetchedAtMs = now - ttlMs + 1L, ttlMs = ttlMs, nowMs = now))
        assertFalse(isMetaExpired("anime", fetchedAtMs = now - 1_000L, ttlMs = ttlMs, nowMs = now))
    }

    @Test
    fun seriesAtOrPastTtlOrWithoutTimestampIsExpired() {
        val now = 30_000_000L
        assertTrue(isMetaExpired("series", fetchedAtMs = null, ttlMs = ttlMs, nowMs = now))
        assertTrue(isMetaExpired("series", fetchedAtMs = now - ttlMs, ttlMs = ttlMs, nowMs = now))
        assertTrue(isMetaExpired("series", fetchedAtMs = now - ttlMs - 1L, ttlMs = ttlMs, nowMs = now))
        assertTrue(isMetaExpired("anime", fetchedAtMs = now - ttlMs, ttlMs = ttlMs, nowMs = now))
    }

    @Test
    fun moviesNeverExpireInMemory() {
        val now = 30_000_000L
        assertFalse(isMetaExpired("movie", fetchedAtMs = null, ttlMs = ttlMs, nowMs = now))
        assertFalse(isMetaExpired("movie", fetchedAtMs = now - ttlMs - 10_000L, ttlMs = ttlMs, nowMs = now))
    }

    @Test
    fun offlineFallbackPreservesExpiredTimestampAndRefreshesOnReconnect() {
        val oldFetchedAt = 10_000_000L
        val offlineNow = oldFetchedAt + ttlMs + 60_000L
        var online = false

        val offlineResolved = resolveMetaWithOfflineFallback(
            ttl = ttlMs,
            readSaved = { age -> if (age == null) stale else null },
            fetchRemote = { if (!online) throw IOException("offline") else fresh },
        )
        assertEquals("Stale", offlineResolved?.meta?.name)
        assertFalse(offlineResolved!!.fresh)

        val preservedTs = preservedMetaTimestamp(
            fresh = offlineResolved.fresh,
            previousFetchedAtMs = oldFetchedAt,
            nowMs = offlineNow,
        )
        assertEquals(oldFetchedAt, preservedTs)
        assertTrue(isMetaExpired("series", fetchedAtMs = preservedTs, ttlMs = ttlMs, nowMs = offlineNow))

        val coldOfflineTs = preservedMetaTimestamp(
            fresh = offlineResolved.fresh,
            previousFetchedAtMs = null,
            nowMs = offlineNow,
        )
        assertEquals(0L, coldOfflineTs)
        assertTrue(isMetaExpired("series", fetchedAtMs = coldOfflineTs, ttlMs = ttlMs, nowMs = offlineNow))

        online = true
        val reconnectNow = offlineNow + 5_000L
        val reconnectedResolved = resolveMetaWithOfflineFallback(
            ttl = ttlMs,
            readSaved = { age -> if (age == null) stale else null },
            fetchRemote = { if (!online) throw IOException("offline") else fresh },
        )
        assertEquals("Fresh", reconnectedResolved?.meta?.name)
        assertTrue(reconnectedResolved!!.fresh)

        val refreshedTs = preservedMetaTimestamp(
            fresh = reconnectedResolved.fresh,
            previousFetchedAtMs = preservedTs,
            nowMs = reconnectNow,
        )
        assertEquals(reconnectNow, refreshedTs)
        assertFalse(isMetaExpired("series", fetchedAtMs = refreshedTs, ttlMs = ttlMs, nowMs = reconnectNow))
    }
}
