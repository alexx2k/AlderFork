package dev.alder

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

enum class LibraryMode {
    STREMIO,
    LOCAL
}

class Profile(
    val id: String,
    val name: String,
    val color: Int,
    val authKey: String,
    val pin: String? = null,
    val libraryMode: LibraryMode = LibraryMode.STREMIO,
    val accountOwnerId: String? = null,
    val avatarUrl: String? = null
)

/**
 * Profiles on this TV. Stremio profiles retain cloud libraries; local profiles share an
 * account owner's streaming access while keeping watch history and lists only on this device.
 */
object Profiles {
    const val MAX = 5
    val COLORS = intArrayOf(0xFFF3D9B1.toInt(), 0xFFC98E6A.toInt(), 0xFF8FA39A.toInt(), 0xFFA6A2BD.toInt(), 0xFFD3A66B.toInt())

    fun all(context: Context): List<Profile> {
        val prefs = prefs(context)
        migrate(prefs)
        val stored = JSONArray(prefs.getString("profiles", "[]")).objects().map {
            Profile(
                id = it.getString("id"),
                name = it.getString("name"),
                color = it.getInt("color").takeIf { c -> c in COLORS } ?: COLORS[0],
                authKey = it.optString("authKey").ifEmpty { it.optString("credential") },
                pin = it.optString("pin").ifEmpty { null },
                libraryMode = if (it.optString("libraryMode") == "local") LibraryMode.LOCAL else LibraryMode.STREMIO,
                accountOwnerId = it.optString("accountOwnerId").ifEmpty { null },
                avatarUrl = it.optString("avatarUrl").ifEmpty { null }
            )
        }
        // A local profile stores no copy of the credential. Always resolve its owner's
        // current key, so re-linking the owner restores streaming for the whole household.
        return stored.map { p ->
            if (p.libraryMode != LibraryMode.LOCAL) p
            else {
                val owner = stored.firstOrNull { it.id == p.accountOwnerId && it.libraryMode == LibraryMode.STREMIO }
                Profile(p.id, p.name, p.color, owner?.authKey.orEmpty(), p.pin, p.libraryMode, p.accountOwnerId, p.avatarUrl)
            }
        }
    }

    /** The profile in use: the one picked last, or the only one there is. */
    fun active(context: Context): Profile? {
        val list = all(context)
        return list.firstOrNull { it.id == prefs(context).getString("active", null) } ?: list.singleOrNull()
    }

    fun setActive(context: Context, id: String) = prefs(context).edit().putString("active", id).apply()

    fun add(context: Context, name: String, authKey: String, color: Int = COLORS[0]): Profile {
        val list = all(context)
        val number = (1..MAX).first { n -> list.none { it.id == "$n" } }
        val profile = Profile("$number", name, color, authKey)
        save(prefs(context), list + profile)
        setActive(context, profile.id)
        return profile
    }

    /** Share an existing Stremio login for sources, but use a completely local library. */
    fun addLocal(context: Context, name: String, ownerId: String, color: Int = COLORS[0]): Profile {
        val list = all(context)
        require(list.size < MAX) { "Maximum number of profiles reached" }
        val owner = list.firstOrNull { it.id == ownerId && it.libraryMode == LibraryMode.STREMIO }
            ?: error("A local profile needs a Stremio account owner")
        val number = (1..MAX).first { n -> list.none { it.id == "$n" } }
        val profile = Profile("$number", name, color, owner.authKey, libraryMode = LibraryMode.LOCAL, accountOwnerId = owner.id)
        save(prefs(context), list + profile)
        setActive(context, profile.id)
        return profile
    }

    /** Account owner responsible for a profile's streaming credentials (possibly itself). */
    fun accountOwner(context: Context, profile: Profile): Profile? {
        val list = all(context)
        return if (profile.libraryMode == LibraryMode.LOCAL)
            list.firstOrNull { it.id == profile.accountOwnerId && it.libraryMode == LibraryMode.STREMIO }
        else list.firstOrNull { it.id == profile.id && it.libraryMode == LibraryMode.STREMIO }
    }

    fun remove(context: Context, id: String) {
        val list = all(context)
        require(list.none { it.libraryMode == LibraryMode.LOCAL && it.accountOwnerId == id }) {
            "Remove linked local profiles before removing their Stremio account owner"
        }
        val prefs = prefs(context)
        save(prefs, list.filterNot { it.id == id })
        LocalLibrary.clear(context, id)
        if (prefs.getString("active", null) == id) prefs.edit().remove("active").apply()
        prefs.edit().remove("shareStreams:$id").remove("signedOut:$id").apply()
        Settings.forget(context, id)
        context.getSharedPreferences("search", Context.MODE_PRIVATE).edit().remove("recent:$id").apply()
    }

    /**
     * Stremio no longer knows this profile's sign-in (signed out on the phone or elsewhere, or the session expired). The
     * profile stays, with its name, PIN and settings, and asks to sign in again instead of being removed.
     */
    private fun loginId(context: Context, id: String): String =
        all(context).firstOrNull { it.id == id }?.accountOwnerId ?: id

    fun signedOut(context: Context, id: String) =
        prefs(context).getBoolean("signedOut:${loginId(context, id)}", false)

    fun markSignedOut(context: Context, id: String) =
        prefs(context).edit().putBoolean("signedOut:${loginId(context, id)}", true).apply()

    /** A fresh sign-in for an existing profile: its new auth key, everything else kept. */
    fun signIn(context: Context, id: String, authKey: String) {
        require(all(context).firstOrNull { it.id == id }?.libraryMode == LibraryMode.STREMIO) {
            "Only a Stremio account owner can re-link its login"
        }
        save(prefs(context), all(context).map { if (it.id != id) it else Profile(
            it.id, it.name, it.color, authKey, it.pin,
            it.libraryMode, it.accountOwnerId, it.avatarUrl
        ) })
        prefs(context).edit().remove("signedOut:$id").apply()
    }

    /** Whether [id] lends its stream add-ons (`Addon.shareable`) to the other profiles on this TV. */
    fun sharesStreams(context: Context, id: String) = prefs(context).getBoolean("shareStreams:$id", false)

    fun setSharesStreams(context: Context, id: String, on: Boolean) = prefs(context).edit().putBoolean("shareStreams:$id", on).apply()

    /** The other profiles lending their stream add-ons to the active one; watch progress still uses the active account. */
    fun streamLenders(context: Context): List<Profile> {
        val current = active(context) ?: return emptyList()
        return all(context).filter { it.id != current.id && sharesStreams(context, it.id) }
    }

    /** Rename or set the PIN of a profile (clearPin removes it), keeping its place in the list. */
    fun update(context: Context, id: String, name: String? = null, pin: String? = null, clearPin: Boolean = false, color: Int? = null,
               avatarUrl: String? = null, clearAvatar: Boolean = false) {
        save(prefs(context), all(context).map {
            if (it.id != id) it
            else Profile(
                it.id,
                name ?: it.name,
                color ?: it.color,
                it.authKey,
                if (clearPin) null else pin ?: it.pin,
                it.libraryMode,
                it.accountOwnerId,
                if (clearAvatar) null else avatarUrl ?: it.avatarUrl
            )
        })
    }

    private fun save(prefs: SharedPreferences, list: List<Profile>) {
        val json = JSONArray(list.map { profile ->
            JSONObject()
                .put("id", profile.id)
                .put("name", profile.name)
                .put("color", profile.color)
                .put("authKey", if (profile.libraryMode == LibraryMode.LOCAL) "" else profile.authKey)
                .put("pin", profile.pin ?: "")
                .put(
                    "libraryMode",
                    when (profile.libraryMode) {
                        LibraryMode.STREMIO -> "stremio"
                        LibraryMode.LOCAL -> "local"
                    }
                )
                .put("accountOwnerId", profile.accountOwnerId ?: "")
                .put("avatarUrl", profile.avatarUrl ?: "")
        })

        prefs.edit()
            .putString("profiles", json.toString())
            .apply()
    }

    // Before profiles there was one sign-in; it becomes the first profile.
    private fun migrate(prefs: SharedPreferences) {
        // Sharing used to lend one add-on to one profile (2026-10-26); an owner who lent one now shares with everyone.
        prefs.all.keys.filter { it.startsWith("streamSource:") || it.startsWith("streamAddon:") }.takeIf { it.isNotEmpty() }?.let { old ->
            val edit = prefs.edit()
            old.forEach { key ->
                if (key.startsWith("streamSource:")) prefs.getString(key, null)?.let { edit.putBoolean("shareStreams:$it", true) }
                edit.remove(key)
            }
            edit.apply()
        }
        val key = prefs.getString("authKey", null) ?: return
        if (!prefs.contains("profiles")) save(prefs, listOf(Profile("1", "Me", COLORS[0], key)))
        prefs.edit().remove("authKey").putString("active", "1").apply()
    }

    private fun prefs(context: Context) = context.getSharedPreferences("account", Context.MODE_PRIVATE)
}
