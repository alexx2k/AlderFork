package dev.tarn

import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackAudioTest {
    @Test fun supportsExactLosslessEncodingAndRejectsDtsCore() {
        val trueHd = format(MimeTypes.AUDIO_TRUEHD)
        val dtsHd = format(MimeTypes.AUDIO_DTS_HD)
        assertTrue(canPassAudio(trueHd, false, C.ENCODING_DOLBY_TRUEHD))
        assertTrue(canPassAudio(dtsHd, false, C.ENCODING_DTS_HD))
        assertFalse(canPassAudio(dtsHd, false, C.ENCODING_DTS))
        assertFalse(canPassAudio(trueHd, false, null))
        assertFalse(canPassAudio(trueHd, true, C.ENCODING_DOLBY_TRUEHD))
        assertTrue(canPassAudio(format(MimeTypes.AUDIO_RAW), true, C.ENCODING_PCM_16BIT))
        assertNull(losslessEncoding(format(MimeTypes.AUDIO_DTS_EXPRESS)))
    }

    @Test fun losslessPreferenceRespectsCommentaryAndFailedTracks() {
        val lossless = format(MimeTypes.AUDIO_TRUEHD)
        val default = format(MimeTypes.AUDIO_AC3).buildUpon().setSelectionFlags(C.SELECTION_FLAG_DEFAULT).build()
        val commentary = lossless.buildUpon().setLabel("Commentary").build()
        val formats = listOf(commentary, default, lossless)
        val supportsLossless: (Format) -> Boolean = { losslessEncoding(it) != null }

        assertEquals(lossless, bestAudioFormat(formats, "en", emptySet(), hasLosslessOutput = supportsLossless))
        assertEquals(default, bestAudioFormat(formats, "en", emptySet()) { false })
        assertEquals(default, bestAudioFormat(formats, "en", setOf(lossless), hasLosslessOutput = supportsLossless))
    }

    @Test fun requiredAudioRejectsHindiWhenPolishIsMissingOrFails() {
        // Media3's builder normalizes languages through Android TextUtils, which is stubbed in JVM tests.
        val language = Format::class.java.getField("language").apply { isAccessible = true }
        val hindi = format(MimeTypes.AUDIO_AC3).buildUpon().setSelectionFlags(C.SELECTION_FLAG_DEFAULT).build()
            .also { language.set(it, "hi") }
        val polish = format(MimeTypes.AUDIO_AC3).also { language.set(it, "pol") }
        val untagged = format(MimeTypes.AUDIO_AC3)
        val formats = listOf(hindi, polish, untagged)

        assertEquals(polish, bestAudioFormat(formats, "pl", emptySet(), requireLanguage = true) { false })
        assertNull(bestAudioFormat(formats, "pl", setOf(polish), requireLanguage = true) { false })
        assertNull(bestAudioFormat(listOf(hindi, untagged), "pl", emptySet(), requireLanguage = true) { false })
        assertEquals(hindi, bestAudioFormat(formats, "pl", setOf(polish)) { false })
    }

    @Test fun onlyAudioOutputErrorsTriggerPcmRecovery() {
        assertTrue(audioOutputFailure(PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED))
        assertTrue(audioOutputFailure(PlaybackException.ERROR_CODE_AUDIO_TRACK_WRITE_FAILED))
        assertFalse(audioOutputFailure(PlaybackException.ERROR_CODE_DECODING_FAILED))
        assertFalse(audioOutputFailure(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED))
        assertTrue(shouldRetryWithPcm(false, true, MimeTypes.AUDIO_TRUEHD))
        assertTrue(shouldRetryWithPcm(false, true, null))
        assertFalse(shouldRetryWithPcm(false, true, MimeTypes.AUDIO_RAW))
        assertFalse(shouldRetryWithPcm(true, true, MimeTypes.AUDIO_TRUEHD))
    }

    private fun format(mime: String) = Format.Builder().setSampleMimeType(mime).setChannelCount(6).build()

    @Test fun speedsLabelPlainly() {
        assertEquals(listOf("0.75×", "1×", "1.25×", "1.5×", "1.75×", "2×"), SPEEDS.map(::speedLabel))
    }

    @Test fun pauseCheckpointCommitsInOrderAndSkipsDuplicates() {
        val item = Library.newItem("tt1", "series", "Show", null)
        val events = mutableListOf<String>()
        val pushed = mutableListOf<JSONObject>()
        val checkpoint = PlaybackCheckpoint()

        val firstPause = checkpoint.commitOnPause(eligible = true) {
            commitStopCheckpoint(
                record = {
                    events += "record"
                    Library.record(item, "tt1:1:1", positionMs = 950_000L, durationMs = 1_000_000L, playedMs = 10_000L)
                    item
                },
                nextVideoId = "tt1:1:2",
                stop = { snapshot, nextId ->
                    events += "stopped"
                    Library.stopped(snapshot, nextId)
                },
                push = { snapshot ->
                    events += "push"
                    pushed += snapshot
                },
            )
        }

        assertTrue(firstPause)
        assertEquals(listOf("record", "stopped", "push"), events)
        assertEquals(1, pushed.size)
        assertEquals("tt1:1:2", pushed[0].state.getString("video_id"))
        assertEquals(1L, pushed[0].state.getLong("timeOffset"))
        // Original active item stays on the current episode so resuming playback keeps tracking it.
        assertEquals("tt1:1:1", item.state.getString("video_id"))

        // Duplicate onPause / onStop before resuming must not commit again.
        assertFalse(checkpoint.commitOnPause(eligible = true) { events += "dup" })
        assertEquals(listOf("record", "stopped", "push"), events)

        // Returning to foreground while not finishing re-arms pause commits; finishing does not.
        checkpoint.onResume(finishing = true)
        assertFalse(checkpoint.commitOnPause(eligible = true) { events += "finishing" })
        checkpoint.onResume(finishing = false)
        assertTrue(checkpoint.commitOnPause(eligible = true) { events += "second-pause" })
        assertEquals(listOf("record", "stopped", "push", "second-pause"), events)
    }

    @Test fun externalPlayerCommitsOnceAndSkipsPauseAndFinishingLifecycle() {
        val checkpoint = PlaybackCheckpoint()
        val events = mutableListOf<String>()

        checkpoint.onHandOffStarted()
        assertTrue(checkpoint.handedOff)
        // Backgrounding while external player runs must not commit.
        assertFalse(checkpoint.commitOnPause(eligible = true) { events += "pause-during-handoff" })

        assertTrue(checkpoint.commitExternal(eligible = true) { events += "external-push" })
        assertFalse(checkpoint.commitExternal(eligible = true) { events += "duplicate-external" })

        // Subsequent lifecycle callbacks during finish() must never push again.
        checkpoint.onResume(finishing = true)
        checkpoint.onResume(finishing = false)
        assertFalse(checkpoint.commitOnPause(eligible = true) { events += "pause-after-external" })
        assertEquals(listOf("external-push"), events)

        // Cancelled handoff (no external player installed) restores internal pause commits.
        val fallbackCheckpoint = PlaybackCheckpoint()
        fallbackCheckpoint.onHandOffStarted()
        fallbackCheckpoint.onHandOffCancelled()
        assertFalse(fallbackCheckpoint.handedOff)
        assertTrue(fallbackCheckpoint.commitOnPause(eligible = true) { events += "internal-pause" })
        assertEquals(listOf("external-push", "internal-pause"), events)
    }

    @Test fun selectedSubtitleTrackIndexMatchesAddonSubtitleByUrlAndFallsBackSafely() {
        val urlA = "https://subs.example/en.srt"
        val urlB = "https://subs.example/es.srt"
        val firstInstance = Subtitle(urlB, "spa", "OpenSubtitles")
        val refreshedCopy = Subtitle(urlB, "spa", "OpenSubtitles")
        val addonList = listOf(Subtitle(urlA, "eng", "OpenSubtitles"), refreshedCopy)

        assertEquals(0, selectedSubtitleTrackIndex(disabled = true, addonSelected = true, embeddedCount = 2, embeddedSelectedIndex = 0, addonSubUrls = addonList.map { it.url }, chosenSubUrl = firstInstance.url))
        assertEquals(4, selectedSubtitleTrackIndex(disabled = false, addonSelected = true, embeddedCount = 2, embeddedSelectedIndex = -1, addonSubUrls = addonList.map { it.url }, chosenSubUrl = firstInstance.url))
        assertEquals(-1, selectedSubtitleTrackIndex(disabled = false, addonSelected = true, embeddedCount = 2, embeddedSelectedIndex = -1, addonSubUrls = listOf(urlA), chosenSubUrl = firstInstance.url))
        assertEquals(2, selectedSubtitleTrackIndex(disabled = false, addonSelected = false, embeddedCount = 2, embeddedSelectedIndex = 1, addonSubUrls = addonList.map { it.url }, chosenSubUrl = firstInstance.url))
    }

    @Test fun speedIsUnavailableOnLiveAndTrailersAndSafeOnUnseekableStreams() {
        assertTrue(isSpeedAvailable(isTrailer = false, isLive = false))
        assertFalse(isSpeedAvailable(isTrailer = true, isLive = false))
        assertFalse(isSpeedAvailable(isTrailer = false, isLive = true))

        assertTrue(shouldSeekOnAudioRetry(isLive = false, seekable = true))
        assertFalse(shouldSeekOnAudioRetry(isLive = false, seekable = false))
        assertFalse(shouldSeekOnAudioRetry(isLive = true, seekable = true))

        assertEquals(
            SpeedChangeAction.UNAVAILABLE,
            resolveSpeedChange(isTrailer = false, isLive = true, seekable = true, currentSpeed = 1f, targetSpeed = 1.5f, passthroughOut = false, trackPassesAudio = false)
        )
        assertEquals(
            SpeedChangeAction.UNAVAILABLE,
            resolveSpeedChange(isTrailer = true, isLive = false, seekable = true, currentSpeed = 1f, targetSpeed = 1.5f, passthroughOut = false, trackPassesAudio = false)
        )
        assertEquals(
            SpeedChangeAction.REOPEN_AUDIO_AND_APPLY,
            resolveSpeedChange(isTrailer = false, isLive = false, seekable = true, currentSpeed = 1f, targetSpeed = 1.5f, passthroughOut = true, trackPassesAudio = true)
        )
        assertEquals(
            SpeedChangeAction.BLOCKED_UNSEEKABLE_PASSTHROUGH,
            resolveSpeedChange(isTrailer = false, isLive = false, seekable = false, currentSpeed = 1f, targetSpeed = 1.5f, passthroughOut = true, trackPassesAudio = true)
        )
        assertEquals(
            SpeedChangeAction.APPLY_IN_PLACE,
            resolveSpeedChange(isTrailer = false, isLive = false, seekable = false, currentSpeed = 1f, targetSpeed = 1.5f, passthroughOut = false, trackPassesAudio = false)
        )
        assertEquals(
            SpeedChangeAction.APPLY_IN_PLACE,
            resolveSpeedChange(isTrailer = false, isLive = false, seekable = false, currentSpeed = 1.5f, targetSpeed = 1f, passthroughOut = false, trackPassesAudio = true)
        )
        assertEquals(
            SpeedChangeAction.REOPEN_AUDIO_AND_APPLY,
            resolveSpeedChange(isTrailer = false, isLive = false, seekable = true, currentSpeed = 1.5f, targetSpeed = 1f, passthroughOut = false, trackPassesAudio = true)
        )
    }

    @Test fun resumeOnReturnRestoresOnlyWhenPlayingAndNotPausedOrHandedOffOrFinishing() {
        val playing = PlaybackCheckpoint()
        playing.captureResumeOnPause(playWhenReady = true, finishing = false)
        assertTrue(playing.resumeOnReturn)
        assertTrue(playing.consumeResumeOnReturn(finishing = false, destroyed = false, prepared = true))
        assertFalse(playing.resumeOnReturn)
        assertFalse(playing.consumeResumeOnReturn(finishing = false, destroyed = false, prepared = true))

        val userPaused = PlaybackCheckpoint()
        userPaused.captureResumeOnPause(playWhenReady = false, finishing = false)
        assertFalse(userPaused.resumeOnReturn)
        assertFalse(userPaused.consumeResumeOnReturn(finishing = false, destroyed = false, prepared = true))

        val handedOff = PlaybackCheckpoint()
        handedOff.onHandOffStarted()
        handedOff.captureResumeOnPause(playWhenReady = true, finishing = false)
        assertFalse(handedOff.resumeOnReturn)
        assertFalse(handedOff.consumeResumeOnReturn(finishing = false, destroyed = false, prepared = true))

        val finishingOnPause = PlaybackCheckpoint()
        finishingOnPause.captureResumeOnPause(playWhenReady = true, finishing = true)
        assertFalse(finishingOnPause.resumeOnReturn)
        assertFalse(finishingOnPause.consumeResumeOnReturn(finishing = false, destroyed = false, prepared = true))

        val finishingOnResume = PlaybackCheckpoint()
        finishingOnResume.captureResumeOnPause(playWhenReady = true, finishing = false)
        assertFalse(finishingOnResume.consumeResumeOnReturn(finishing = true, destroyed = false, prepared = true))
        assertFalse(finishingOnResume.resumeOnReturn)

        val destroyedOnResume = PlaybackCheckpoint()
        destroyedOnResume.captureResumeOnPause(playWhenReady = true, finishing = false)
        assertFalse(destroyedOnResume.consumeResumeOnReturn(finishing = false, destroyed = true, prepared = true))
        assertFalse(destroyedOnResume.resumeOnReturn)

        val notPrepared = PlaybackCheckpoint()
        notPrepared.captureResumeOnPause(playWhenReady = true, finishing = false)
        assertFalse(notPrepared.consumeResumeOnReturn(finishing = false, destroyed = false, prepared = false))
        assertFalse(notPrepared.resumeOnReturn)
    }
}
