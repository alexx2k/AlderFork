package dev.tarn

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/**
 * Keeps viewing history and My List independent of the Stremio streaming credentials.
 * Always pass the profile captured when the screen started; don't look up the active
 * profile inside background work that could outlive a profile switch.
 */
internal object ProfileLibrary {
    fun library(
        context: Context,
        profile: Profile,
        ids: List<String> = emptyList()
    ): List<JSONObject> = when (profile.libraryMode) {
        LibraryMode.STREMIO -> Stremio.library(profile.authKey, ids)
        LibraryMode.LOCAL -> LocalLibrary.library(context, profile.id, ids)
    }

    /** Local storage is already on disk, so its saved library is always available. */
    fun savedLibrary(context: Context, profile: Profile): List<JSONObject>? =
        when (profile.libraryMode) {
            LibraryMode.STREMIO -> Stremio.savedLibrary(profile.authKey)
            LibraryMode.LOCAL -> LocalLibrary.library(context, profile.id)
        }

    fun saveLibrary(context: Context, profile: Profile, items: List<JSONObject>) {
        when (profile.libraryMode) {
            LibraryMode.STREMIO -> Stremio.saveLibrary(profile.authKey, items)
            LibraryMode.LOCAL -> LocalLibrary.saveLibrary(context, profile.id, items)
        }
    }

    fun editLibrary(
        context: Context,
        profile: Profile,
        id: String,
        fallback: JSONObject,
        listDates: SharedPreferences? = null,
        change: (JSONObject) -> Unit
    ): JSONObject = when (profile.libraryMode) {
        LibraryMode.STREMIO -> Stremio.editLibrary(profile.authKey, id, fallback, listDates, change)
        LibraryMode.LOCAL -> {
            var wasInList = false
            LocalLibrary.editLibrary(context, profile.id, id, fallback) { entry ->
                wasInList = Library.inList(entry)
                change(entry)
            }.also { entry ->
                if (listDates != null && (!wasInList || !Library.inList(entry))) Library.recordListDate(listDates, entry)
            }
        }
    }

    /** A local checkpoint must never be added to Stremio's pending upload queue. */
    fun keepProgress(
        context: Context,
        profile: Profile,
        snapshot: JSONObject,
        provisional: Boolean
    ) {
        when (profile.libraryMode) {
            LibraryMode.STREMIO -> ProgressSaves.keep(profile.authKey, snapshot, provisional)
            LibraryMode.LOCAL -> {
                val id = snapshot.getString("_id")
                val previous = LocalLibrary.item(context, profile.id, id)
                if (previous == null || snapshot.optString("_mtime") >= previous.optString("_mtime")) {
                    LocalLibrary.saveLibrary(context, profile.id, listOf(JSONObject(snapshot.toString())))
                }
            }
        }
    }

    /** Local libraries do not sync progress to the shared Stremio account. */
    fun syncProgress(profile: Profile): Failure? =
        when (profile.libraryMode) {
            LibraryMode.STREMIO -> syncWatchProgress(profile.authKey)
            LibraryMode.LOCAL -> null
        }
}
