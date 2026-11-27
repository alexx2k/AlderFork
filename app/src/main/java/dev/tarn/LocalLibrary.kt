package dev.tarn

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

/**
 * Private on-device library for profiles that do not sync
 * watch history or watchlists with Stremio.
 *
 * Each record is isolated by profile ID.
 */
internal object LocalLibrary {

    private const val DB_NAME = "tarn_profiles.db"
    private const val DB_VERSION = 1
    private const val TABLE = "library_items"

    private class Database(context: Context) : SQLiteOpenHelper(
        context.applicationContext,
        DB_NAME,
        null,
        DB_VERSION
    ) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE $TABLE (
                    profile_id TEXT NOT NULL,
                    item_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    PRIMARY KEY (profile_id, item_id)
                )
                """.trimIndent()
            )
        }

        override fun onUpgrade(
            db: SQLiteDatabase,
            oldVersion: Int,
            newVersion: Int
        ) {
            error("Local library migration required: $oldVersion to $newVersion")
        }
    }

    @Volatile
    private var helper: Database? = null

    private fun database(context: Context): Database =
        helper ?: synchronized(this) {
            helper ?: Database(context).also { helper = it }
        }

    /** Fetch an individual library item belonging to a profile. */
    fun item(
        context: Context,
        profileId: String,
        itemId: String
    ): JSONObject? {
        val db = database(context).readableDatabase

        db.query(
            TABLE,
            arrayOf("payload"),
            "profile_id = ? AND item_id = ?",
            arrayOf(profileId, itemId),
            null,
            null,
            null
        ).use { cursor ->
            return if (cursor.moveToFirst()) {
                JSONObject(cursor.getString(0))
            } else null
        }
    }

    /** Fetch a profile's library, optionally filtered by title IDs. */
    fun library(
        context: Context,
        profileId: String,
        ids: List<String> = emptyList()
    ): List<JSONObject> {
        if (ids.isNotEmpty()) {
            return ids.distinct().mapNotNull {
                item(context, profileId, it)
            }
        }

        val result = mutableListOf<JSONObject>()
        val db = database(context).readableDatabase

        db.query(
            TABLE,
            arrayOf("payload"),
            "profile_id = ?",
            arrayOf(profileId),
            null,
            null,
            null
        ).use { cursor ->
            while (cursor.moveToNext()) {
                result.add(JSONObject(cursor.getString(0)))
            }
        }

        return result
    }

    /** Insert or update library items without touching other profiles. */
    @Synchronized
    fun saveLibrary(
        context: Context,
        profileId: String,
        items: List<JSONObject>
    ) {
        if (items.isEmpty()) return

        val db = database(context).writableDatabase
        db.beginTransaction()

        try {
            for (item in items) {
                val id = item.optString("_id")
                require(id.isNotBlank()) {
                    "Cannot save a library item without an ID"
                }

                val values = ContentValues().apply {
                    put("profile_id", profileId)
                    put("item_id", id)
                    put("payload", item.toString())
                }

                check(
                    db.insertWithOnConflict(
                        TABLE,
                        null,
                        values,
                        SQLiteDatabase.CONFLICT_REPLACE
                    ) != -1L
                ) {
                    "Failed to save local library item: $id"
                }
            }

            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    /** Modify an item and persist the result for this profile only. */
    @Synchronized
    fun editLibrary(
        context: Context,
        profileId: String,
        itemId: String,
        fallback: JSONObject,
        change: (JSONObject) -> Unit
    ): JSONObject {
        val entry = item(context, profileId, itemId)
            ?: JSONObject(fallback.toString())

        require(entry.optString("_id") == itemId) {
            "Library item ID mismatch"
        }

        change(entry)
        saveLibrary(context, profileId, listOf(entry))
        return entry
    }

    /** Delete all local library data for a removed profile. */
    @Synchronized
    fun clear(context: Context, profileId: String) {
        database(context).writableDatabase.delete(
            TABLE,
            "profile_id = ?",
            arrayOf(profileId)
        )
    }
}
