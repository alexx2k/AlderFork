package dev.alder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/**
 * Private, on-device profile photos. No phone uploads are sent to Stremio or a
 * third-party service. Profiles only store a versioned local reference.
 */
internal object LocalProfileAvatars {
    private const val PREFIX = "alder-avatar://"
    private const val SIZE = 320
    private const val MAX_BYTES = 3 * 1024 * 1024

    fun isLocal(url: String?) = url?.startsWith(PREFIX) == true

    private fun validId(id: String) = id.length == 1 && id[0] in '1'..'5'

    private fun storage(context: Context, profileId: String): File? {
        if (!validId(profileId)) return null
        return File(File(context.filesDir, "profile_avatars"), "$profileId.jpg")
    }

    fun fileForUrl(context: Context, url: String): File? {
        if (!isLocal(url)) return null
        val rest = url.removePrefix(PREFIX)
        val profileId = rest.substringBefore('/')
        if (!validId(profileId) || !rest.contains('/')) return null
        return storage(context, profileId)?.takeIf { it.isFile }
    }

    fun delete(context: Context, profileId: String) {
        storage(context, profileId)?.delete()
    }

    /**
     * Decode with sampling before allocating a bitmap, center-crop at 320px,
     * remove transparency, then atomically replace the local JPEG.
     */
    fun save(context: Context, profileId: String, bytes: ByteArray): String? {
        if (bytes.isEmpty() || bytes.size > MAX_BYTES) return null
        val destination = storage(context, profileId) ?: return null
        return runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            require(bounds.outWidth in 1..12000 && bounds.outHeight in 1..12000) {
                "Unsupported image dimensions"
            }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= SIZE) sample *= 2
            val original = BitmapFactory.decodeByteArray(bytes, 0, bytes.size,
                BitmapFactory.Options().apply {
                    inSampleSize = sample
                    inPreferredConfig = Bitmap.Config.ARGB_8888
                }) ?: error("Unsupported image")
            val avatar = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
            try {
                val side = minOf(original.width, original.height)
                val left = (original.width - side) / 2
                val top = (original.height - side) / 2
                Canvas(avatar).apply {
                    drawColor(Color.rgb(32, 32, 32))
                    drawBitmap(original, Rect(left, top, left + side, top + side),
                        Rect(0, 0, SIZE, SIZE), Paint(Paint.FILTER_BITMAP_FLAG))
                }
                destination.parentFile?.mkdirs()
                val temporary = File(destination.parentFile, "$profileId.new")
                try {
                    FileOutputStream(temporary).use { output ->
                        check(avatar.compress(Bitmap.CompressFormat.JPEG, 92, output))
                    }
                    // Renaming within the same private directory is atomic on Android.
                    check(temporary.renameTo(destination)) { "Could not save avatar" }
                } finally {
                    temporary.delete()
                }
            } finally {
                original.recycle()
                avatar.recycle()
            }
            "$PREFIX$profileId/${UUID.randomUUID()}"
        }.getOrNull()
    }
}
