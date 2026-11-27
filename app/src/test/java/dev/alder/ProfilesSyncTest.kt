package dev.alder

import android.content.Intent
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProfilesSyncTest {
    @Test
    fun listDateIsPerProfileAndChangesOnlyWithListMembership() {
        val dates = InMemoryPrefs()
        val otherProfile = InMemoryPrefs()
        val title = Library.newItem("tt1", "movie", "Film", null).put("_ctime", "2020-01-01T00:00:00.000Z")
        assertNull(dates.getString("tt1", null))

        Library.setInList(title, true)
        Library.recordListDate(dates, title)
        val added = title.getString("_mtime")
        assertEquals(added, dates.getString("tt1", null))
        assertNull(otherProfile.getString("tt1", null))
        Library.markTitleWatched(title)
        assertEquals(added, dates.getString("tt1", null))

        Library.setInList(title, false)
        Library.recordListDate(dates, title)
        assertNull(dates.getString("tt1", null))
        Library.setInList(title, true)
        Library.recordListDate(dates, title)
        assertEquals(title.getString("_mtime"), dates.getString("tt1", null))
    }

    @Test
    fun newestSeedsBrandNewSavingTitleWhenMissingFromRemoteAndPending() {
        ProgressSaves.init(InMemoryPrefs())
        Stremio.clearSavingForTest()
        try {
            val brandNew = Library.newItem("tt-brand-new", "movie", "New Film", null).apply {
                Library.setInList(this, true)
                put("_mtime", "2026-11-20T10:00:00.000Z")
            }
            Stremio.recordSavingForTest("auth-1", brandNew, System.currentTimeMillis())

            val result = Stremio.newest("auth-1", emptyList(), emptyList())
            assertEquals(listOf("tt-brand-new"), result.map { it.getString("_id") })
            assertTrue(Library.inList(result.single()))
        } finally {
            Stremio.clearSavingForTest()
            ProgressSaves.init(null as SharedPreferences?)
        }
    }

    @Test
    fun newestRespectsIdsFilterAuthKeyScopeAndThirtySecondExpiry() {
        ProgressSaves.init(InMemoryPrefs())
        Stremio.clearSavingForTest()
        try {
            val now = System.currentTimeMillis()
            val active = Library.newItem("tt-active", "movie", "Active", null).apply {
                put("_mtime", "2026-11-20T10:00:00.000Z")
            }
            val inFlight = Library.newItem("tt-inflight", "movie", "In Flight", null).apply {
                put("_mtime", "2026-11-20T10:01:00.000Z")
            }
            val expired = Library.newItem("tt-expired", "movie", "Expired", null).apply {
                put("_mtime", "2026-11-20T10:02:00.000Z")
            }
            val otherProfile = Library.newItem("tt-other", "movie", "Other", null).apply {
                put("_mtime", "2026-11-20T10:03:00.000Z")
            }

            Stremio.recordSavingForTest("auth-1", active, now - 5_000L)
            Stremio.recordSavingForTest("auth-1", inFlight, null)
            Stremio.recordSavingForTest("auth-1", expired, now - 31_000L)
            Stremio.recordSavingForTest("auth-2", otherProfile, now)

            val allForAuth1 = Stremio.newest("auth-1", emptyList(), emptyList()).map { it.getString("_id") }.toSet()
            assertEquals(setOf("tt-active", "tt-inflight"), allForAuth1)

            val filtered = Stremio.newest("auth-1", listOf("tt-inflight", "tt-expired"), emptyList())
            assertEquals(listOf("tt-inflight"), filtered.map { it.getString("_id") })
        } finally {
            Stremio.clearSavingForTest()
            ProgressSaves.init(null as SharedPreferences?)
        }
    }

    @Test
    fun newestMergesProvisionalProgressOntoSeededSavingItemAndRespectsNewerRemote() {
        ProgressSaves.init(InMemoryPrefs())
        Stremio.clearSavingForTest()
        try {
            val savedItem = Library.newItem("tt-seeded", "movie", "Seeded", null).apply {
                Library.setInList(this, true)
                put("_mtime", "2026-11-20T10:00:00.000Z")
            }
            Stremio.recordSavingForTest("auth-1", savedItem, System.currentTimeMillis())

            val offlineCheckpoint = Library.newItem("tt-seeded", "movie", "Seeded", null).apply {
                Library.record(this, "tt-seeded", 45_000L, 120_000L, 45_000L)
                put("_mtime", "2026-11-20T10:05:00.000Z")
            }
            ProgressSaves.keep("auth-1", offlineCheckpoint, provisional = true)

            val remoteNewer = Library.newItem("tt-remote", "movie", "Remote Newer", null).apply {
                Library.record(this, "tt-remote", 90_000L, 120_000L, 90_000L)
                put("_mtime", "2026-11-20T10:10:00.000Z")
            }
            val savingOlder = Library.newItem("tt-remote", "movie", "Remote Newer", null).apply {
                Library.record(this, "tt-remote", 10_000L, 120_000L, 10_000L)
                put("_mtime", "2026-11-20T10:01:00.000Z")
            }
            Stremio.recordSavingForTest("auth-1", savingOlder, System.currentTimeMillis())

            val merged = Stremio.newest("auth-1", emptyList(), listOf(remoteNewer)).associateBy { it.getString("_id") }
            val seededResult = merged.getValue("tt-seeded")
            assertTrue(Library.inList(seededResult))
            assertFalse(seededResult.has("alderProvisional"))
            assertEquals(45_000L, Library.resumeAt(seededResult, "tt-seeded"))

            assertEquals(90_000L, Library.resumeAt(merged.getValue("tt-remote"), "tt-remote"))
        } finally {
            Stremio.clearSavingForTest()
            ProgressSaves.init(null as SharedPreferences?)
        }
    }

    @Test
    fun settingsForgetClearsSubPrefAndPerProfileKeysWithoutAffectingOtherProfiles() {
        val prefs = InMemoryPrefs()
        prefs.edit()
            .putString("subPref@1", "foreign")
            .putString("release@1", "remux")
            .putString("audioFallback@1", "fr")
            .putString("title:tt123@1", """{"audio":"ja"}""")
            .putBoolean("showTab:anime@1", false)
            .putString("subPref@2", "off")
            .putString("audioFallback@2", "")
            .putString("release@2", "web")
            .putInt("maxHeight", 1080)
            .apply()

        Settings.forgetPrefs(prefs, "1")

        assertFalse(prefs.contains("subPref@1"))
        assertFalse(prefs.contains("release@1"))
        assertFalse(prefs.contains("audioFallback@1"))
        assertFalse(prefs.contains("title:tt123@1"))
        assertFalse(prefs.contains("showTab:anime@1"))

        assertEquals("off", prefs.getString("subPref@2", null))
        assertEquals("", prefs.getString("audioFallback@2", null))
        assertEquals("web", prefs.getString("release@2", null))
        assertEquals(1080, prefs.getInt("maxHeight", 0))
    }

    @Test
    fun profilesRemoveClearsHomeSearchSettingsAndAccountKeysBeforeIdReuse() {
        val accountPrefs = InMemoryPrefs()
        val settingsPrefs = InMemoryPrefs()
        val searchPrefs = InMemoryPrefs()
        val homePrefs = InMemoryPrefs()

        val initialProfiles = JSONArray()
            .put(JSONObject().put("id", "1").put("name", "Alice").put("color", Profiles.COLORS[0]).put("authKey", "k1").put("pin", ""))
            .put(JSONObject().put("id", "2").put("name", "Bob").put("color", Profiles.COLORS[1]).put("authKey", "k2").put("pin", ""))
        accountPrefs.edit()
            .putString("profiles", initialProfiles.toString())
            .putString("active", "1")
            .putBoolean("shareStreams:1", true)
            .putBoolean("signedOut:1", true)
            .putBoolean("shareStreams:2", true)
            .putBoolean("signedOut:2", false)
            .apply()
        settingsPrefs.edit()
            .putString("subPref@1", "foreign")
            .putString("subPref@2", "on")
            .apply()
        searchPrefs.edit()
            .putString("recent:1", "matrix")
            .putString("recent:2", "dune")
            .apply()
        homePrefs.edit()
            .putString("art:1", "https://img.example/art1.jpg")
            .putString("logo:1", "https://img.example/logo1.png")
            .putString("discover:1", """{"type":"movie"}""")
            .putString("art:2", "https://img.example/art2.jpg")
            .putString("logo:2", "https://img.example/logo2.png")
            .putString("discover:2", """{"type":"series"}""")
            .apply()

        Profiles.removeFromPrefs(accountPrefs, settingsPrefs, searchPrefs, homePrefs, "1")

        assertEquals(listOf("2"), Profiles.readProfiles(accountPrefs).map { it.id })
        assertNull(accountPrefs.getString("active", null))
        assertFalse(accountPrefs.contains("shareStreams:1"))
        assertFalse(accountPrefs.contains("signedOut:1"))
        assertFalse(settingsPrefs.contains("subPref@1"))
        assertFalse(searchPrefs.contains("recent:1"))
        assertFalse(homePrefs.contains("art:1"))
        assertFalse(homePrefs.contains("logo:1"))
        assertFalse(homePrefs.contains("discover:1"))

        assertTrue(accountPrefs.getBoolean("shareStreams:2", false))
        assertEquals("on", settingsPrefs.getString("subPref@2", null))
        assertEquals("dune", searchPrefs.getString("recent:2", null))
        assertEquals("https://img.example/art2.jpg", homePrefs.getString("art:2", null))
        assertEquals("https://img.example/logo2.png", homePrefs.getString("logo:2", null))
        assertEquals("""{"type":"series"}""", homePrefs.getString("discover:2", null))
    }

    @Test
    fun hasValidTitleIdRejectsMissingBlankAndInvalidExtras() {
        assertFalse(hasValidTitleId(null as Intent?))
        assertFalse(isValidTitleId { null })
        assertFalse(isValidTitleId { "" })
        assertFalse(isValidTitleId { "   \t\n" })
        assertFalse(isValidTitleId { throw ClassCastException("non-string extra") })
        assertTrue(isValidTitleId { "tt1234567" })
    }

    private class InMemoryPrefs : SharedPreferences {
        private val data = linkedMapOf<String, Any?>()

        override fun getAll(): MutableMap<String, *> = data.toMutableMap()
        override fun getString(key: String?, defValue: String?): String? = data[key] as? String ?: defValue
        @Suppress("UNCHECKED_CAST")
        override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
            (data[key] as? Set<String>)?.toMutableSet() ?: defValues
        override fun getInt(key: String?, defValue: Int): Int = data[key] as? Int ?: defValue
        override fun getLong(key: String?, defValue: Long): Long = data[key] as? Long ?: defValue
        override fun getFloat(key: String?, defValue: Float): Float = data[key] as? Float ?: defValue
        override fun getBoolean(key: String?, defValue: Boolean): Boolean = data[key] as? Boolean ?: defValue
        override fun contains(key: String?): Boolean = key in data
        override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}
        override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}

        override fun edit(): SharedPreferences.Editor = object : SharedPreferences.Editor {
            private val updates = linkedMapOf<String, Any?>()
            private var cleared = false

            override fun putString(key: String?, value: String?) = apply { if (key != null) updates[key] = value }
            override fun putStringSet(key: String?, values: MutableSet<String>?) = apply { if (key != null) updates[key] = values?.toSet() }
            override fun putInt(key: String?, value: Int) = apply { if (key != null) updates[key] = value }
            override fun putLong(key: String?, value: Long) = apply { if (key != null) updates[key] = value }
            override fun putFloat(key: String?, value: Float) = apply { if (key != null) updates[key] = value }
            override fun putBoolean(key: String?, value: Boolean) = apply { if (key != null) updates[key] = value }
            override fun remove(key: String?) = apply { if (key != null) updates[key] = null }
            override fun clear() = apply { cleared = true; updates.clear() }
            override fun commit(): Boolean { apply(); return true }
            override fun apply() {
                if (cleared) data.clear()
                updates.forEach { (k, v) -> if (v == null) data.remove(k) else data[k] = v }
            }
        }
    }
}
