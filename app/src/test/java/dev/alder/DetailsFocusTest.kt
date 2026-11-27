package dev.alder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DetailsFocusTest {

    @Test
    fun shouldIncludeResumeAtExtraOnlyWhenPositiveAndNotStartOver() {
        assertFalse(shouldIncludeResumeAtExtra(resumeAt = 0L, startOver = false))
        assertFalse(shouldIncludeResumeAtExtra(resumeAt = -1L, startOver = false))
        assertFalse(shouldIncludeResumeAtExtra(resumeAt = 120_000L, startOver = true))
        assertTrue(shouldIncludeResumeAtExtra(resumeAt = 120_000L, startOver = false))
    }

    @Test
    fun shouldShowHeroFalseWhenAnyOverlayIsOpen() {
        assertTrue(shouldShowHero(DetailsOverlayState()))
        assertFalse(shouldShowHero(DetailsOverlayState(guideOpen = true)))
        assertFalse(shouldShowHero(DetailsOverlayState(infoOpen = true)))
        assertFalse(shouldShowHero(DetailsOverlayState(similarOpen = true)))
        assertFalse(shouldShowHero(DetailsOverlayState(filmographyOpen = true)))
        assertFalse(shouldShowHero(DetailsOverlayState(infoOpen = true, filmographyOpen = true)))
    }

    @Test
    fun restartClosesInfoOnlyWhenFilmographyIsNotOpen() {
        assertFalse(shouldCloseInfoOnRestart(infoOpen = false, filmographyOpen = false))
        assertFalse(shouldCloseInfoOnRestart(infoOpen = false, filmographyOpen = true))
        assertTrue(shouldCloseInfoOnRestart(infoOpen = true, filmographyOpen = false))
        assertFalse(shouldCloseInfoOnRestart(infoOpen = true, filmographyOpen = true))
    }

    @Test
    fun richCastRefreshesInfoOnlyWhenFilmographyIsNotOpen() {
        assertFalse(shouldRefreshInfoOnCastLoad(infoOpen = false, filmographyOpen = false))
        assertTrue(shouldRefreshInfoOnCastLoad(infoOpen = true, filmographyOpen = false))
        assertFalse(shouldRefreshInfoOnCastLoad(infoOpen = true, filmographyOpen = true))
    }

    @Test
    fun resolveHeroFocusTargetPreservesButtonAndCastFocus() {
        assertEquals(
            HeroFocusState(HeroControlFocus.LIST),
            resolveHeroFocusTarget(HeroFocusState(HeroControlFocus.LIST), hasTrailer = false, hasStartOver = false, castCount = 0),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.INFO),
            resolveHeroFocusTarget(HeroFocusState(HeroControlFocus.INFO), hasTrailer = false, hasStartOver = false, castCount = 0),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.TRAILER),
            resolveHeroFocusTarget(HeroFocusState(HeroControlFocus.TRAILER), hasTrailer = true, hasStartOver = false, castCount = 0),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.PLAY),
            resolveHeroFocusTarget(HeroFocusState(HeroControlFocus.TRAILER), hasTrailer = false, hasStartOver = false, castCount = 0),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.START_OVER),
            resolveHeroFocusTarget(HeroFocusState(HeroControlFocus.START_OVER), hasTrailer = false, hasStartOver = true, castCount = 0),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.PLAY),
            resolveHeroFocusTarget(HeroFocusState(HeroControlFocus.START_OVER), hasTrailer = false, hasStartOver = false, castCount = 0),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.CAST, 1),
            resolveHeroFocusTarget(HeroFocusState(HeroControlFocus.CAST, 1), hasTrailer = false, hasStartOver = false, castCount = 4),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.CAST, 2),
            resolveHeroFocusTarget(HeroFocusState(HeroControlFocus.CAST, 5), hasTrailer = false, hasStartOver = false, castCount = 3),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.PLAY),
            resolveHeroFocusTarget(HeroFocusState(HeroControlFocus.CAST, 0), hasTrailer = false, hasStartOver = false, castCount = 0),
        )
    }

    @Test
    fun resolveFilmographyReturnTargetFallsBackWhenActorDetached() {
        assertEquals(
            FilmographyReturnTarget.LAST_FOCUSED_ACTOR,
            resolveFilmographyReturnTarget(actorAttached = true, infoOpen = false),
        )
        assertEquals(
            FilmographyReturnTarget.LAST_FOCUSED_ACTOR,
            resolveFilmographyReturnTarget(actorAttached = true, infoOpen = true),
        )
        assertEquals(
            FilmographyReturnTarget.INFO_OVERLAY,
            resolveFilmographyReturnTarget(actorAttached = false, infoOpen = true),
        )
        assertEquals(
            FilmographyReturnTarget.PLAY_BUTTON,
            resolveFilmographyReturnTarget(actorAttached = false, infoOpen = false),
        )
    }

    @Test
    fun shouldRefreshHeroOnOverlayCloseOnlyWhenDirtyAndNoOverlayRemainsOpen() {
        assertFalse(shouldRefreshHeroOnOverlayClose(heroNeedsRefresh = false, DetailsOverlayState()))
        assertTrue(shouldRefreshHeroOnOverlayClose(heroNeedsRefresh = true, DetailsOverlayState()))
        assertFalse(shouldRefreshHeroOnOverlayClose(heroNeedsRefresh = true, DetailsOverlayState(guideOpen = true)))
        assertFalse(shouldRefreshHeroOnOverlayClose(heroNeedsRefresh = true, DetailsOverlayState(infoOpen = true)))
        assertFalse(shouldRefreshHeroOnOverlayClose(heroNeedsRefresh = true, DetailsOverlayState(similarOpen = true)))
        assertFalse(shouldRefreshHeroOnOverlayClose(heroNeedsRefresh = true, DetailsOverlayState(filmographyOpen = true)))
        assertFalse(shouldRefreshHeroOnOverlayClose(heroNeedsRefresh = true, DetailsOverlayState(infoOpen = true, filmographyOpen = true)))
    }

    @Test
    fun resolveFilmographyHeroFocusPreservesAttachedCastChipOrFallsBackToPlay() {
        assertEquals(
            HeroFocusState(HeroControlFocus.CAST, 2),
            resolveFilmographyHeroFocus(actorAttached = true, castIndex = 2),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.PLAY),
            resolveFilmographyHeroFocus(actorAttached = false, castIndex = 2),
        )
        assertEquals(
            HeroFocusState(HeroControlFocus.PLAY),
            resolveFilmographyHeroFocus(actorAttached = true, castIndex = -1),
        )
    }
}
