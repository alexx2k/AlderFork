package dev.alder

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TranslationTest {

    private fun cinemeta(name: String) = JSONObject().put("id", "tt1").put("type", "movie").put("name", name)
        .put("description", "English story").put("poster", "https://metahub/poster.jpg").put("logo", "https://metahub/logo.png")
        .put("genres", JSONArray(listOf("Drama")))

    private fun logos(vararg paths: String) = JSONObject().put("logos", JSONArray(paths.map { JSONObject().put("file_path", it) }))

    @Test
    fun translatesNameDescriptionPosterAndGenres() {
        val json = cinemeta("The Intouchables")
        applyTranslation(json, JSONObject().put("title", "Intouchables").put("original_title", "Intouchables")
            .put("original_language", "fr").put("overview", "Histoire").put("poster_path", "/fr.jpg")
            .put("genres", JSONArray().put(JSONObject().put("name", "Drame"))).put("images", logos("/logo-fr.png")), "fr-FR")

        val meta = Meta(json)
        assertEquals("Intouchables", meta.name)
        assertEquals("Histoire", meta.description)
        assertEquals("https://image.tmdb.org/t/p/w342/fr.jpg", meta.poster)
        assertEquals("https://image.tmdb.org/t/p/w500/logo-fr.png", meta.logo)
        assertEquals(listOf("Drame"), meta.genres)
    }

    @Test
    fun dropsTheEnglishLogoWhenTheNameChangesWithoutALogoInTheLanguage() {
        val json = cinemeta("Spirited Away")
        applyTranslation(json, JSONObject().put("title", "Le Voyage de Chihiro").put("original_title", "千と千尋の神隠し")
            .put("original_language", "ja").put("images", logos()), "fr-FR")
        assertEquals("Le Voyage de Chihiro", json.getString("name"))
        assertFalse(json.has("logo"))
    }

    @Test
    fun keepsEnglishWhenTmdbOnlyHasTheOriginalTitle() {
        val json = cinemeta("Parasite")
        applyTranslation(json, JSONObject().put("title", "기생충").put("original_title", "기생충")
            .put("original_language", "ko").put("overview", ""), "fr-FR")
        assertEquals("Parasite", json.getString("name"))
        assertEquals("https://metahub/logo.png", json.getString("logo"))
        assertEquals("English story", json.getString("description"))
    }

    @Test
    fun translatesShowNames() {
        val json = cinemeta("Money Heist").put("type", "series")
        applyTranslation(json, JSONObject().put("name", "La casa de papel").put("original_name", "La casa de papel")
            .put("original_language", "es"), "es-ES")
        assertEquals("La casa de papel", json.getString("name"))
    }

    private fun episode(season: Int, number: Int, name: String) =
        JSONObject().put("id", "tt1:$season:$number").put("season", season).put("episode", number).put("name", name).put("overview", "English")

    private fun season(vararg names: String) = JSONObject().put("episodes",
        JSONArray(names.mapIndexed { i, n -> JSONObject().put("episode_number", i + 1).put("name", n).put("overview", if (i == 0) "Résumé" else "") }))

    @Test
    fun translatesEpisodesKeepingEnglishWhereTmdbHasNone() {
        val videos = listOf(episode(1, 1, "Pilot"), episode(1, 2, "Cat's in the Bag"), episode(2, 1, "Seven Thirty-Seven"))
        applyEpisodes(videos, 1, season("Chute libre", "Épisode 2"))

        assertEquals("Chute libre", videos[0].getString("name"))
        assertEquals("Résumé", videos[0].getString("overview"))
        assertEquals("Cat's in the Bag", videos[1].getString("name")) // TMDB's placeholder name
        assertEquals("English", videos[1].getString("overview"))
        assertEquals("Seven Thirty-Seven", videos[2].getString("name")) // another season
    }

    @Test
    fun leavesASeasonNumberedDifferentlyAlone() {
        val videos = listOf(episode(1, 1, "Pilot"), episode(1, 2, "Second"))
        applyEpisodes(videos, 1, season("Un", "Deux", "Trois"))
        assertTrue(videos.map { it.getString("name") } == listOf("Pilot", "Second"))
    }
}
