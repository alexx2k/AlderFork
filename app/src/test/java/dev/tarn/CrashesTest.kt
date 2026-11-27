package dev.tarn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CrashesTest {
    @Test fun addressesKeepOnlyTheirHost() {
        val out = Crashes.redact("failed: https://aiostreams.example.com/eyJhbGciOi/stream/movie/tt1.json?key=abc")
        assertEquals("failed: https://aiostreams.example.com/…", out)
    }

    @Test fun userinfoTokensAreStrippedFromAddresses() {
        val out = Crashes.redact(
            "failed: https://secret-token@aiostreams.example.com/stream and " +
                "https://user:pass123@proxy.example.com:8443/path?x=1"
        )
        assertEquals("failed: https://aiostreams.example.com/… and https://proxy.example.com/…", out)
        assertFalse(out.contains("secret-token"))
        assertFalse(out.contains("pass123"))
    }

    @Test fun keysGoAndClassNamesStay() {
        val out = Crashes.redact("token 9f8e7d6c5b4a39281706f5e4d3c2b1a0 at dev.tarn.PlayerActivity.onCreate(PlayerActivity.kt:235)\n" +
            "java.lang.IllegalStateException: ExoPlaybackExceptionWrapper")
        assertFalse(out.contains("9f8e7d6c5b4a"))
        assertTrue(out.contains("dev.tarn.PlayerActivity.onCreate(PlayerActivity.kt:235)"))
        assertTrue(out.contains("ExoPlaybackExceptionWrapper"))
    }

    @Test fun traceHasTheCauseAndStaysShort() {
        val error = RuntimeException("outer", IllegalArgumentException("inner"))
        val out = Crashes.trace(error)
        assertTrue(out.contains("Caused by: java.lang.IllegalArgumentException: inner"))
        assertTrue(out.length <= 6_000)
    }
}
