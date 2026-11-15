package dev.alder

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import org.json.JSONObject

/** Avatar images are referenced by URL; the APK contains no third-party artwork. */
internal object ProfileAvatars {
    fun attach(context: Context, profile: Profile, host: FrameLayout, sizePx: Int,
               placeholder: TextView? = null): ImageView? {
        val url = profile.avatarUrl?.takeIf {
            it.startsWith("https://") || LocalProfileAvatars.isLocal(it)
        } ?: return null
        val picture = AvatarPortraitImage(context).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            isFocusable = false
            visibility = View.INVISIBLE
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(profile.color)
            }
            clipToOutline = true
        }
        host.addView(picture, FrameLayout.LayoutParams(sizePx, sizePx, Gravity.CENTER))
        AvatarImages.bind(context, url, picture, sizePx,
            failed = {
                picture.visibility = View.INVISIBLE
                placeholder?.text = profile.name.take(1).uppercase()
            },
            done = {
                // Retire the initials once the actual picture has loaded. Transparent
                // PNGs must not reveal a duplicate/faint letter behind the artwork.
                placeholder?.text = ""
                picture.visibility = View.VISIBLE
            })
        return picture
    }
}

internal data class AvatarIcon(
    val group: String,
    val season: String,
    val name: String,
    val url: String,
    val service: String = "Netflix"
)

/**
 * Each service has a small offline catalogue of remote image references.
 * APK bundles metadata only; the existing AvatarImages loader fetches only
 * visible thumbnails and caches them. An optional pack failing to parse must
 * never prevent the existing Netflix pictures from appearing.
 */
internal object AvatarCatalog {
    private val optionalPacks = listOf(
        "avatar_catalog_disney.json",
        "avatar_catalog_hbo.json",
        "avatar_catalog_prime.json",
        "avatar_catalog_crunchyroll.json"
    )
    private var cache: List<AvatarIcon>? = null

    private fun parse(context: Context, filename: String): List<AvatarIcon> {
        val raw = context.assets.open(filename).bufferedReader().use { it.readText() }
        val array = JSONObject(raw).getJSONArray("icons")
        return (0 until array.length()).map { array.getJSONObject(it) }.map {
            AvatarIcon(
                group = it.getString("group"),
                season = it.optString("season", "Collection"),
                name = it.getString("name"),
                url = it.getString("url"),
                service = it.optString("service", "Netflix")
            )
        }
    }

    @Synchronized
    fun all(context: Context): List<AvatarIcon> {
        cache?.let { return it }
        val icons = parse(context, "avatar_catalog.json").toMutableList()
        optionalPacks.forEach { file ->
            runCatching { parse(context, file) }
                .onSuccess { icons.addAll(it) }
                .onFailure { android.util.Log.w("AvatarCatalog", "Could not load $file", it) }
        }
        return icons.also { cache = it }
    }
}
