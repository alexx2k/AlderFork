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
        val url = profile.avatarUrl?.takeIf { it.startsWith("https://") } ?: return null
        val picture = ImageView(context).apply {
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
        Images.load(url, picture, sizePx, urgent = true,
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

internal data class AvatarIcon(val group: String, val season: String, val name: String, val url: String)

/**
 * Show names are alphabetised; seasons/collections and the icons in each
 * collection retain their source ordering.
 */
internal object AvatarCatalog {
    private var cache: List<AvatarIcon>? = null

    @Synchronized
    fun all(context: Context): List<AvatarIcon> {
        cache?.let { return it }
        val text = context.assets.open("avatar_catalog.json").bufferedReader().use { it.readText() }
        val array = JSONObject(text).getJSONArray("icons")
        return (0 until array.length()).map { array.getJSONObject(it) }.map {
            AvatarIcon(it.getString("group"), it.getString("season"),
                it.getString("name"), it.getString("url"))
        }.also { cache = it }
    }
}
