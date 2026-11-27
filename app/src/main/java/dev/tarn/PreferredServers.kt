package dev.tarn

import android.content.Context

/**
 * A viewer's explicit source-add-on choice for a series. This remembers the provider, never
 * the video URL or debrid token: a fresh source is resolved for every episode.
 *
 * Scoped by local profile ID (not the shared Stremio login) and series metadata ID.
 */
internal object PreferredServers {
    private const val STORE = "preferredServers"

    private fun key(profileId: String, metaId: String) = "$profileId:$metaId"

    fun get(context: Context, profileId: String, metaId: String): String? =
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
            .getString(key(profileId, metaId), null)?.takeIf { it.isNotBlank() }

    fun remember(context: Context, profileId: String, metaId: String, providerId: String) {
        if (profileId.isBlank() || metaId.isBlank() || providerId.isBlank()) return
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
            .edit().putString(key(profileId, metaId), providerId).apply()
    }

    fun forgetProfile(context: Context, profileId: String) {
        val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
        val edit = prefs.edit()
        prefs.all.keys.filter { it.startsWith("$profileId:") }.forEach { edit.remove(it) }
        edit.apply()
    }

    /** Movies do not have subsequent episodes, so they never acquire a preferred provider. */
    fun forEpisode(context: Context, profileId: String?, metaId: String?, videoId: String): String? =
        if (profileId.isNullOrBlank() || metaId.isNullOrBlank() || metaId == videoId) null
        else get(context, profileId, metaId)
}
