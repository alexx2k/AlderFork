package dev.alder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StreamsResolverTest {

    private fun stream(
        title: String = "Test Stream",
        url: String = "https://example.com/stream.mkv",
        filename: String? = "test.mkv",
        size: Long = 1_000_000_000L,
        bingeGroup: String? = null
    ): Stream = Stream(
        title = title,
        description = "",
        url = url,
        headers = emptyMap(),
        size = size,
        filename = filename,
        bingeGroup = bingeGroup
    )

    @Test
    fun readyStreamsStopsAtNullWhenGapsDisallowed() {
        val s1 = stream("s1")
        val s2 = stream("s2")
        val s3 = stream("s3")
        val answers: Array<List<Stream>?> = arrayOf(listOf(s1), null, listOf(s3))

        val withoutGaps = readyStreams(answers, allowGaps = false)
        assertEquals(listOf(s1), withoutGaps)

        val withGaps = readyStreams(answers, allowGaps = true)
        assertEquals(listOf(s1, s3), withGaps)
    }

    @Test
    fun ranksHigherResolutionWhenItFitsAndBestPictureIsPreferred() {
        val hd = stream("Movie 1080p WEB-DL")
        val uhd = stream("Movie 2160p WEB-DL")
        val tv = Device(hevc = true, av1 = false, dolbyVision = false, hdr = true, height = 1080)
        val uhdTv = Device(hevc = true, av1 = false, dolbyVision = false, hdr = false, height = 2160)

        fun rank(device: Device, override: Int = 0, bestPicture: Boolean = true) =
            StreamsResolver.rank(listOf(hd, uhd), device, override, null, null, false, { 0 }, bestPicture)

        assertEquals(listOf(hd, uhd), rank(tv))
        assertEquals(listOf(uhd, hd), rank(uhdTv))
        assertEquals(listOf(uhd, hd), rank(tv, override = 2160))
        assertEquals(listOf(hd, uhd), rank(uhdTv, override = 1080))
        assertEquals(listOf(hd, uhd), rank(uhdTv, bestPicture = false))
    }

    @Test
    fun wantedFiltersCamReleases() {
        val cam = stream("Movie (CAM)")
        assertTrue(cam.cam)

        val nonCam = stream("Movie 1080p BluRay")
        assertFalse(nonCam.cam)
    }


    @Test
    fun streamProviderSurvivesPlayerIntentSerialization() {
        val chosen = stream("Torrentio 1080p").withProvider("com.torrentio")
        assertEquals("com.torrentio", Stream.read(chosen.toJson()).providerId)
        assertEquals(chosen.title, Stream.read(chosen.toJson()).title)
    }

    @Test
    fun preferredProviderTakesPriorityWithinNormalQualityRanking() {
        val favoriteHd = stream("Favorite 1080p", bingeGroup = "new").withProvider("com.torrentio")
        val alternative4k = stream("Alternative 2160p", bingeGroup = "old").withProvider("com.comet")
        val device = Device(hevc = true, av1 = true, dolbyVision = true, hdr = true, height = 2160)
        val candidates = listOf(alternative4k, favoriteHd)

        // Without a manual preference, the earlier binge group and release ranking still apply.
        assertEquals(alternative4k, StreamsResolver.rank(candidates, device, 0, null,
            "old", false, { 0 }, true).first())
        assertEquals(favoriteHd, StreamsResolver.rank(candidates, device, 0, null,
            "old", false, { 0 }, true, "com.torrentio").first())
        // If the preferred add-on has no suitable streams, use normal automatic selection.
        assertEquals(StreamsResolver.rank(candidates, device, 0, null, "old", false, { 0 }, true),
            StreamsResolver.rank(candidates, device, 0, null, "old", false, { 0 }, true, "missing"))
    }

    @Test
    fun automaticRetriesIncludeAnotherProviderWheneverAvailable() {
        val preferred = (1..4).map { stream("Preferred $it").withProvider("com.torrentio") }
        val automatic = (1..2).map { stream("Alternative $it").withProvider("com.comet") }
        val ranked = StreamsResolver.preferProvider(automatic + preferred, "com.torrentio")
        val chosen = StreamsResolver.playbackCandidates(ranked, "com.torrentio")

        assertEquals(StreamsResolver.TRY, chosen.size)
        assertEquals(preferred.take(2), chosen.take(2))
        assertEquals(automatic.first(), chosen.last())
        assertEquals(automatic.take(2), StreamsResolver.playbackCandidates(automatic, "com.torrentio"))
        assertEquals((automatic + preferred).take(3),
            StreamsResolver.playbackCandidates(automatic + preferred, null))
    }

    @Test
    fun cancellableCanBeCanceled() {
        var canceled = false
        val c = object : Cancellable {
            override fun cancel() { canceled = true }
        }
        assertFalse(canceled)
        c.cancel()
        assertTrue(canceled)
    }
}
