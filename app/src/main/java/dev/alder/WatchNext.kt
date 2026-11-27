package dev.alder

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.tv.TvContract.WatchNextPrograms
import android.media.tv.TvContract
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/**
 * Continue Watching on the Google TV home ("Watch Next"), through Android's own TV provider: our rows are replaced
 * with the active profile's list each time Home shows a changed one. A profile with a PIN puts nothing there, since
 * the home screen would show its titles to anyone. Picking one opens the app on that title's page.
 */
object WatchNext {
    private const val MAX = 10
    private const val ART_PX = 1280 // the launcher's cards are a few hundred px wide; TMDB's 4K original is wasted there

    internal val LOGO_RES = R.drawable.logo_transparent
    private val generation = AtomicLong(0L)
    private val writeLock = Any()
    private var lastSyncedGeneration = -1L

    internal fun logoUri(packageName: String, entryName: String = "logo_transparent"): String =
        "android.resource://$packageName/drawable/$entryName"

    /** Advances the generation so any queued or in-flight sync aborts before modifying Watch Next; never blocks on the write lock. */
    fun invalidate() {
        generation.incrementAndGet()
    }

    internal fun currentGeneration(): Long = generation.get()

    internal fun isGenerationStale(expectedGeneration: Long): Boolean = generation.get() != expectedGeneration

    internal fun isProfileStale(active: Profile?, authKey: String, locked: Boolean, expectedGeneration: Long): Boolean =
        isGenerationStale(expectedGeneration) || active?.authKey != authKey || (!locked && active.pin != null)

    fun clear(context: Context) = clearRows(context, expectedGeneration = null)

    internal fun clearIfCurrent(context: Context, expectedGeneration: Long) = clearRows(context, expectedGeneration)

    private fun clearRows(context: Context, expectedGeneration: Long?) = clearRows(expectedGeneration) {
        if (android.os.Build.VERSION.SDK_INT >= 26) deleteRows(context.contentResolver)
    }

    internal fun clearRows(expectedGeneration: Long? = null, deleteExisting: () -> Unit) = synchronized(writeLock) {
        runCatching {
            // A newer profile switch supersedes this clear, and a completed sync for the same generation already replaced Watch Next.
            if (expectedGeneration != null && (isGenerationStale(expectedGeneration) || lastSyncedGeneration == expectedGeneration)) {
                return@runCatching
            }
            deleteExisting()
        }.onFailure { android.util.Log.w("Alder", "Watch Next not cleared", it) }
    }

    fun sync(context: Context, authKey: String, items: List<JSONObject>, locked: Boolean) =
        sync(context, authKey, items, locked, generation.get())

    fun sync(context: Context, authKey: String, items: List<JSONObject>, locked: Boolean, expectedGeneration: Long) = runCatching {
        if (android.os.Build.VERSION.SDK_INT < 26) return@runCatching
        val resolver = context.contentResolver
        syncRows(
            items = items,
            locked = locked,
            expectedGeneration = expectedGeneration,
            isStale = { isProfileStale(Profiles.active(context), authKey, locked, expectedGeneration) },
            resolveBackdrop = { backdrop(authKey, it) },
            deleteExisting = { deleteRows(resolver) },
            insertRows = { entries ->
                val logoUri = logoUri(context.packageName, context.resources.getResourceEntryName(LOGO_RES))
                entries.forEach { (item, resolvedBackdrop) ->
                    val state = item.optJSONObject("state") ?: JSONObject()
                    // A series' video id is "tt123:1:3": season, then episode. Other types (anime) count as one when theirs is.
                    val numbers = episodeNumbers(state.text("video_id"))
                    val series = item.optString("type").let { it == "series" || it != "movie" && numbers != null }
                    // Wide, cinematic art for the launcher's wide cards: the meta addon's backdrop (TMDB's, from AIOMetadata or
                    // Cinemeta; last time's answer from disk when there is one), else the library's own, else MetaHub's for the
                    // IMDb id. A poster sent as the art gets cropped to a strip of its middle by the launcher.
                    val art = (resolvedBackdrop ?: item.text("background") ?: Images.backgroundFor(item.optString("_id")))
                        ?.let { Images.sized(it, ART_PX) }
                    val poster = item.text("poster")?.let(Images::sharp)
                    val open = Intent(context, ProfilesActivity::class.java)
                        .putExtra("type", item.optString("type")).putExtra("id", item.optString("_id"))
                        .putExtra("name", item.optString("name")).putExtra("poster", poster)
                        .putExtra("background", art).putExtra("videoId", state.text("video_id"))
                    resolver.insert(WatchNextPrograms.CONTENT_URI, ContentValues().apply {
                        put(WatchNextPrograms.COLUMN_TYPE, if (series) WatchNextPrograms.TYPE_TV_EPISODE else WatchNextPrograms.TYPE_MOVIE)
                        put(WatchNextPrograms.COLUMN_WATCH_NEXT_TYPE, WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
                        put(WatchNextPrograms.COLUMN_TITLE, item.optString("name"))
                        if (series && numbers != null) {
                            put(WatchNextPrograms.COLUMN_SEASON_DISPLAY_NUMBER, numbers.first.toString())
                            put(WatchNextPrograms.COLUMN_EPISODE_DISPLAY_NUMBER, numbers.second.toString())
                        }
                        put(WatchNextPrograms.COLUMN_POSTER_ART_URI, art ?: poster)
                        put(WatchNextPrograms.COLUMN_POSTER_ART_ASPECT_RATIO,
                            if (art != null) WatchNextPrograms.ASPECT_RATIO_16_9 else WatchNextPrograms.ASPECT_RATIO_2_3)
                        put(WatchNextPrograms.COLUMN_LAST_PLAYBACK_POSITION_MILLIS, state.optLong("timeOffset").toInt())
                        put(WatchNextPrograms.COLUMN_DURATION_MILLIS, state.optLong("duration").toInt())
                        put(WatchNextPrograms.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS, lastWatched(state))
                        put(WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID, item.optString("_id"))
                        put(WatchNextPrograms.COLUMN_INTENT_URI, open.toUri(Intent.URI_INTENT_SCHEME))
                        put(WatchNextPrograms.COLUMN_LOGO_URI, logoUri)
                    })
                }
            },
        )
    }.onFailure { android.util.Log.w("Alder", "Watch Next not updated", it) }

    private fun deleteRows(resolver: ContentResolver) {
        if (android.os.Build.VERSION.SDK_INT < 26) return
        resolver.query(TvContract.WatchNextPrograms.CONTENT_URI, arrayOf(WatchNextPrograms._ID), null, null, null)?.use { c ->
            while (c.moveToNext()) resolver.delete(TvContract.buildWatchNextProgramUri(c.getLong(0)), null, null)
        }
    }

    internal fun syncRows(
        items: List<JSONObject>,
        locked: Boolean,
        isStale: () -> Boolean = { false },
        resolveBackdrop: (JSONObject) -> String?,
        deleteExisting: () -> Unit,
        insertRows: (List<Pair<JSONObject, String?>>) -> Unit,
        expectedGeneration: Long? = null,
    ) {
        if (isStale()) return
        val resolved = if (locked) emptyList() else items.take(MAX).map { item ->
            if (isStale()) return
            item to resolveBackdrop(item)
        }
        synchronized(writeLock) {
            if (isStale()) return
            deleteExisting()
            if (!locked && resolved.isNotEmpty()) insertRows(resolved)
            if (expectedGeneration != null) lastSyncedGeneration = expectedGeneration
        }
    }

    private fun backdrop(authKey: String, item: JSONObject): String? = runCatching {
        val type = item.optString("type")
        val id = item.optString("_id")
        Stremio.addons(authKey).let { it.savedMeta(type, id) ?: it.meta(type, id) }?.background
    }.getOrNull()

    fun parseIsoTimestamp(raw: String): Long = runCatching {
        if (raw.isBlank()) return@runCatching System.currentTimeMillis()
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            java.time.Instant.parse(raw).toEpochMilli()
        } else {
            val clean = if (raw.contains('.')) raw.substringBefore('.') + "Z" else raw
            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.parse(clean)!!.time
        }
    }.getOrDefault(System.currentTimeMillis())

    internal fun lastWatched(state: JSONObject): Long =
        parseIsoTimestamp(state.optString("lastWatched"))
}
