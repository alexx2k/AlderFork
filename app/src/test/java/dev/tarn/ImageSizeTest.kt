package dev.tarn

import org.junit.Assert.assertEquals
import org.junit.Test

class ImageSizeTest {
    private val original = "https://image.tmdb.org/t/p/original/abc.jpg"

    @Test
    fun fullScreenArtNeverAsksForTheOriginal() {
        assertEquals("https://image.tmdb.org/t/p/w1280/abc.jpg", sizedImageUrl(original, 1920))
        assertEquals("https://image.tmdb.org/t/p/w1280/abc.jpg", sizedImageUrl(original, 3840))
    }

    @Test
    fun cardsAskForTheSmallCopy() {
        assertEquals("https://image.tmdb.org/t/p/w780/abc.jpg", sizedImageUrl(original, 496))
    }

    @Test
    fun metahubAsksForTheLargeCopy() {
        assertEquals("https://images.metahub.space/background/large/tt1/img",
            sizedImageUrl("https://images.metahub.space/background/medium/tt1/img", 1920))
    }
}
