package dev.tarn

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * A title's art, sharp, fading out into the glass on its left (under the text) and towards the bottom, from
 * [bottomFrom] to [bottomTo] of its height. A mask on the picture itself, not a colour painted over it, so there's no
 * box where the fade meets the blurred scene behind.
 */
class FadedArt(context: Context, private val bottomFrom: Float = 0.45f, private val bottomTo: Float = 1f) : ImageView(context) {
    private val mask = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
    private var left: Shader? = null
    private var bottom: Shader? = null

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        // Under the text (the left 60%) only a hint of the picture stays, so bright art can't fight the words.
        left = LinearGradient(0f, 0f, w * 0.85f, 0f, intArrayOf(0x18000000, 0x38000000, 0xB3000000.toInt(), Color.BLACK), floatArrayOf(0f, 0.45f, 0.8f, 1f), Shader.TileMode.CLAMP)
        bottom = LinearGradient(0f, h * bottomFrom, 0f, h * bottomTo, intArrayOf(Color.BLACK, 0x59000000, 0), floatArrayOf(0f, 0.6f, 1f), Shader.TileMode.CLAMP)
    }

    override fun onDraw(canvas: Canvas) {
        val layer = canvas.saveLayer(0f, 0f, width.toFloat(), height.toFloat(), null)
        super.onDraw(canvas)
        mask.shader = left
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), mask)
        mask.shader = bottom
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), mask)
        canvas.restoreToCount(layer)
    }
}

/** Keeps text readable straight on art: a soft dark shadow instead of a panel over the picture. */
fun TextView.onArt() = apply { setShadowLayer(resources.displayMetrics.density * 3, 0f, resources.displayMetrics.density, 0xCC000000.toInt()) }

internal fun filmGlow(pixels: IntArray): Int {
    require(pixels.isNotEmpty())
    val red = pixels.sumOf { it ushr 16 and 255 } / pixels.size
    val green = pixels.sumOf { it ushr 8 and 255 } / pixels.size
    val blue = pixels.sumOf { it and 255 } / pixels.size
    val lightness = (maxOf(red, green, blue) + minOf(red, green, blue)) / 2f
    val scale = if (lightness > 178.5f) 178.5f / lightness else 1f
    return (0x8C shl 24) or ((red * scale).toInt() shl 16) or ((green * scale).toInt() shl 8) or (blue * scale).toInt()
}

// Hardware (GPU) bitmaps came in Android 8. Before it Bitmap.Config.HARDWARE does not exist, and touching it crashed
// Alder on Android 6 and 7, so older TVs keep pictures in ordinary memory.
internal val GPU_BITMAP: Bitmap.Config = if (android.os.Build.VERSION.SDK_INT >= 26) Bitmap.Config.HARDWARE else Bitmap.Config.ARGB_8888
internal fun Bitmap.onGpu() = android.os.Build.VERSION.SDK_INT >= 26 && config == Bitmap.Config.HARDWARE
/** This picture moved to GPU memory (Android 8+), the original recycled; older Android keeps it as it is. */
internal fun Bitmap.toGpu(): Bitmap =
    if (android.os.Build.VERSION.SDK_INT >= 26) copy(Bitmap.Config.HARDWARE, false)?.also { recycle() } ?: this else this

/**
 * A [w] x [h] copy of [src]'s pixels, or null. Decoded art is often a hardware bitmap, which can't be read: scaling
 * keeps it hardware, so the small copy is moved to software before reading. Every pixel sample goes through here.
 */
internal fun samplePixels(src: Bitmap, w: Int, h: Int): IntArray? = runCatching {
    val small = Bitmap.createScaledBitmap(src, w, h, true)
    val soft = if (small.onGpu()) small.copy(Bitmap.Config.ARGB_8888, false) else small
    IntArray(w * h).also { soft.getPixels(it, 0, w, 0, 0, w, h) }
        .also { if (small !== src) small.recycle(); if (soft !== small) soft.recycle() }
}.getOrNull()

internal fun brightLeft(pixels: IntArray, width: Int): Boolean {
    require(width > 0 && pixels.isNotEmpty() && pixels.size % width == 0)
    val left = maxOf(1, width / 2)
    val luminance = pixels.indices.filter { it % width < left }.sumOf {
        val color = pixels[it]
        (color ushr 16 and 255) * 0.2126 + (color ushr 8 and 255) * 0.7152 + (color and 255) * 0.0722
    }
    return luminance / (left * (pixels.size / width) * 255) > 0.5
}

/** What every screen shares: the signed-in account, background work, and the few view helpers the plain UI uses. */
abstract class Screen : Activity() {
    protected val main = Handler(Looper.getMainLooper())
    /** The Stremio account of the profile in use. */
    protected val authKey: String? get() = Profiles.active(this)?.authKey

    /** The Settings › Text and poster size this screen was built with; a different one rebuilds it (see onResume). */
    private var builtScale = 1f

    /**
     * Settings › Language › App language, for TVs without Android 13's per-app language page (it applies it itself),
     * and Settings › Text and poster size: the screen's density grows, so text, posters, glass and spacing all grow
     * together and keep the House Lights proportions (rows show fewer posters, each one bigger).
     */
    override fun attachBaseContext(newBase: Context) {
        val config = android.content.res.Configuration(newBase.resources.configuration)
        var changed = false
        if (android.os.Build.VERSION.SDK_INT < 33) {
            val lang = Settings.appLanguage(newBase)
            @Suppress("DEPRECATION") val locale = if (lang.isEmpty()) config.locale else java.util.Locale.forLanguageTag(lang)
            java.util.Locale.setDefault(locale) // language names and dates follow it too
            if (lang.isNotEmpty()) { config.setLocale(locale); changed = true }
        }
        builtScale = Settings.uiScale(newBase)
        if (builtScale != 1f) { config.densityDpi = (config.densityDpi * builtScale).toInt(); changed = true }
        super.attachBaseContext(if (changed) newBase.createConfigurationContext(config) else newBase)
    }

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        if (Http.saved != null) return
        // Pictures load many at a time from a few hosts: keep enough connections open to reuse (Android keeps 5).
        System.setProperty("http.maxConnections", "16")
        // Disk cache for pictures (and anything else whose server allows caching), and last time's answers.
        android.net.http.HttpResponseCache.install(java.io.File(cacheDir, "http"), 250L * 1024 * 1024)
        Http.saved = java.io.File(cacheDir, "answers")
        Http.userAgent = "Tarn/${Updates.mine(this)} (Android ${android.os.Build.VERSION.RELEASE}; ${android.os.Build.MODEL})"
    }

    override fun onDestroy() {
        phoneEntry?.close()
        phoneEntry = null
        main.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    /**
     * Downloads [release] and hands it to Android's installer. Alder closes to be replaced and doesn't open again by
     * itself, so the viewer is told first. Without permission to install apps, Android's page for it opens, and the
     * install goes on when the viewer comes back with it allowed; a TV without that page gets the steps instead.
     */
    protected fun installUpdate(release: Updates.Release) {
        if (!Updates.canInstall(this)) {
            pendingInstall = release
            if (!Updates.askToInstall(this)) {
                pendingInstall = null
                choose(getString(R.string.updates_allow_title), listOf(getString(R.string.action_ok)),
                    getString(R.string.updates_allow_steps)) {}
            }
            return
        }
        android.widget.Toast.makeText(this, getString(R.string.updates_downloading, release.version),
            android.widget.Toast.LENGTH_LONG).show()
        background({ Updates.install(applicationContext, release) }) { r ->
            if (r.isFailure) choose(getString(R.string.updates_download_failed), listOf(getString(R.string.action_ok)),
                getString(R.string.updates_download_failed_desc)) {}
        }
    }

    // An update waiting on the TV's permission to install apps: it goes on when the viewer comes back with it allowed.
    private var pendingInstall: Updates.Release? = null

    override fun onResume() {
        super.onResume()
        if (Settings.uiScale(this) != builtScale) return recreate() // the size changed while this screen was behind
        val release = pendingInstall ?: return
        pendingInstall = null
        if (Updates.canInstall(this)) installUpdate(release)
    }

    /** Runs [work] off the main thread and hands its result back on it, unless the screen is gone. */
    protected fun <T> background(work: () -> T, executor: Executor = pool, done: (Result<T>) -> Unit) {
        executor.execute {
            val result = runCatching(work)
            main.post { if (!isDestroyed) done(result) }
        }
    }

    // Read once for the whole app, not per screen: Inter alone is 870 KB, read twice, on the main thread.
    private val fonts get() = loadedFonts ?: Fonts(applicationContext.assets).also { loadedFonts = it }

    /** Shared Inter typography; existing title-size hierarchy is retained. */
    internal fun text(value: String, sp: Float, bold: Boolean = false, color: Int = TEXT, serif: Boolean = false) =
        TextView(this).apply {
            text = value
            textSize = sp
            setTextColor(color)
            typeface = if (bold || serif) fonts.semiBold else fonts.medium
            LEADING[sp]?.let { lead ->
                val want = android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP, lead, resources.displayMetrics)
                setLineSpacing(want - paint.getFontMetricsInt(null), 1f)
            }
        }

    internal fun text(words: Int, sp: Float, bold: Boolean = false, color: Int = TEXT, serif: Boolean = false) =
        text(getString(words), sp, bold, color, serif)

    protected fun caps(value: String, color: Int = TEXT_2) = text(value.uppercase(), CAPS, bold = true, color = color).apply {
        letterSpacing = 0.12f
    }

    protected fun caps(words: Int, color: Int = TEXT_2) = caps(getString(words), color)

    /** [count] in the plural form the viewer's language needs ("1 season", "5 seasons"). */
    protected fun plural(words: Int, count: Int, vararg more: Any): String =
        resources.getQuantityString(words, count, count, *more)

    protected fun column(gravity: Int, vararg views: View) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        clipChildren = false // focused pills and pictures grow past their own bounds
        this.gravity = gravity
        // Wrap-content by default: a vertical LinearLayout would otherwise stretch every child to full width.
        views.forEach { addView(it, it.layoutParams ?: wrap()) }
    }

    protected fun <V : View> V.marginTop(top: Int) = apply { layoutParams = wrap().apply { topMargin = dp(top) } }

    protected fun wrap() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)

    internal fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private var windowShade: View? = null
    private var windowArt: ImageView? = null
    private var shadeSource: Bitmap? = null

    /** The left shade is for text over bare art; a screen that puts its text on glass can lift it off the art. */
    protected fun leftShade(on: Boolean) {
        windowShade?.enter()?.alpha(if (on) 1f else 0f)?.start()
    }

    private fun updateWindowShade() {
        val art = (windowArt?.drawable as? BitmapDrawable)?.bitmap ?: return
        if (art === shadeSource) return
        shadeSource = art
        // Sampled off the main thread: reading a hardware bitmap back from the GPU stalls it for several ms.
        background({ samplePixels(art, 16, 24)?.let { brightLeft(it, 16) } }) { r ->
            val bright = r.getOrNull() ?: return@background
            if (art !== shadeSource) return@background
            // A bright film keeps the shade dark across the whole text column, not just at the screen's edge.
            windowShade?.background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                if (bright) intArrayOf(0xF7000000.toInt(), 0xE0000000.toInt(), 0x80000000.toInt(), 0x00000000)
                else intArrayOf(0xEB000000.toInt(), 0x00000000, 0x00000000))
        }
    }

    /** Sharp film art fills the screen; shade stays behind text and the bottom row. */
    protected fun setWindowed(content: View, backdrop: View = View(this).apply { background = mood() }) {
        windowArt = backdrop as? ImageView
        shadeSource = null
        window.setBackgroundDrawable(null) // the scene paints the whole screen
        setContentView(FrameLayout(this).apply {
            addView(backdrop, FrameLayout.LayoutParams(-1, -1))
            windowShade = View(context).apply {
                background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(0xEB000000.toInt(), 0x00000000, 0x00000000))
            }.also { addView(it, FrameLayout.LayoutParams(-1, -1)) }
            addView(View(context).apply {
                background = GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, intArrayOf(0xF7000000.toInt(), 0x00000000, 0x00000000))
            }, FrameLayout.LayoutParams(-1, -1))
            addView(View(context).apply {
                background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                    intArrayOf(0x8C000000.toInt(), 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000))
            }, FrameLayout.LayoutParams(-1, -1))
            addView(content, FrameLayout.LayoutParams(-1, -1))
        })
        updateWindowShade()
    }

    /** A quiet tinted row on the pane (episodes, sources): no edge, no glass of its own. */
    protected fun tile(radiusDp: Int = TILE_RADIUS) = GradientDrawable().apply {
        setColor(0x14FFFFFF)
        cornerRadius = dp(radiusDp).toFloat()
    }

    /** Solid fallback until a title's art is available. */
    private fun mood() = rounded(BASE, 0)

    /** Black on white with the standard 4-module quiet zone, whole pixels per module so it stays sharp. */
    protected fun qrBitmap(text: String, maxPx: Int): Bitmap {
        val m = Qr.encode(text)
        val n = m.size + 8
        val px = maxOf(1, maxPx / n)
        val bmp = Bitmap.createBitmap(n * px, n * px, Bitmap.Config.RGB_565)
        bmp.eraseColor(Color.WHITE)
        val canvas = Canvas(bmp)
        val paint = Paint().apply { color = Color.BLACK }
        for (r in m.indices) for (c in m.indices) if (m[r][c]) {
            canvas.drawRect(((c + 4) * px).toFloat(), ((r + 4) * px).toFloat(), ((c + 5) * px).toFloat(), ((r + 5) * px).toFloat(), paint)
        }
        return bmp
    }

    internal fun rounded(color: Int, radiusDp: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(radiusDp).toFloat() }

    /** Tarn's opaque controls: a stable surface and a clear, geometric focus outline. */
    internal fun glass(radiusDp: Int, focused: Boolean = false): Drawable = GradientDrawable().apply {
        setColor(if (focused) GLASS_FOCUSED else GLASS)
        cornerRadius = dp(radiusDp).toFloat()
        setStroke(dp(if (focused) 2 else 1), if (focused) TUNGSTEN else GLASS_EDGE)
    }

    /** Stable reading surface over moving video. */
    protected fun videoGlass(radiusDp: Int): Drawable = glass(radiusDp)

    protected fun pill(words: Int, icon: Int = 0): TextView = pill(getString(words), icon)

    /**
     * Compact 38 dp glass circle button for secondary title actions (+, ✓, ↺, ⓘ, trailer).
     * Focus brightens the glass face and icon without outlines or rings; [onFocus] lets the caller show a label below.
     */
    protected fun iconButton(
        symbol: String,
        description: String,
        iconRes: Int = 0,
        onFocus: (Boolean) -> Unit = {},
        action: () -> Unit,
    ): TextView = object : TextView(this) {
        private val d = resources.displayMetrics.density
        private val iconDrawable = if (iconRes != 0) getDrawable(iconRes)?.mutate() else null
        private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = TEXT
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = TEXT
            style = Paint.Style.FILL
        }
        private val glyphPath = Path()
        private val glyphBounds = Rect()

        override fun onDraw(canvas: Canvas) {
            if (iconDrawable != null) {
                val size = (18f * d).toInt()
                val left = (width - size) / 2
                val top = (height - size) / 2
                iconDrawable.setBounds(left, top, left + size, top + size)
                iconDrawable.setTint(currentTextColor)
                iconDrawable.draw(canvas)
                return
            }
            val s = text?.toString().orEmpty()
            if (s.isEmpty()) return
            val cx = width / 2f
            val cy = height / 2f
            strokePaint.color = currentTextColor
            fillPaint.color = currentTextColor
            when (s) {
                "+" -> {
                    val r = 5.5f * d
                    strokePaint.strokeWidth = 1.8f * d
                    canvas.drawLine(cx - r, cy, cx + r, cy, strokePaint)
                    canvas.drawLine(cx, cy - r, cx, cy + r, strokePaint)
                }
                "✓" -> {
                    strokePaint.strokeWidth = 1.8f * d
                    glyphPath.reset()
                    glyphPath.moveTo(cx - 5f * d, cy + 0.3f * d)
                    glyphPath.lineTo(cx - 1.5f * d, cy + 3.8f * d)
                    glyphPath.lineTo(cx + 5.2f * d, cy - 3.4f * d)
                    canvas.drawPath(glyphPath, strokePaint)
                }
                "↺" -> {
                    val r = 5.8f * d
                    strokePaint.strokeWidth = 1.6f * d
                    canvas.drawArc(RectF(cx - r, cy - r, cx + r, cy + r), -135f, 285f, false, strokePaint)
                    val ax = cx - 4.1f * d
                    val ay = cy - 4.1f * d
                    glyphPath.reset()
                    glyphPath.moveTo(ax, ay - 2.8f * d)
                    glyphPath.lineTo(ax, ay + 0.4f * d)
                    glyphPath.lineTo(ax + 3.2f * d, ay + 0.4f * d)
                    canvas.drawPath(glyphPath, strokePaint)
                }
                "ⓘ" -> {
                    val r = 6.8f * d
                    strokePaint.strokeWidth = 1.5f * d
                    canvas.drawCircle(cx, cy, r, strokePaint)
                    strokePaint.strokeWidth = 1.6f * d
                    canvas.drawLine(cx, cy - 0.5f * d, cx, cy + 3.6f * d, strokePaint)
                    canvas.drawCircle(cx, cy - 3.2f * d, 0.95f * d, fillPaint)
                }
                else -> {
                    paint.color = currentTextColor
                    paint.getTextBounds(s, 0, s.length, glyphBounds)
                    canvas.drawText(s, cx - glyphBounds.exactCenterX(), cy - glyphBounds.exactCenterY(), paint)
                }
            }
        }
    }.apply {
        text = symbol
        textSize = 18f
        setTextColor(TEXT_2)
        gravity = Gravity.CENTER
        includeFontPadding = false
        contentDescription = description
        isFocusable = true
        background = glass(ICON_BUTTON_H / 2)
        setOnFocusChangeListener { v, has ->
            v.background = glass(ICON_BUTTON_H / 2, has)
            setTextColor(if (has) TEXT else TEXT_2)
            v.grow(has, CHIP_GROW).start()
            onFocus(has)
        }
        setOnClickListener { action() }
        layoutParams = LinearLayout.LayoutParams(dp(ICON_BUTTON_H), dp(ICON_BUTTON_H))
    }

    /** Silver primary action; lake-blue focus fill, outline and scale. */
    protected fun pill(label: String, icon: Int = 0): TextView = text(label, SMALL, bold = true).apply {
        isFocusable = true
        gravity = Gravity.CENTER_VERTICAL
        minHeight = dp(BUTTON_H)
        setPadding(dp(if (icon != 0) 14 else 16), 0, dp(16), 0)
        compoundDrawablePadding = dp(6)
        if (icon != 0) setCompoundDrawablesRelative(getDrawable(icon)?.mutate()?.apply { setBounds(0, 0, dp(16), dp(16)) }, null, null, null)
        fun style(focused: Boolean) {
            background = GradientDrawable().apply {
                cornerRadius = dp(BUTTON_H / 2).toFloat()
                setColor(if (focused) TUNGSTEN else TEXT)
                if (focused) setStroke(dp(2), TarnPalette.DEEP_BLUE)
            }
            setTextColor(BASE)
            compoundDrawablesRelative[0]?.setTint(BASE)
            elevation = 0f
        }
        style(false)
        setOnFocusChangeListener { v, has ->
            style(has)
            v.grow(has, CHIP_GROW).start()
        }
    }

    /**
     * Focus growth for every control: scales by [by] and first lets its layout parents draw it past their bounds, so a
     * plain container can't cut the grown edge, rim and glow flat. It stops at the first scrolling view and leaves that
     * one alone: a scroller's clip is what hides rows and cards that have scrolled out, and unclipping it let Home's
     * rows slide over the title. Rows give their cards room to grow with their own padding.
     */
    protected fun View.grow(on: Boolean, by: Float = CARD_GROW): android.view.ViewPropertyAnimator {
        if (on) generateSequence(parent as? android.view.ViewGroup) { it.parent as? android.view.ViewGroup }
            .takeWhile { it !is android.widget.ScrollView && it !is android.widget.HorizontalScrollView && it !is android.widget.AbsListView }
            .forEach { it.clipChildren = false; it.clipToPadding = false }
        return animate().scaleX(if (on) by else 1f).scaleY(if (on) by else 1f).setDuration(FOCUS_MS)
            .setInterpolator(EASE_OUT)
    }

    /** Something arrives (a panel, an overlay, a line of text): [ENTER_MS], easing out. Chain the target values. */
    internal fun View.enter(ms: Long = ENTER_MS): android.view.ViewPropertyAnimator =
        animate().setDuration(ms).setInterpolator(EASE_OUT)

    /** Something leaves: [QUICK_MS], easing in, so it gets out of the way faster than it came. */
    protected fun View.exit(ms: Long = QUICK_MS): android.view.ViewPropertyAnimator =
        animate().setDuration(ms).setInterpolator(EASE_IN)

    /** A wrong PIN: a short side-to-side shake. */
    protected fun View.shake() {
        val d = dp(16).toFloat()
        animate().translationX(d).setDuration(FOCUS_MS / 3).setInterpolator(EASE_OUT).withEndAction {
            animate().translationX(-d).setDuration(FOCUS_MS / 2).withEndAction {
                animate().translationX(0f).setDuration(FOCUS_MS / 3).start()
            }.start()
        }.start()
    }

    protected fun chip(words: Int, selected: Boolean = false) = chip(getString(words), selected)

    /** A persistent choice: its dot remains after remote focus moves. */
    protected fun chip(label: String, selected: Boolean = false) = text(label, SMALL).apply {
        select(label, selected)
        isFocusable = true
        gravity = Gravity.CENTER
        minHeight = dp(CHIP_H)
        setPadding(dp(16), 0, dp(16), 0)
        background = glass(CHIP_H / 2)
        setOnFocusChangeListener { v, has -> v.background = glass(CHIP_H / 2, has); v.grow(has, CHIP_GROW).start() }
    }

    /** A chip that opens a list ([choose]): full-strength words, a chevron centred after them, solid glass. */
    protected fun dropdown(label: String) = chip(label).apply {
        setTextColor(TEXT)
        setCompoundDrawablesRelative(null, null, getDrawable(R.drawable.ic_chevron_down)?.mutate()?.apply {
            setTint(TEXT_2); setBounds(0, 0, dp(14), dp(14))
        }, null)
        compoundDrawablePadding = dp(4)
        setPadding(dp(16), 0, dp(12), 0)
    }

    /** Solid smoked glass over posters; focus lights the face without an outline. */
    protected fun listChipBackground(focused: Boolean) = GradientDrawable().apply {
        cornerRadius = dp(CHIP_H / 2).toFloat()
        setColor(if (focused) CHIP_FOCUSED else CHIP_REST)
        if (focused) setStroke(dp(2), TUNGSTEN)
    }

    /** A [chip]'s open state: the tungsten dot and full-strength words. */
    protected fun TextView.select(label: String, selected: Boolean) {
        isSelected = selected
        setTextColor(if (selected) TEXT else TEXT_2)
        text = if (!selected) label else android.text.SpannableString("•  $label").apply {
            setSpan(android.text.style.ForegroundColorSpan(TUNGSTEN), 0, 1, android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    protected fun caption(value: String, keepPrevious: Boolean = true, shade: Float = 0f) = text(value, SMALL).apply {
        setPadding(dp(12), dp(6), dp(12), dp(6))
        background = glassOver(this, 16, shade = shade, keepPrevious = keepPrevious)
    }

    /** "[OK] Play / pause": the key in a small box, then what it does. */
    protected fun keyHint(key: String, does: String) = LinearLayout(this).apply {
        gravity = Gravity.CENTER_VERTICAL
        addView(text(key, 9f, bold = true, color = BASE).apply {
            background = rounded(TEXT_2, 3)
            includeFontPadding = false
            setPadding(dp(4), dp(1), dp(4), dp(1))
        })
        addView(text(does, SMALL, color = TEXT_2).onArt(), LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(6) })
    }

    /** A quiet outlined tag beside a row's name ("Built-in", "ElfHosted", "THIS PROFILE"). */
    protected fun tag(label: String, color: Int = TEXT_3) = text(label, SMALL, color = color).apply {
        includeFontPadding = false
        maxLines = 1
        ellipsize = android.text.TextUtils.TruncateAt.END
        setPadding(dp(5), dp(2), dp(5), dp(2))
        background = GradientDrawable().apply { cornerRadius = dp(4).toFloat(); setStroke(dp(1), GLASS_EDGE) }
    }

    /** A hairline under a list row. */
    protected fun divider() = View(this).apply { setBackgroundColor(GLASS_EDGE) }

    /** One native vector lockup; decorative branding never takes D-pad focus. */
    protected fun brand(size: Float = WORDMARK) = LinearLayout(this).apply {
        gravity = Gravity.CENTER_VERTICAL
        addView(ImageView(context).apply {
            setImageResource(R.drawable.tarn_lockup)
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = getString(R.string.app_name)
            isFocusable = false
        }, LinearLayout.LayoutParams(dp((size * 4.2f).toInt()), dp((size * 1.3f).toInt())))
    }

    /** The source's tag beside a rating ("IMDb", "Letterboxd"), as tall as the letters. */
    protected fun ratingTag(source: String = "IMDb", sp: Float = SMALL) = text(source, sp, bold = true, color = TUNGSTEN).apply {
        background = GradientDrawable().apply {
            cornerRadius = dp(3).toFloat()
            setColor(GLASS)
            setStroke(dp(1), TUNGSTEN_RIM)
        }
        includeFontPadding = false
        setLineSpacing(0f, 1f)
        setPadding(dp(4), dp(1), dp(4), dp(1))
    }

    /** [ratings] as tag and number pairs, "IMDb 7.9  Letterboxd 3.9", into [row] after what it already holds. */
    protected fun addRatings(row: LinearLayout, ratings: List<Pair<String, String>>, tagSp: Float = SMALL, firstGap: Int = 10) =
        ratings.forEachIndexed { i, (source, value) ->
            row.addView(ratingTag(source, tagSp), wrap().apply { marginStart = dp(if (i == 0) firstGap else 10) })
            row.addView(text(value, SMALL, color = TEXT_2).onArt(), wrap().apply { marginStart = dp(6) })
        }

    /** One line of typing (an addon address, an API key) on glass; OK on the keyboard or the button hands it over, trimmed. */
    protected fun askText(title: Int, action: Int, hint: String? = null, initial: String = "", done: (String) -> Unit) {
        val dialog = android.app.Dialog(this).apply { requestWindowFeature(android.view.Window.FEATURE_NO_TITLE) }
        val field = android.widget.EditText(this).apply {
            this.hint = hint
            setHintTextColor(TEXT_3)
            setTextColor(TEXT)
            textSize = BODY
            setSingleLine()
            setText(initial)
            imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_DONE
            background = glass(8)
            setPadding(dp(12), dp(8), dp(12), dp(8))
        }
        fun finish() { val typed = field.text.toString().trim(); dialog.dismiss(); done(typed) }
        dialog.setContentView(column(Gravity.START).apply {
            setPadding(dp(20), dp(20), dp(20), dp(20))
            background = glassOver(this, 14)
            addView(text(title, BODY, bold = true))
            addView(field, LinearLayout.LayoutParams(-1, dp(38)).apply { topMargin = dp(14) })
            addView(LinearLayout(context).apply {
                gravity = Gravity.END
                addView(chip(R.string.action_cancel).apply { setOnClickListener { dialog.dismiss() } })
                addView(pill(action).apply { setOnClickListener { finish() } },
                    LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(10) })
            }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) })
        })
        dialog.show()
        dialog.window?.apply { setBackgroundDrawable(android.graphics.drawable.ColorDrawable(0)); setLayout(dp(400), -2); setDimAmount(0.6f) }
        field.setOnEditorActionListener { _, _, _ -> finish(); true }
        field.requestFocus()
    }

    private var phoneEntry: PhoneEntry? = null

    /**
     * Text too long for a remote (an API key), sent from a phone: a QR opens a one-box page served by the TV itself on
     * the home network (PhoneEntry). "Type it instead" falls back to [askText], as does a TV with no network address.
     */
    protected fun askOnPhone(title: Int, initial: String = "", done: (String) -> Unit) {
        val dialog = android.app.Dialog(this).apply { requestWindowFeature(android.view.Window.FEATURE_NO_TITLE) }
        val entry = runCatching {
            PhoneEntry({ saved ->
                phoneEntryPage(getString(title), getString(R.string.phone_page_label), getString(R.string.phone_page_send),
                    if (saved) getString(R.string.phone_page_saved) else null)
            }) { typed -> main.post { if (dialog.isShowing) dialog.dismiss(); done(typed) } }
        }.getOrNull()
        val url = entry?.url ?: run { entry?.close(); return askText(title, R.string.action_ok, initial = initial, done = done) }
        phoneEntry?.close()
        phoneEntry = entry
        val back = currentFocus // the row that opened it, so the remote stays there when the phone sends the text
        dialog.setOnDismissListener {
            if (phoneEntry === entry) phoneEntry = null
            entry.close()
            back?.requestFocus()
        }
        val typeInstead = pill(R.string.phone_entry_type).apply {
            setOnClickListener { dialog.dismiss(); askText(title, R.string.action_ok, initial = initial, done = done) }
        }
        dialog.setContentView(column(Gravity.CENTER,
            text(title, BODY, bold = true),
            text(R.string.phone_entry_scan, SMALL, color = TEXT_2).apply { gravity = Gravity.CENTER }.marginTop(8),
            ImageView(this).apply {
                setImageBitmap(qrBitmap(url, dp(180)))
                background = rounded(TEXT, 12)
                setPadding(dp(6), dp(6), dp(6), dp(6))
            }.marginTop(16),
            text(url, SMALL, color = TEXT_3).marginTop(10),
            LinearLayout(this).apply {
                gravity = Gravity.CENTER
                addView(chip(R.string.action_cancel).apply { setOnClickListener { dialog.dismiss() } })
                addView(typeInstead, LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(10) })
            }.marginTop(16),
        ).apply {
            setPadding(dp(24), dp(22), dp(24), dp(20))
            background = glassOver(this, 14)
        })
        dialog.show()
        dialog.window?.apply { setBackgroundDrawable(android.graphics.drawable.ColorDrawable(0)); setLayout(dp(420), -2); setDimAmount(0.6f) }
        typeInstead.requestFocus()
    }

    /**
     * Sends the saved crash (Crashes.send) and says whether it went. Home asks after a crash; Settings › About offers it
     * until it is sent. Off the main thread: the worker files a GitHub issue, which takes a second or two.
     */
    protected fun sendReport(done: () -> Unit = {}) = background({ Crashes.send(applicationContext) }) { result ->
        if (isFinishing) return@background
        choose(getString(if (result.isSuccess) R.string.report_sent_title else R.string.report_failed_title),
            listOf(getString(R.string.action_ok)),
            getString(if (result.isSuccess) R.string.report_sent_desc else R.string.report_failed_desc)) {}
        done()
    }

    /** Null animates loading; for countdowns set progress to fraction × max as time changes. */
    protected fun ring(fraction: Float? = null): ProgressBar = object : ProgressBar(this, null,
        // A countdown needs a style that keeps its progress; the default one is indeterminate-only and reads 0.
        if (fraction == null) android.R.attr.progressBarStyle else android.R.attr.progressBarStyleHorizontal) {
        private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = dp(2).toFloat()
            strokeCap = Paint.Cap.ROUND
        }

        override fun onDraw(canvas: Canvas) {
            if (fraction == null) return super.onDraw(canvas)
            val inset = stroke.strokeWidth / 2
            val bounds = RectF(inset, inset, width - inset, height - inset)
            stroke.color = PROGRESS_TRACK
            canvas.drawArc(bounds, 0f, 360f, false, stroke)
            stroke.color = TUNGSTEN
            canvas.drawArc(bounds, -90f, progress.toFloat() / max * 360f, false, stroke)
        }
    }.apply {
        require(fraction == null || (fraction.isFinite() && fraction in 0f..1f))
        isIndeterminate = fraction == null
        indeterminateTintList = android.content.res.ColorStateList.valueOf(TUNGSTEN)
        max = 1000
        if (fraction != null) progress = (fraction * max).toInt()
    }

    /** On-screen progress overlay: dark veil with a tungsten ring and status message in the center. */
    protected fun loadingOverlay(statusText: String = getString(R.string.finding_sources)): Pair<FrameLayout, TextView> {
        val label = text(statusText, BODY, color = TEXT_2).onArt()
        val veil = FrameLayout(this).apply {
            visibility = View.GONE
            isFocusable = true
            isClickable = true
            addView(View(context).apply { setBackgroundColor(0x80000000.toInt()) }, FrameLayout.LayoutParams(-1, -1))
            val center = column(Gravity.CENTER_HORIZONTAL).apply {
                addView(ring(), LinearLayout.LayoutParams(dp(40), dp(40)))
                addView(label, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(12) })
            }
            addView(center, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        }
        return veil to label
    }

    /** One high-contrast list-row focus treatment across settings, episodes, sources and menus. */
    protected fun View.rowFocus(radiusDp: Int = 8, rest: () -> android.graphics.drawable.Drawable? = { null }, also: (Boolean) -> Unit = {}) {
        isFocusable = true
        background = rest()
        setOnFocusChangeListener { v, has ->
            v.background = if (has) GradientDrawable().apply {
                setColor(ROW_FOCUSED)
                cornerRadius = dp(radiusDp).toFloat()
                setStroke(dp(2), TUNGSTEN)
            } else rest()
            also(has)
        }
    }

    /** Focus lifts and outlines a card without adding a heavy shadow. */
    internal fun View.lift(on: Boolean, scale: Float = CARD_GROW, shadow: Boolean = true) {
        foreground = if (on) GradientDrawable().apply {
            setColor(Color.TRANSPARENT)
            cornerRadius = dp(CARD_RADIUS).toFloat()
            setStroke(dp(2), TUNGSTEN)
        } else null
        if (android.os.Build.VERSION.SDK_INT >= 28 && !shadow) outlineSpotShadowColor = Color.TRANSPARENT
        grow(on, scale)
            .translationZ(if (on) (if (shadow) dp(CARD_LIFT).toFloat() else 1f) else 0f).start()
    }

    /** Screen artwork; retained for existing subclass contracts. */
    protected open val backdrop: ImageView? get() = null

    /**
     * Keep the shared API for callers, but use an opaque surface instead of sampling, blurring
     * and drawing backdrop bitmaps. No per-host listeners, background jobs or drawing-time paths.
     */
    @Suppress("UNUSED_PARAMETER")
    protected fun glassOver(host: View, radiusDp: Int, shade: Float = 0f, keepPrevious: Boolean = true): Drawable =
        glass(radiusDp)

    /** Existing artwork-change callbacks still maintain the readability shade. */
    protected fun refrost() = updateWindowShade()

    /** A thin rounded watched-so-far bar over a dark track. */
    internal fun progressBar(progress: Float, color: Int = TUNGSTEN) = LinearLayout(this).apply {
        val p = progress.coerceIn(0f, 1f)
        background = rounded(PROGRESS_TRACK, 2)
        outlineProvider = android.view.ViewOutlineProvider.BACKGROUND
        clipToOutline = true
        addView(View(context).apply { background = rounded(color, 2) }, LinearLayout.LayoutParams(0, -1, p))
        addView(View(context), LinearLayout.LayoutParams(0, -1, 1f - p))
    }

    protected fun timeLeft(duration: Long, position: Long): String? {
        if (position <= 0 || duration <= position) return null
        val minutes = (duration - position) / 60_000
        return when {
            minutes == 0L -> getString(R.string.time_left_under_minute)
            minutes >= 60 -> getString(R.string.time_left_hours, minutes / 60, minutes % 60)
            else -> getString(R.string.time_left_minutes, minutes)
        }
    }

    protected fun isInside(v: View, parent: View): Boolean = generateSequence(v) { it.parent as? View }.any { it === parent }

    /**
     * A short list to pick from (a menu, a genre, a yes or no), on glass with tungsten focus, in
     * place of Android's grey dialog. [checked] gets a tick (the choice in use); the remote starts on [focus].
     */
    protected fun choose(title: String, items: List<String>, message: String? = null, checked: Int = -1,
                         focus: Int = maxOf(checked, 0), widthDp: Int = if (items.size > 8) 300 else 340,
                         pick: (Int) -> Unit) {
        val dialog = android.app.Dialog(this).apply { requestWindowFeature(android.view.Window.FEATURE_NO_TITLE) }
        val list = column(Gravity.START).apply { setPadding(dp(12), dp(14), dp(12), dp(14)) }
        val words = column(Gravity.START, text(title, BODY, bold = true)).apply { setPadding(dp(16), 0, dp(16), dp(10)) }
        message?.let { words.addView(text(it, SMALL, color = TEXT_2).marginTop(6)) }
        list.addView(words, LinearLayout.LayoutParams(-1, -2))
        val rows = items.mapIndexed { i, label ->
            text(label, BODY).apply {
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(16), dp(10), dp(16), dp(10))
                if (i == checked) {
                    setTextColor(TUNGSTEN)
                    setCompoundDrawablesRelative(null, null, getDrawable(R.drawable.ic_check)?.mutate()?.apply {
                        setTint(TUNGSTEN); setBounds(0, 0, dp(16), dp(16))
                    }, null)
                }
                rowFocus()
                setOnClickListener { dialog.dismiss(); pick(i) }
                list.addView(this, LinearLayout.LayoutParams(-1, -2))
            }
        }
        // A long list (services, genres) stops short of the screen's edges and scrolls; the fading edge is also the
        // space ScrollView keeps past the focused row, so the next row always shows.
        val maxHeight = (resources.displayMetrics.heightPixels * 0.72f).toInt()
        dialog.setContentView(object : android.widget.ScrollView(this) {
            override fun onMeasure(w: Int, h: Int) =
                super.onMeasure(w, MeasureSpec.makeMeasureSpec(maxHeight, MeasureSpec.AT_MOST))
        }.apply {
            isVerticalScrollBarEnabled = false
            isVerticalFadingEdgeEnabled = true
            setFadingEdgeLength(dp(44))
            background = glassOver(this, 16, shade = FROST_READING)
            addView(list)
        })
        dialog.window?.apply {
            setBackgroundDrawable(android.graphics.drawable.ColorDrawable(0))
            setLayout(dp(widthDp), -2) // a long list of names needs less width
            setDimAmount(0.6f)
        }
        dialog.show()
        rows.getOrNull(focus)?.requestFocus()
    }

    /** Highlights come from CHANGELOG.md; the full release notes remain one remote action away. */
    protected fun whatsNew(version: String = Updates.mine(this), quiet: Boolean = false) {
        val changelog = runCatching { assets.open("CHANGELOG.md").bufferedReader().use { it.readText() } }.getOrDefault("")
        val debug = applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0
        val preview = if (debug) changesFor(changelog, "Unreleased") else emptyList()
        val changes = preview.ifEmpty { changesFor(changelog, version) }.ifEmpty { changesFor(changelog, "Unreleased") }
        if (changes.isEmpty()) {
            if (!quiet) choose(getString(R.string.whats_new), listOf(getString(R.string.action_ok)),
                getString(R.string.whats_new_no_notes, version)) {}
            return
        }

        val dialog = android.app.Dialog(this).apply { requestWindowFeature(android.view.Window.FEATURE_NO_TITLE) }
        val highlights = showcaseHighlights(changes)
        val highlightsName = getString(R.string.whats_new_highlights_short)
        val metrics = resources.displayMetrics

        fun panel(radius: Int, first: Int, last: Int, edge: Int) =
            GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(first, last)).apply {
                cornerRadius = dp(radius).toFloat()
                setStroke(dp(1), edge)
            }

        val root = column(Gravity.START).apply {
            setPadding(dp(44), dp(24), dp(44), dp(27))
        }
        val header = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            addView(brand(WORDMARK))
            addView(View(context).apply { setBackgroundColor(0x508CB9CF) }, LinearLayout.LayoutParams(dp(1), dp(25)).apply {
                marginStart = dp(12)
                marginEnd = dp(14)
            })
            addView(text(R.string.whats_new, BODY, bold = true))
            addView(View(context), LinearLayout.LayoutParams(0, 1, 1f))
            val label = if (preview.isNotEmpty()) getString(R.string.whats_new_preview)
                else getString(R.string.whats_new_version, version)
            addView(text(label, SMALL, color = TUNGSTEN))
        }
        root.addView(header, LinearLayout.LayoutParams(-1, dp(34)))
        root.addView(View(this).apply { setBackgroundColor(0x408CB9CF) }, LinearLayout.LayoutParams(-1, dp(1)).apply {
            topMargin = dp(4)
            bottomMargin = dp(14)
        })

        val page = LinearLayout(this)
        root.addView(page, LinearLayout.LayoutParams(-1, 0, 1f))
        val left = column(Gravity.START)
        val detailScroll = android.widget.ScrollView(this).apply {
            isFocusable = false
            isVerticalScrollBarEnabled = false
            addView(left, FrameLayout.LayoutParams(-1, -2))
        }
        page.addView(detailScroll, LinearLayout.LayoutParams(0, -1, 1.94f))

        val titleView = text("", 34f, serif = true).apply { includeFontPadding = false }
        val caption = text("", BODY, color = TEXT_2)
        val summary = text("", 16f, color = TEXT_2).apply {
            setPadding(dp(12), 0, 0, 0)
            background = LayerDrawable(arrayOf(rounded(0xA98CB9CF.toInt(), 0))).apply {
                setLayerGravity(0, Gravity.START or Gravity.FILL_VERTICAL)
                setLayerWidth(0, dp(1))
            }
        }
        val pathView = text("", SMALL, color = TEXT_2).apply {
            setPadding(dp(12), dp(8), dp(12), dp(8))
            background = panel(7, 0xFF1E3A54.toInt(), 0xFF0B1624.toInt(), 0x488CB9CF)
        }

        var hero = true
        val picture = object : ImageView(this) {
            override fun onMeasure(widthSpec: Int, heightSpec: Int) {
                val width = MeasureSpec.getSize(widthSpec)
                val art = drawable
                val height = if (art == null || art.intrinsicWidth <= 0) 0
                    else (width.toFloat() * art.intrinsicHeight / art.intrinsicWidth).toInt()
                setMeasuredDimension(width, minOf(height, (metrics.heightPixels * if (hero) 0.59f else 0.30f).toInt()))
            }
        }.apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            background = rounded(0xFF0B1624.toInt(), 7)
            clipToOutline = true
        }
        val frame = FrameLayout(this).apply {
            background = panel(10, 0xFF1E3A54.toInt(), 0xFF0B1624.toInt(), 0x7A8CB9CF)
            setPadding(dp(3), dp(3), dp(3), dp(3))
            addView(picture, FrameLayout.LayoutParams(-1, -2))
        }
        val handoff = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(24))
            background = panel(10, 0xFF1E3A54.toInt(), 0xFF0B1624.toInt(), 0x608CB9CF)
        }
        fun detail(view: View, top: Int, width: Int = -1) =
            left.addView(view, LinearLayout.LayoutParams(width, -2).apply { topMargin = dp(top) })
        detail(titleView, 0)
        detail(summary, 12)
        detail(frame, 12)
        detail(handoff, 16)
        detail(caption, 10)
        detail(pathView, 16, -2)

        val right = column(Gravity.START).apply {
            clipChildren = true
            background = panel(10, 0xFF1E3A54.toInt(), 0xFF0B1624.toInt(), 0x428CB9CF)
            setPadding(dp(11), dp(10), dp(11), dp(8))
        }
        page.addView(right, LinearLayout.LayoutParams(0, -1, 1f).apply { marginStart = dp(30) })
        val listScroll = android.widget.ScrollView(this).apply {
            isVerticalScrollBarEnabled = false
            isVerticalFadingEdgeEnabled = true
            setFadingEdgeLength(dp(12))
        }
        val list = column(Gravity.START).apply {
            clipChildren = true
            setPadding(0, 0, 0, dp(6))
        }
        listScroll.addView(list, FrameLayout.LayoutParams(-1, -2))
        right.addView(listScroll, LinearLayout.LayoutParams(-1, 0, 1f))
        right.addView(View(this).apply { setBackgroundColor(0x408CB9CF) }, LinearLayout.LayoutParams(-1, dp(1)))
        val gotIt = pill(R.string.action_got_it).apply { setOnClickListener { dialog.dismiss() } }
        val hints = LinearLayout(this).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            addView(keyHint("↑ ↓", getString(R.string.key_browse)))
            addView(keyHint(getString(R.string.key_back), getString(R.string.key_exit)), LinearLayout.LayoutParams(-2, -2).apply {
                marginStart = dp(8)
            })
        }
        right.addView(LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            addView(gotIt)
            addView(hints, LinearLayout.LayoutParams(0, -2, 1f))
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(7) })
        // Long translated hints may need the width beneath the button at Large text size.
        right.addOnLayoutChangeListener { _, l, _, r, _, oldL, _, oldR, _ ->
            if (r - l == oldR - oldL) return@addOnLayoutChangeListener
            hints.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
            gotIt.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
            val stacked = hints.measuredWidth + gotIt.measuredWidth > r - l - right.paddingStart - right.paddingEnd
            val footer = hints.parent as LinearLayout
            footer.orientation = if (stacked) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
            hints.layoutParams = if (stacked) LinearLayout.LayoutParams(-1, -2) else LinearLayout.LayoutParams(0, -2, 1f)
        }

        val thumbnails = HashMap<String, Bitmap?>()
        val heroCache = android.util.LruCache<String, Bitmap>(2)
        fun decode(path: String, sample: Int): Bitmap? = runCatching {
            assets.open(path).use {
                android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply {
                    inSampleSize = sample
                })
            }
        }.getOrNull()

        fun renderHandoff(example: PlayerExample?) {
            handoff.visibility = if (example == null) View.GONE else View.VISIBLE
            handoff.removeAllViews()
            if (example == null) return
            fun card() = LinearLayout(this).apply {
                gravity = Gravity.CENTER_VERTICAL
                minimumHeight = dp(68)
                setPadding(dp(12), dp(8), dp(12), dp(8))
                background = panel(8, 0xFF0B1624.toInt(), 0xFF0B1624.toInt(), 0x428CB9CF)
            }
            handoff.addView(card().apply { addView(brand(24f)) }, LinearLayout.LayoutParams(0, -2, 1f))
            handoff.addView(text(if (handoff.layoutDirection == View.LAYOUT_DIRECTION_RTL) "←" else "→", 27f, color = TUNGSTEN).apply {
                gravity = Gravity.CENTER
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            }, LinearLayout.LayoutParams(dp(42), -2))
            handoff.addView(card().apply {
                addView(ImageView(context).apply {
                    setImageBitmap(thumbnails.getOrPut(example.icon) { decode(example.icon, 2) })
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                }, LinearLayout.LayoutParams(dp(38), dp(38)).apply { marginEnd = dp(10) })
                addView(column(Gravity.START,
                    text(example.name, 16f, bold = true),
                    text(R.string.whats_new_example_player, 11f, color = TEXT_2),
                ), LinearLayout.LayoutParams(0, -2, 1f))
            }, LinearLayout.LayoutParams(0, -2, 1.15f))
        }

        val neutral = 0xFF1E3A54.toInt()
        fun show(change: Change) {
            val title = change.title
            titleView.text = title.ifEmpty { change.text }
            titleView.textSize = if (change.image != null) 34f else 40f
            val artPath = change.image ?: change.detailImage
            val bitmap = artPath?.let { path ->
                heroCache.get(path) ?: decode(path, if (change.image != null && metrics.widthPixels <= 1280) 2 else 1)
                    ?.also { heroCache.put(path, it) }
            }
            hero = change.image != null && bitmap != null
            val accent = if (hero) {
                change.image?.let { path -> thumbnails.getOrPut(path) { decode(path, 8) } }
                    ?.let { samplePixels(it, 12, 8) }?.let(::filmGlow)
            } else null
            val ambient = accent?.let { color ->
                Color.rgb((Color.red(color) + 112) / 4, (Color.green(color) + 82) / 4, (Color.blue(color) + 66) / 4)
            } ?: neutral
            root.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(ambient, 0xFF0B1624.toInt()))
            left.setPadding(0, dp(if (hero) 8 else if (bitmap != null || change.player != null) 32 else 56), 0, dp(4))
            picture.setImageBitmap(bitmap)
            picture.requestLayout()
            frame.visibility = if (bitmap == null) View.GONE else View.VISIBLE
            renderHandoff(change.player)
            val copy = if (title.isEmpty()) "" else changeLine(change.summary)
            summary.text = copy
            caption.text = copy
            summary.visibility = if (hero || copy.isEmpty()) View.GONE else View.VISIBLE
            caption.visibility = if (hero && copy.isNotEmpty()) View.VISIBLE else View.GONE
            val path = change.settingsPath
            pathView.visibility = if (path == null) View.GONE else View.VISIBLE
            if (path != null) {
                val steps = path.split(" → ")
                pathView.text = changeLine(steps.dropLast(1).joinToString("  ›  ", postfix = "  ›  ") + "**" + steps.last() + "**")
            }
            detailScroll.scrollTo(0, 0)
        }

        var first: View? = null
        var shown: View? = null
        fun section(name: String) {
            if (list.childCount > 0) list.addView(View(this).apply { setBackgroundColor(0x408CB9CF) },
                LinearLayout.LayoutParams(-1, dp(1)).apply { topMargin = dp(8); marginStart = dp(6); marginEnd = dp(6) })
            list.addView(text(name.uppercase(), 10f, bold = true, color = TEXT_2).apply {
                letterSpacing = 0.09f
                setPadding(dp(7), dp(8), dp(7), dp(4))
            })
        }

        fun row(change: Change, highlighted: Boolean) {
            val icon = change.player?.icon
            val thumbnailPath = icon ?: change.image
            val thumbnail = thumbnailPath?.takeIf { highlighted }?.let { path ->
                thumbnails.getOrPut(path) { decode(path, if (icon != null) 2 else 8) }
            }
            val row = LinearLayout(this).apply {
                gravity = Gravity.CENTER_VERTICAL
                isFocusable = true
                minimumHeight = dp(if (highlighted) 35 else 27)
                setPadding(dp(7), dp(4), dp(7), dp(4))
            }
            if (thumbnail != null) {
                row.addView(ImageView(this).apply {
                    setImageBitmap(thumbnail)
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    background = rounded(0xFF0B1624.toInt(), 3)
                    clipToOutline = true
                    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                }, LinearLayout.LayoutParams(dp(41), dp(23)).apply { marginEnd = dp(8) })
            }
            val name = text(change.title.ifEmpty { change.text }, 13f, color = TEXT_2)
            row.addView(name, LinearLayout.LayoutParams(0, -2, 1f))
            val selected = panel(6, 0xFF1E3A54.toInt(), 0xFF1E3A54.toInt(), 0xCF8CB9CF.toInt())
            fun activate() {
                if (shown != row) {
                    shown?.background = null
                    shown = row
                    row.background = selected
                    show(change)
                }
            }
            row.setOnFocusChangeListener { _, focused ->
                name.setTextColor(if (focused) TEXT else TEXT_2)
                if (focused) activate()
            }
            row.setOnClickListener { activate() }
            list.addView(row, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(2) })
            if (first == null) first = row
        }

        section(highlightsName)
        highlights.forEach { change -> row(change, true) }
        var group: String? = null
        changes.filter { it !in highlights }.forEach { change ->
            val name = change.group ?: getString(R.string.whats_new_group)
            if (name != group) { group = name; section(name) }
            row(change, false)
        }

        dialog.setContentView(root)
        dialog.show()
        dialog.window?.apply {
            setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
            setLayout(-1, -1)
        }
        first?.requestFocus()
    }

    /** One glass error card with a plain message and a next action. */
    protected fun failed(message: String, retry: () -> Unit) = column(Gravity.START,
        text(message, BODY, color = TEXT),
        pill(R.string.action_try_again).apply { setOnClickListener { retry() } }.marginTop(16),
    ).apply {
        setPadding(dp(18), dp(18), dp(18), dp(18))
        background = glassOver(this, 14, shade = FROST_READING)
    }

    // Shared Tarn design tokens. Legacy names remain for source compatibility. Screens keep their layout and content; the helpers above own component styling.
    // Inter is a variable font. Android 6 and 7 have no Typeface.Builder to pick its weight (calling it crashed Alder at
    // launch there), so they get Inter's default weight and a synthetic bold for semi-bold.
    private class Fonts(assets: android.content.res.AssetManager) {
        val medium: Typeface = if (android.os.Build.VERSION.SDK_INT >= 26)
            Typeface.Builder(assets, "fonts/inter.ttf").setFontVariationSettings("'wght' 500").setWeight(500).build()
        else Typeface.createFromAsset(assets, "fonts/inter.ttf")
        val semiBold: Typeface = if (android.os.Build.VERSION.SDK_INT >= 26)
            Typeface.Builder(assets, "fonts/inter.ttf").setFontVariationSettings("'wght' 600").setWeight(600).build()
        else Typeface.create(medium, Typeface.BOLD)
    }

    companion object {
        private var loadedFonts: Fonts? = null // main thread only
        const val PAD = 48
        const val TILE_RADIUS = 8
        const val GLASS_INSET = 28 // dp a glass panel sits in from the screen's edges
        const val FROST_W = 360 // px the art is shrunk to before the blur: wider is less blur (240 read as fog, 480 as smeared)
        const val FROST_READING = 0.35f
        const val FROST_DENSE = 0.55f
        const val HERO_W = 520 // dp: a title's block on Home and its page, half the screen so the story reads in full lines
        const val BUTTON_H = 34
        const val ICON_BUTTON_H = 38
        const val CHIP_H = 24 // the mocks' 46–48 px chips
        const val CARD_GROW = 1.06f
        const val GRID_GROW = 1.05f
        const val CHIP_GROW = 1.04f // a wide chip grown as much as a card filled the gap to its neighbour
        const val CARD_LIFT = 8

        // Motion (design/DESIGN_SYSTEM.md "Motion"). Screens use these, never a number: things arrive easing out, leave
        // faster easing in, and focus settles with a small overshoot. Only alpha and transforms move: this TV's GPU
        // has ~4 ms a frame to spare (issue 17). Android's animation scale (and Remove animations) shortens all of them.
        const val FOCUS_MS = 150L // focus moves, small state changes
        const val QUICK_MS = 180L // something leaves
        const val ENTER_MS = 240L // a panel, overlay or line arrives
        const val PAGE_MS = 300L // a page's content changes; screens open and close
        const val IDLE_MS = 400L // the UI dims or comes back
        const val ART_MS = 240L // a backdrop crossfades
        const val LIGHTS_MS = 240L // first art after launch: the lights rise
        const val PUSH_IN_MS = 20_000L // the backdrop's slow push-in
        const val PUSH_IN = 1.03f
        const val ARRIVE = 1.0f // a title page's art starts this close and settles back to 1
        val EASE_OUT: android.animation.TimeInterpolator = android.view.animation.DecelerateInterpolator(1.5f)
        val EASE_IN: android.animation.TimeInterpolator = android.view.animation.AccelerateInterpolator(1.5f)
        val SETTLE: android.animation.TimeInterpolator = android.view.animation.OvershootInterpolator(1.2f)
        // Spacing, everywhere rows of pictures appear: between cards, from a row's heading to its cards (plus room for
        // the focused card to grow), and above a heading, so each heading belongs to the row under it.
        const val CARD_GAP = 14
        const val CARD_GAP_RAIL = 16
        const val CARD_RADIUS = 6
        const val POSTER_W = 88
        const val POSTER_H = 132
        const val HEADING_GAP = 24
        const val SECTION_GAP = 32
        const val ROW_H = 42 // one-line list row (Settings)
        const val ROW_H2 = 48 // two-line list row (name over what it does)
        const val PANEL_W = 0.573f // share of the screen a list panel takes, beside its side note
        const val DOT = "  ·  "

        const val WORDMARK = 22f // lockup sizing unit
        const val SERIF_HERO = 38f
        const val SERIF_TITLE = 28.5f
        const val SERIF_NAME = 19f
        const val BODY = 14.5f
        const val SMALL = 12.5f
        const val CAPS = SMALL
        const val CODE = 36f
        val LEADING = mapOf(SERIF_HERO to 40f, SERIF_TITLE to 30f, SERIF_NAME to 21f, BODY to 20f, SMALL to 17f, CODE to 40f)

        const val BASE = TarnPalette.BLACK
        const val CARD_PLACEHOLDER = TarnPalette.MIDNIGHT
        const val CARD_DIM = 0.45f
        const val GRID_DIM = 0.25f
        const val CARD_CONTINUE_DIM = 0.45f
        const val TEXT = TarnPalette.SILVER
        const val TEXT_2 = TarnPalette.SECONDARY
        const val TEXT_3 = TarnPalette.MUTED
        const val TUNGSTEN = TarnPalette.LAKE_BLUE
        const val TUNGSTEN_RIM = TarnPalette.LAKE_BLUE
        const val TUNGSTEN_GLOW = 0x00000000
        const val GLASS = TarnPalette.MIDNIGHT
        const val GLASS_FOCUSED = TarnPalette.DEEP_BLUE
        const val GLASS_EDGE = TarnPalette.SLATE_BLUE
        const val GLASS_HIGHLIGHT = TarnPalette.LAKE_BLUE
        const val VIDEO_GLASS_BASE = TarnPalette.MIDNIGHT
        const val VIDEO_CONTROL_BASE = 0xD90B1624.toInt()
        const val ROW_FOCUSED = TarnPalette.DEEP_BLUE
        const val CHIP_REST = TarnPalette.MIDNIGHT
        const val CHIP_FOCUSED = TarnPalette.DEEP_BLUE
        const val PROGRESS_TRACK = TarnPalette.TRACK
        internal val pool = Executors.newFixedThreadPool(6)
    }
}

/** One changelog entry and the "### " heading it sits under (New, Easier to use, Fixes), null above the first. */
internal class Change(
    val group: String?,
    val text: String,
    val spotlight: Boolean = false,
    val image: String? = null,
    val detailImage: String? = null,
    val player: PlayerExample? = null,
) {
    /** The bold lead-in title from **Title.**, without markdown marks or trailing period. */
    val title: String get() = Regex("""\*\*(.+?)\*\*""").find(text)?.groupValues?.get(1)?.trimEnd('.').orEmpty()

    /** The description after the bold lead-in title, keeping markdown marks for changeLine(). */
    val description: String get() = text.replaceFirst(Regex("""^\s*-\s*"""), "")
        .replaceFirst(Regex("""^\s*\*\*(.+?)\*\*\.?\s*"""), "").trim()

    private val path get() = changeSettingsPath.find(description)
    val settingsPath: String? get() = path?.groupValues?.get(1)
    val summary: String get() = path?.let { description.substring(0, it.range.first).trimEnd() } ?: description
}

internal data class PlayerExample(val name: String, val icon: String)

private val changeSettingsPath = Regex("""(?:^|(?<=\.)\s+)\*\*((?:Settings|Audio & subtitles) → [^*]+)\*\*\.?$""")

/** Spotlight markers set the short first view. Older changelogs fall back to their first seven entries. */
internal fun showcaseHighlights(changes: List<Change>): List<Change> =
    changes.filter { it.spotlight }.ifEmpty { changes.take(7) }

/** The entries under "## [version]" in CHANGELOG.md, without their "- "; empty when that version has no section. */
internal fun changesFor(changelog: String, version: String): List<Change> {
    val lines = changelog.lines()
    val start = lines.indexOfFirst { it.trim() == "## $version" }.takeIf { it >= 0 } ?: return emptyList()
    var group: String? = null
    var spotlight = false
    var image: String? = null
    var detailImage: String? = null
    var player: PlayerExample? = null
    val marker = Regex("""^<!--\s*Spotlight\s*(?::\s*(\S+))?\s*-->$""")
    val detailMarker = Regex("""^<!--\s*Detail:\s*(\S+)\s*-->$""")
    val playerMarker = Regex("""^<!--\s*Player:\s*(.+?)\s+(\S+)\s*-->$""")
    return lines.drop(start + 1).takeWhile { !it.startsWith("## ") }.mapNotNull { line ->
        val spot = marker.find(line.trim())
        val detail = detailMarker.find(line.trim())
        val example = playerMarker.find(line.trim())
        when {
            line.startsWith("### ") -> {
                group = line.removePrefix("### ").trim()
                spotlight = false; image = null; detailImage = null; player = null
                null
            }
            spot != null -> { spotlight = true; image = spot.groupValues[1].ifEmpty { null }; null }
            detail != null -> { detailImage = detail.groupValues[1]; null }
            example != null -> { player = PlayerExample(example.groupValues[1], example.groupValues[2]); null }
            line.startsWith("- ") -> Change(group, line.removePrefix("- ").trim(), spotlight, image, detailImage, player)
                .also { spotlight = false; image = null; detailImage = null; player = null }
            else -> null
        }
    }
}

/** A changelog entry as it reads on screen: **bold** in bold, `code` and the other marks left out. */
internal fun changeLine(change: String): CharSequence {
    val out = android.text.SpannableStringBuilder()
    Regex("""\*\*(.+?)\*\*|`(.+?)`""").let { marks ->
        var at = 0
        marks.findAll(change).forEach { m ->
            out.append(change, at, m.range.first)
            val bold = m.groupValues[1]
            if (bold.isNotEmpty()) {
                val start = out.length
                out.append(bold)
                out.setSpan(android.text.style.StyleSpan(Typeface.BOLD), start, out.length, 0)
            } else out.append(m.groupValues[2])
            at = m.range.last + 1
        }
        out.append(change, at, change.length)
    }
    return out
}
