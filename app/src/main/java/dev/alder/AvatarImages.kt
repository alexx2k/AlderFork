package dev.alder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import java.io.File
import java.io.FileOutputStream
import java.lang.ref.WeakReference
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.FutureTask
import java.util.concurrent.atomic.AtomicInteger

/**
 * Small, reusable portraits for the profile picker and its continuous gallery.
 *
 * The regular Images loader is tuned for posters and full-screen art. Keeping avatars
 * separate prevents a long scroll from evicting the Home screen's artwork.
 */
internal object AvatarImages {
    private const val DISK_LIMIT = 96L * 1024 * 1024
    private const val DISK_VERSION = "avatar_thumbnails_opaque_v2"

    private val memoryBudget = (Runtime.getRuntime().maxMemory() / 12)
        .coerceIn(4L * 1024 * 1024, 16L * 1024 * 1024).toInt()
    private val memory = object : LruCache<String, Bitmap>(memoryBudget) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    // Only three visible portraits fetch/decode at once, leaving CPU time for drawing
    // and streaming artwork. Fresh visible requests jump ahead of old queued ones.
    private val visible = Images.newestFirst(3)
    private val ahead = Images.newestFirst(1)
    private val writer = Images.newestFirst(1)
    private val main = Handler(Looper.getMainLooper())
    private val inFlight = ConcurrentHashMap<String, FutureTask<Bitmap?>>()
    private val prefetchGeneration = AtomicInteger()
    private val writes = AtomicInteger()

    private class Binding(val key: String)

    /** Invalidate a detached/recycled view without canceling a download shared by another view. */
    fun cancel(image: ImageView) {
        image.tag = null
    }

    /**
     * Bind a portrait to an ImageView. Rebinding the same row does no work, and an
     * old result can never paint over a newer portrait after ListView recycling.
     * Pass the same pixel width (100dp) in the picker and gallery for cache reuse.
     */
    fun bind(
        context: Context,
        url: String,
        into: ImageView,
        widthPx: Int,
        failed: (() -> Unit)? = null,
        done: (() -> Unit)? = null
    ) {
        val width = widthPx.coerceAtLeast(1)
        val key = key(url, width)
        val existing = into.tag as? Binding
        if (existing?.key == key) {
            if (into.drawable == null) memory.get(key)?.let {
                into.setImageBitmap(it)
                done?.invoke()
            }
            return
        }

        val binding = Binding(key)
        into.tag = binding
        into.setImageDrawable(null)
        memory.get(key)?.let {
            into.setImageBitmap(it)
            done?.invoke()
            return
        }

        val target = WeakReference(into)
        val app = context.applicationContext
        visible.execute {
            // Skip queued portraits that the viewer has already scrolled past.
            if (target.get()?.tag !== binding) return@execute
            val picture = bitmap(app, url, width)
            main.post {
                val view = target.get()
                if (view?.tag === binding) {
                    if (picture == null) failed?.invoke()
                    else {
                        view.setImageBitmap(picture)
                        done?.invoke()
                    }
                }
            }
        }
    }

    /**
     * Prefetch just one row in the scrolling direction. A newer target invalidates
     * outstanding queued prefetches, instead of downloading hundreds of unseen icons.
     */
    fun prefetchRow(context: Context, urls: List<String>, widthPx: Int) {
        val generation = prefetchGeneration.incrementAndGet()
        val app = context.applicationContext
        val width = widthPx.coerceAtLeast(1)
        urls.distinct().forEach { url ->
            if (memory.get(key(url, width)) != null) return@forEach
            ahead.execute {
                if (generation != prefetchGeneration.get()) return@execute
                bitmap(app, url, width)
            }
        }
    }

    fun stopPrefetch() {
        prefetchGeneration.incrementAndGet()
    }

    private fun key(url: String, widthPx: Int) = "$url#$widthPx"

    /** One network request and one decode when a visible cell races a prefetch. */
    private fun bitmap(context: Context, url: String, width: Int): Bitmap? {
        val key = key(url, width)
        memory.get(key)?.let { return it }
        val mine = FutureTask<Bitmap?> {
            runCatching {
                val directory = File(context.cacheDir, DISK_VERSION).apply { mkdirs() }
                val file = File(directory, sha256(key) + ".webp")
                var software = if (file.isFile) {
                    BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply {
                        inPreferredConfig = Bitmap.Config.ARGB_8888
                    })?.also { file.setLastModified(System.currentTimeMillis()) }
                } else null

                val downloaded = software == null
                if (downloaded) {
                    if (file.exists()) file.delete() // Invalid or truncated thumbnail.
                    // Uploaded portraits are private local files, not HTTP URLs.
                    val bytes = if (LocalProfileAvatars.isLocal(url)) {
                        LocalProfileAvatars.fileForUrl(context, url)?.readBytes()
                    } else Http.bytes(url, strict = true)
                    software = bytes?.let { decode(it, width) }
                }

                software?.let { original ->
                    // A GPU copy is ready to render before WebP compression. Keep
                    // the software source alive only until the disk writer finishes.
                    val display = if (Build.VERSION.SDK_INT >= 26)
                        original.copy(Bitmap.Config.HARDWARE, false) else original
                    memory.put(key, display)
                    if (downloaded) writer.execute {
                        try { writeThumbnail(directory, file, original) }
                        finally { if (display !== original) original.recycle() }
                    }
                    display
                }
            }.getOrNull()
        }
        val task = inFlight.putIfAbsent(key, mine) ?: mine
        if (task === mine) try {
            mine.run()
        } finally {
            inFlight.remove(key, mine)
        }
        return runCatching { task.get() }.getOrNull()
    }

    /** Decode at the portrait's display size, without keeping the full original in RAM. */
    private fun decode(bytes: ByteArray, width: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (bounds.outWidth / (sample * 2) >= width) sample *= 2
        val original = BitmapFactory.decodeByteArray(bytes, 0, bytes.size,
            BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }) ?: return null
        val height = (original.height.toLong() * width / original.width).toInt().coerceAtLeast(1)
        val resized = if (original.width == width) original
            else Bitmap.createScaledBitmap(original, width, height, true).also {
                if (it !== original) original.recycle()
            }

        // Netflix's PNG portraits can contain translucent/transparent pixels.
        // Permanently flatten each decoded thumbnail on a solid dark surface:
        // no artwork or banner can show through, even after row recycling.
        val opaque = Bitmap.createBitmap(resized.width, resized.height, Bitmap.Config.ARGB_8888)
        Canvas(opaque).apply {
            drawColor(Color.rgb(32, 32, 32))
            drawBitmap(resized, 0f, 0f, null)
        }
        resized.recycle()
        return opaque
    }

    /** Keep a bounded on-disk cache of already-resized images, independent of HTTP's raw image cache. */
    private fun writeThumbnail(directory: File, destination: File, bitmap: Bitmap) {
        runCatching {
            val temporary = File(directory, destination.name + "." +
                Thread.currentThread().id + ".tmp")
            try {
                FileOutputStream(temporary).use { output ->
                    check(bitmap.compress(Bitmap.CompressFormat.WEBP, 95, output))
                }
                if (!temporary.renameTo(destination)) temporary.delete()
            } finally {
                if (temporary.exists()) temporary.delete()
            }
            // Directory scans happen on the image thread, not during frame rendering.
            if (writes.incrementAndGet() % 24 == 0) trim(directory)
        }
    }

    private fun trim(directory: File) {
        val oldest = directory.listFiles()?.filter { it.isFile && it.extension == "webp" }?.sortedBy { it.lastModified() } ?: return
        var bytes = oldest.sumOf { it.length() }
        for (file in oldest) {
            if (bytes <= DISK_LIMIT) break
            bytes -= file.length()
            file.delete()
        }
    }

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") {
            "%02x".format(it)
        }
}

/** Cancel queued requests as ListView detaches rows, not only when it rebinds them. */
internal class AvatarPortraitImage(context: Context) : ImageView(context) {
    override fun onDetachedFromWindow() {
        AvatarImages.cancel(this)
        super.onDetachedFromWindow()
    }
}
