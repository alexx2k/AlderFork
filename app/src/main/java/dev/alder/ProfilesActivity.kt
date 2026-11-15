package dev.alder

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextClock
import android.widget.TextView

// Profile picker, Stremio sign-in, and setting up Watchly.
// The app starts here; with a single profile it goes straight on to Home.
class ProfilesActivity : Screen() {
    // The sign-in code being waited on; anything else stops its polling loop.
    private var waitingCode: String? = null
    private var signingIn = false
    private var relinkLocalId: String? = null
    private var draftName = ""
    private var draftColor = Profiles.COLORS[0]
    private var pickerGeneration = 0
    private var avatarUpload: AvatarUpload? = null
    private var avatarUploadInterrupted = false
    private var galleryScrollY = 0
    private var signInGeneration = 0
    private var nameInput: EditText? = null
    // Where Back goes from the profile menu's screens (PIN, rename); null elsewhere.
    private var backTo: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val profiles = Profiles.all(this)
        // Home found this profile signed out: straight to its sign-in, the profile and its settings kept.
        // The activity is exported, so the extra is untrusted: enter() still asks for the PIN, and a profile that
        // isn't signed out just opens.
        val again = intent.getStringExtra("signIn")?.let { id -> profiles.firstOrNull { it.id == id } }
        when {
            again != null -> enter(again)
            profiles.isEmpty() -> showName()
            profiles.size == 1 && !intent.getBooleanExtra("pick", false) -> enter(profiles[0])
            else -> showPicker()
        }
    }

    override fun onDestroy() {
        waitingCode = null
        stopAvatarUpload()
        AvatarImages.stopPrefetch()
        super.onDestroy()
    }

    // A Home-button exit must also close the LAN server; on return the expired
    // QR screen is replaced by the profile picker rather than showing a dead link.
    override fun onStop() {
        if (avatarUpload != null) {
            avatarUploadInterrupted = true
            stopAvatarUpload()
        }
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        if (avatarUploadInterrupted) {
            avatarUploadInterrupted = false
            showPicker()
        }
    }

    @Deprecated("Android back callback")
    override fun onBackPressed() {
        backTo?.let { return it() }
        if (signingIn) showName() else super.onBackPressed()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val input = nameInput
        if (input != null && !input.hasFocus() && event.action == KeyEvent.ACTION_DOWN) {
            if (event.keyCode == KeyEvent.KEYCODE_DEL) {
                if (input.length() > 0) input.text.delete(input.length() - 1, input.length())
                return true
            }
            val character = event.unicodeChar.takeIf { it in 32..126 }?.toChar()
            if (character != null) { input.text.append(character); return true }
        }
        return super.dispatchKeyEvent(event)
    }

    /** Opens a profile, asking for its PIN first when it has one; a signed-out one signs in again first. */
    private fun enter(p: Profile) = withPin(p) {
        val owner = Profiles.accountOwner(this, p)
        when {
            owner == null -> choose(getString(R.string.profiles_missing_owner),
                listOf(getString(R.string.action_ok)), getString(R.string.profiles_missing_owner_desc)) {}
            Profiles.signedOut(this, p.id) -> {
                relinkLocalId = p.id.takeIf { p.libraryMode == LibraryMode.LOCAL }
                showSignIn(owner.name, owner)
            }
            else -> openHome(p)
        }
    }

    private fun openHome(profile: Profile) {
        Profiles.setActive(this, profile.id)
        val home = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        // Opened from the Google TV home's Continue Watching: Home, with that title's page on top of it.
        // A fresh task, so an app already open in the background doesn't end up with two Homes.
        if (intent.hasExtra("id")) startActivities(arrayOf(home,
            Intent(intent).setClass(this, DetailsActivity::class.java).setFlags(0)))
        else startActivity(home)
        finish()
    }

    // ---------- who's watching ----------

    private fun showPicker() {
        stopAvatarUpload()
        AvatarImages.stopPrefetch()
        // Opened from inside a profile (Switch profile, Manage profiles): Back returns to it instead of leaving Alder.
        val current = Profiles.active(this)?.takeIf { intent.getBooleanExtra("pick", false) }
        backTo = current?.let { { openHome(it) } }
        nameInput = null
        // Left a sign-in: stop its polling, or approving the abandoned code would still change the profile.
        signingIn = false
        waitingCode = null
        relinkLocalId = null
        ++pickerGeneration
        val profiles = Profiles.all(this)
        // Temporary flat-black test mode: no faded film/series banner behind profiles.
        val selected = profiles.firstOrNull { it.id == Profiles.active(this)?.id } ?: profiles.first()
        // Top-aligned, so Add (no "last watched" line) sits level with the portraits; padding above for the 10% lift.
        val tiles = LinearLayout(this).apply {
            gravity = Gravity.CENTER_HORIZONTAL or Gravity.TOP; clipChildren = false; clipToPadding = false
            setPadding(0, dp(LIFT_ROOM), 0, 0)
        }
        profiles.forEach { p ->
            val signedOut = Profiles.signedOut(this, p.id).takeIf { it }
                ?.let { text(R.string.profiles_sign_in_again, SMALL, color = TUNGSTEN).apply { gravity = Gravity.CENTER } }
            tiles.addView(tile(p, signedOut) {}.apply {
                setOnClickListener { enter(p) }
                setOnLongClickListener { showMenu(p); true }
            }, LinearLayout.LayoutParams(dp(124), -2).apply { marginStart = dp(10); marginEnd = dp(10) })
        }
        if (profiles.size < Profiles.MAX) {
            tiles.addView(tile(null, null) {}.apply { setOnClickListener { showName() } },
                LinearLayout.LayoutParams(dp(124), -2).apply { marginStart = dp(10); marginEnd = dp(10) })
        }
        val content = FrameLayout(this).apply {
            addView(brand(), FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START).apply {
                leftMargin = dp(PAD); topMargin = dp(31)
            })
            addView(TextClock(this@ProfilesActivity).apply {
                format12Hour = "h:mm a"; format24Hour = "HH:mm"; textSize = SMALL; setTextColor(TEXT_2)
            }, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.END).apply {
                rightMargin = dp(PAD); topMargin = dp(39)
            })
            addView(text(R.string.profiles_whos_here, 38f, serif = true).onArt().apply { gravity = Gravity.CENTER },
                FrameLayout.LayoutParams(-1, -2, Gravity.TOP).apply { topMargin = dp(118) })
            addView(tiles, FrameLayout.LayoutParams(-1, -2, Gravity.TOP).apply { topMargin = dp(190 - LIFT_ROOM) })
            addView(chip(R.string.manage_profiles).apply {
                setOnClickListener {
                    choose(getString(R.string.manage_profiles), profiles.map { it.name }) { i -> showMenu(profiles[i]) }
                }
            }, FrameLayout.LayoutParams(-2, dp(30), Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = dp(50) })
            addView(keyHint(getString(R.string.profiles_hold_ok), getString(R.string.profiles_hold_ok_does)),
                FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = dp(20) })
        }
        // Avoid Screen.setWindowed(): it layers translucent gradients over the entire UI.
        content.setBackgroundColor(Color.BLACK)
        setContentView(content)
        tiles.getChildAt(profiles.indexOf(selected)).requestFocus()
    }

    private fun tile(profile: Profile?, last: TextView?, focused: () -> Unit): View {
        val add = profile == null
        val face = text(if (add) "+" else profile?.name?.take(1)?.uppercase().orEmpty(), if (add) 42f else 48f,
            serif = !add, color = if (add) TEXT_2 else BASE).apply {
            gravity = Gravity.CENTER
            alpha = 1f
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL; setColor(profile?.color ?: GLASS)
                if (add) setStroke(dp(1), GLASS_EDGE, dp(2).toFloat(), dp(3).toFloat())
            }
        }
        val circle = FrameLayout(this).apply {
            clipChildren = false
            addView(face, FrameLayout.LayoutParams(dp(100), dp(100), Gravity.CENTER))
            if (profile?.avatarUrl != null) ProfileAvatars.attach(this@ProfilesActivity, profile, this, dp(100), face)
        }
        // No ring: like the top bar, a dot under the name marks the remote's portrait.
        val dot = View(this).apply {
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(TUNGSTEN) }
            visibility = View.INVISIBLE
        }
        val name = text(if (add) getString(R.string.action_add) else profile?.name.orEmpty().replaceFirstChar { it.titlecase() } + if (profile?.pin != null) "  🔒" else "",
            BODY, color = TEXT_2).apply { gravity = Gravity.CENTER; maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END }
        return column(Gravity.CENTER_HORIZONTAL).apply {
            addView(circle, LinearLayout.LayoutParams(dp(112), dp(112)))
            addView(name, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
            if (last != null) addView(last, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(3) })
            addView(dot, LinearLayout.LayoutParams(dp(5), dp(5)).apply { topMargin = dp(8); gravity = Gravity.CENTER_HORIZONTAL })
            isFocusable = true
            clipChildren = false
            setOnFocusChangeListener { _, has ->
                dot.visibility = if (has) View.VISIBLE else View.INVISIBLE
                circle.grow(has, 1.1f).start()
                name.setTextColor(if (has) TEXT else TEXT_2)
                if (has) focused()
            }
        }
    }

    // ---------- edit a profile ----------

    private fun showMenu(p: Profile) {
        val items = listOfNotNull(
            getString(R.string.profiles_avatar) to { withPin(p) { showAvatarOptions(p) } },
            getString(R.string.profiles_rename) to { withPin(p) { rename(p) } },
            getString(if (p.pin == null) R.string.profiles_set_pin else R.string.profiles_change_pin) to { withPin(p) { setPin(p) } },
            getString(R.string.profiles_colour) to { withPin(p) {
                choose(getString(R.string.profiles_portrait, p.name), listOf(R.string.colour_tungsten, R.string.colour_clay,
                    R.string.colour_sage, R.string.colour_lavender, R.string.colour_honey).map(::getString),
                    checked = Profiles.COLORS.indexOf(p.color)) { i ->
                    Profiles.update(this, p.id, color = Profiles.COLORS[i]); showPicker()
                }
            } },
            if (p.pin == null) null else getString(R.string.profiles_remove_pin) to {
                withPin(p) { Profiles.update(this, p.id, clearPin = true); showPicker() }
            },
            getString(R.string.profiles_remove) to { withPin(p) { showPicker(); confirmRemove(p) } },
        )
        choose(p.name, items.map { it.first }) { i -> items[i].second() }
    }


    /**
     * TV remote-friendly catalogue. Categories are alphabetical, then sorted seasons,
     * with the source's icon order preserved. Only visible portraits are decoded.
     */


    /** A gallery list row: only visible rows are made into Android views. */
    private sealed class AvatarGalleryRow {
        data class Heading(val label: String) : AvatarGalleryRow()
        data class Icons(val pictures: List<AvatarIcon>) : AvatarGalleryRow()
    }

    /** Keep the scrollable gallery fast, with Netflix Classics first within Netflix. */
    private fun avatarGalleryRows(
        icons: List<AvatarIcon>,
        serviceFilter: String? = null
    ): List<AvatarGalleryRow> = buildList {
        val byService = icons.filter { serviceFilter == null || it.service == serviceFilter }
            .groupBy { it.service }
        val priority = listOf("Netflix", "Disney+", "HBO Max", "Prime Video", "Crunchyroll")
        val providers = priority + byService.keys.filterNot { it in priority }.sorted()
        for (service in providers.distinct()) {
            val serviceIcons = byService[service] ?: continue
            add(AvatarGalleryRow.Heading(service))
            val groups = serviceIcons.groupBy { it.group }
            val sorted = groups.keys.sortedWith(String.CASE_INSENSITIVE_ORDER)
            val ordered = if (service == "Netflix")
                listOf("Netflix Classic Icons") + sorted.filterNot { it == "Netflix Classic Icons" }
                else sorted
            for (show in ordered) {
                val collection = groups[show] ?: continue
                add(AvatarGalleryRow.Heading(show))
                for ((season, pictures) in collection.groupBy { it.season }) {
                    if (season != "Collection") add(AvatarGalleryRow.Heading("    $season"))
                    pictures.chunked(7).forEach { add(AvatarGalleryRow.Icons(it)) }
                }
            }
        }
    }

    /** One extra choice before entering the large gallery. */
    private fun showAvatarOptions(profile: Profile) {
        choose(getString(R.string.profiles_avatar_title, profile.name), listOf(
            getString(R.string.profiles_avatar_upload),
            getString(R.string.profiles_avatar_choose),
            getString(R.string.profiles_avatar_initials)
        )) { selected ->
            when (selected) {
                0 -> showAvatarUpload(profile)
                1 -> showAvatarGallery(profile)
                2 -> {
                    Profiles.update(this, profile.id, clearAvatar = true)
                    showPicker()
                }
            }
        }
    }

    private fun stopAvatarUpload() {
        avatarUpload?.close()
        avatarUpload = null
    }

    /**
     * The TV temporarily hosts a private upload page on its LAN address.
     * Scanning the QR opens a phone file picker; a successful photo is saved
     * locally, the one-time server closes, and the profile picker returns.
     */
    private fun showAvatarUpload(profile: Profile) {
        stopAvatarUpload()
        AvatarImages.stopPrefetch()
        nameInput = null
        val generation = ++pickerGeneration
        backTo = {
            stopAvatarUpload()
            showPicker()
            showAvatarOptions(profile)
        }
        val session = runCatching {
            AvatarUpload(applicationContext, profile.id) { localUrl ->
                main.post {
                    if (generation != pickerGeneration || avatarUpload == null || isFinishing) return@post
                    stopAvatarUpload()
                    Profiles.update(this, profile.id, avatarUrl = localUrl)
                    showPicker()
                }
            }
        }.getOrNull()
        avatarUpload = session

        val content = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        content.addView(brand(), FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START).apply {
            leftMargin = dp(PAD); topMargin = dp(31)
        })
        val middle = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        middle.addView(text(getString(R.string.profiles_avatar_upload),
            SERIF_TITLE, serif = true).apply { gravity = Gravity.CENTER },
            LinearLayout.LayoutParams(-1, -2))
        middle.addView(text(getString(R.string.profiles_avatar_upload_scan),
            BODY, color = TEXT_2).apply { gravity = Gravity.CENTER },
            LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })

        if (session != null) {
            middle.addView(ImageView(this).apply {
                setImageBitmap(qrBitmap(session.url, dp(220)))
                setPadding(dp(7), dp(7), dp(7), dp(7))
                setBackgroundColor(Color.WHITE)
            }, LinearLayout.LayoutParams(dp(238), dp(238)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                topMargin = dp(18)
            })
            middle.addView(text(session.url, SMALL, color = TEXT_2).apply {
                gravity = Gravity.CENTER
            }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
            middle.addView(text(getString(R.string.profiles_avatar_upload_wifi),
                SMALL, color = TEXT_2).apply { gravity = Gravity.CENTER },
                LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
            middle.addView(text(getString(R.string.profiles_avatar_upload_waiting),
                SMALL, color = TUNGSTEN).apply { gravity = Gravity.CENTER },
                LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        } else {
            middle.addView(text(getString(R.string.profiles_avatar_upload_unavailable),
                BODY, color = TUNGSTEN).apply { gravity = Gravity.CENTER },
                LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(22) })
        }
        content.addView(middle, FrameLayout.LayoutParams(-1, -2, Gravity.CENTER).apply {
            leftMargin = dp(PAD); rightMargin = dp(PAD)
        })
        val back = chip(R.string.profiles_back).apply {
            setOnClickListener {
                stopAvatarUpload()
                showPicker()
                showAvatarOptions(profile)
            }
        }
        content.addView(back, FrameLayout.LayoutParams(-2, dp(32), Gravity.BOTTOM or Gravity.START).apply {
            leftMargin = dp(PAD); bottomMargin = dp(18)
        })
        setContentView(content)
        back.requestFocus()
    }

    /**
     * One continuous gallery organised alphabetically by show and then season.
     *
     * ListView recycles rows as the user scrolls. Unlike the previous ScrollView,
     * it never creates ~1,000 image/text views, and each portrait has exactly one
     * opaque circular ImageView (no fallback initials beneath transparent PNGs).
     */
    private fun showAvatarGallery(profile: Profile, serviceFilter: String? = null) {
        AvatarImages.stopPrefetch()
        val generation = ++pickerGeneration
        nameInput = null
        val goBack: () -> Unit = {
            if (serviceFilter == null) showPicker() else showAvatarGallery(profile)
        }
        backTo = goBack

        // Solid-black gallery for the performance test: no translucent show banner,
        // onboarding art, film overlay, side shade or edge vignette.
        val content = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        content.addView(text(getString(R.string.profiles_avatar_title, profile.name),
            SERIF_TITLE, serif = true), FrameLayout.LayoutParams(-1, dp(65), Gravity.TOP).apply {
            leftMargin = dp(PAD)
            topMargin = dp(28)
        })

        val gallery = object : android.widget.ListView(this) {
            // No animated scroll path: jump immediately to the requested offset/row.
            override fun smoothScrollBy(distance: Int, duration: Int) {
                scrollListBy(distance)
            }

            override fun smoothScrollToPosition(position: Int) {
                setSelection(position)
            }

            override fun smoothScrollToPosition(position: Int, boundPosition: Int) {
                setSelection(position)
            }

            override fun smoothScrollToPositionFromTop(position: Int, offset: Int, duration: Int) {
                setSelectionFromTop(position, offset)
            }
        }.apply {
            divider = null
            dividerHeight = 0
            isVerticalScrollBarEnabled = false
            itemsCanFocus = true
            descendantFocusability = android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS
            clipChildren = true
            clipToPadding = true
            setSelector(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
            setCacheColorHint(Color.TRANSPARENT)
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        content.addView(gallery, FrameLayout.LayoutParams(-1, -1).apply {
            topMargin = dp(98)
            bottomMargin = dp(65)
        })
        content.addView(chip(R.string.profiles_back).apply {
            setOnClickListener { goBack() }
        }, FrameLayout.LayoutParams(-2, dp(32), Gravity.BOTTOM or Gravity.START).apply {
            leftMargin = dp(PAD)
            bottomMargin = dp(18)
        })
        content.addView(chip(R.string.profiles_avatar_initials).apply {
            setOnClickListener {
                Profiles.update(this@ProfilesActivity, profile.id, clearAvatar = true)
                showPicker()
            }
        }, FrameLayout.LayoutParams(-2, dp(32), Gravity.BOTTOM or Gravity.END).apply {
            rightMargin = dp(PAD)
            bottomMargin = dp(18)
        })
        setContentView(content)

        background({
            val allIcons = AvatarCatalog.all(applicationContext)
            Pair(avatarGalleryRows(allIcons, serviceFilter), allIcons.map { it.service }.distinct())
        }) { outcome ->
            if (generation != pickerGeneration) return@background
            val data = outcome.getOrNull()
            val rows = data?.first
            if (rows.isNullOrEmpty()) {
                choose(getString(R.string.profiles_avatar_title, profile.name),
                    listOf(getString(R.string.action_ok)), getString(R.string.profiles_avatar_load_failed)) {}
                return@background
            }

            val services = data?.second.orEmpty()
            content.addView(chip(getString(R.string.profiles_avatar_filter,
                serviceFilter ?: getString(R.string.profiles_avatar_all))).apply {
                setOnClickListener {
                    val options = listOf(getString(R.string.profiles_avatar_all)) + services
                    choose(getString(R.string.profiles_avatar_filter_title), options,
                        checked = if (serviceFilter == null) 0 else services.indexOf(serviceFilter) + 1
                    ) { selected ->
                        showAvatarGallery(profile, if (selected == 0) null else services[selected - 1])
                    }
                }
            }, FrameLayout.LayoutParams(-2, dp(32), Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
                bottomMargin = dp(18)
            })

            class Cell(val holder: LinearLayout, val image: ImageView, val name: TextView,
                       var boundUrl: String? = null)
            class IconRow(val cells: List<Cell>)

            fun newRow(): LinearLayout {
                val row = LinearLayout(this@ProfilesActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    clipChildren = true
                    clipToPadding = true
                    setPadding(dp(38), 0, dp(38), 0)
                    descendantFocusability = android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS
                }
                val cells = (0 until 7).map {
                    val cell = LinearLayout(this@ProfilesActivity).apply {
                        orientation = LinearLayout.VERTICAL
                        gravity = Gravity.CENTER_HORIZONTAL
                        clipChildren = true
                    }
                    val image = AvatarPortraitImage(this@ProfilesActivity).apply {
                        scaleType = ImageView.ScaleType.CENTER_CROP
                        background = GradientDrawable().apply {
                            shape = GradientDrawable.OVAL
                            setColor(Color.BLACK)
                        }
                        alpha = 1f
                        clipToOutline = true
                        isFocusable = false
                    }
                    cell.addView(image, LinearLayout.LayoutParams(dp(88), dp(88)))
                    val label = text("", SMALL, color = TEXT_2).apply {
                        gravity = Gravity.CENTER
                        maxLines = 2
                        ellipsize = android.text.TextUtils.TruncateAt.END
                    }
                    cell.addView(label, LinearLayout.LayoutParams(-1, dp(35)).apply {
                        topMargin = dp(4)
                    })
                    // Opaque focus background instead of the usual translucent tint.
                    val focusedBackground = GradientDrawable().apply {
                        setColor(0xFF292929.toInt())
                        cornerRadius = dp(9).toFloat()
                    }
                    cell.isFocusable = true
                    cell.setBackgroundColor(Color.BLACK)
                    cell.setOnFocusChangeListener { view, hasFocus ->
                        view.background = if (hasFocus) focusedBackground
                            else android.graphics.drawable.ColorDrawable(Color.BLACK)
                    }
                    row.addView(cell, LinearLayout.LayoutParams(0, dp(134), 1f).apply {
                        marginEnd = dp(4)
                    })
                    Cell(cell, image, label)
                }
                row.tag = IconRow(cells)
                return row
            }

            gallery.adapter = object : android.widget.BaseAdapter() {
                override fun getCount() = rows.size
                override fun getItem(position: Int): Any = rows[position]
                override fun getItemId(position: Int) = position.toLong()
                override fun getViewTypeCount() = 2
                override fun getItemViewType(position: Int) =
                    if (rows[position] is AvatarGalleryRow.Heading) 0 else 1

                override fun isEnabled(position: Int) = rows[position] is AvatarGalleryRow.Icons

                override fun getView(position: Int, convertView: View?,
                                     parent: android.view.ViewGroup): View {
                    return when (val row = rows[position]) {
                        is AvatarGalleryRow.Heading -> {
                            val label = (convertView as? TextView)
                                ?: text("", BODY, bold = true).apply {
                                    setPadding(dp(40), dp(17), dp(15), dp(9))
                                    isFocusable = false
                                }
                            label.text = row.label
                            label
                        }

                        is AvatarGalleryRow.Icons -> {
                            val grid = (convertView as? LinearLayout) ?: newRow()
                            val cells = (grid.tag as IconRow).cells
                            for (index in cells.indices) {
                                val cell = cells[index]
                                val icon = row.pictures.getOrNull(index)
                                if (icon == null) {
                                    if (cell.boundUrl != null) {
                                        cell.holder.visibility = View.INVISIBLE
                                        cell.holder.isFocusable = false
                                        cell.holder.setOnClickListener(null)
                                        cell.name.text = ""
                                        cell.boundUrl = null
                                        AvatarImages.cancel(cell.image)
                                        cell.image.setImageDrawable(null)
                                    }
                                    continue
                                }
                                // Labels and listeners only change when a recycled cell
                                // represents a different icon. A detached row still
                                // rebinds its image so canceled requests can restart.
                                if (cell.boundUrl != icon.url) {
                                    cell.holder.visibility = View.VISIBLE
                                    cell.holder.isFocusable = true
                                    cell.name.text = icon.name
                                    cell.holder.contentDescription = "${icon.name}, ${icon.group}, ${icon.service}"
                                    cell.holder.setOnClickListener {
                                        Profiles.update(this@ProfilesActivity, profile.id, avatarUrl = icon.url)
                                        showPicker()
                                    }
                                    cell.boundUrl = icon.url
                                }
                                AvatarImages.bind(applicationContext, icon.url, cell.image, dp(100))
                            }
                            grid
                        }
                    }
                }
            }

            // Only prefetch one row immediately beyond the viewport, in the
            // direction of travel. Never queue the entire multi-service catalogue.
            var previousFirst = 0
            var movingDown = true
            var prefetchedRow = -1
            gallery.setOnScrollListener(object : android.widget.AbsListView.OnScrollListener {
                override fun onScrollStateChanged(
                    view: android.widget.AbsListView?, scrollState: Int
                ) = Unit

                override fun onScroll(
                    view: android.widget.AbsListView?,
                    firstVisibleItem: Int,
                    visibleItemCount: Int,
                    totalItemCount: Int
                ) {
                    if (visibleItemCount == 0) return
                    if (firstVisibleItem != previousFirst) movingDown = firstVisibleItem > previousFirst
                    previousFirst = firstVisibleItem
                    val visibleEnd = firstVisibleItem + visibleItemCount
                    val candidates = if (movingDown) visibleEnd until rows.size
                        else (firstVisibleItem - 1 downTo 0)
                    val next = candidates.firstOrNull { rows[it] is AvatarGalleryRow.Icons } ?: -1
                    if (next == prefetchedRow) return
                    prefetchedRow = next
                    val urls = (rows.getOrNull(next) as? AvatarGalleryRow.Icons)
                        ?.pictures?.map { it.url }.orEmpty()
                    AvatarImages.prefetchRow(applicationContext, urls, dp(100))
                }
            })

            val firstIcons = rows.indexOfFirst { it is AvatarGalleryRow.Icons }
            if (firstIcons >= 0) {
                gallery.setSelection(firstIcons)
                gallery.post {
                    if (generation != pickerGeneration) return@post
                    val row = gallery.getChildAt(firstIcons - gallery.firstVisiblePosition)
                    ((row as? LinearLayout)?.getChildAt(0))?.requestFocus()
                }
            }
        }
    }

    /** Runs [then] straight away, or once the profile's PIN is typed, so a locked profile can't be changed around it. */
    private fun withPin(p: Profile, then: () -> Unit) {
        val pin = p.pin ?: return then()
        askPin(getString(R.string.profiles_enter_pin, p.name), ::showPicker) { (it == pin).also { ok -> if (ok) then() } }
    }

    private fun setPin(p: Profile) {
        askPin(getString(R.string.profiles_choose_pin, p.name), ::showPicker) { first ->
            askPin(getString(R.string.profiles_pin_again), ::showPicker, getString(R.string.profiles_pin_mismatch)) { second ->
                (second == first).also { same ->
                    if (same) { Profiles.update(this, p.id, pin = first); showPicker() }
                }
            }
            true
        }
    }

    private fun rename(p: Profile) {
        ++pickerGeneration
        backTo = ::showPicker
        val previewName = text(p.name, BODY, bold = true).apply { gravity = Gravity.CENTER }
        val avatar = onboardingAvatar(p.name.firstOrNull()?.uppercase().orEmpty(), 100, p.color)
        val error = text("", SMALL, color = TUNGSTEN)
        val (name, keyboard, firstKey) = nameEntry(p.name) { typed ->
            previewName.text = typed
            avatar.text = typed.firstOrNull()?.uppercase().orEmpty()
            error.text = ""
        }
        val save = onboardingButton(getString(R.string.profiles_save))
        val go = {
            name.text.toString().trim().takeIf { it.isNotEmpty() }
                ?.let { Profiles.update(this, p.id, name = it); showPicker() }
                ?: run { error.text = getString(R.string.profiles_name_to_save) }
        }
        name.setOnEditorActionListener { _, _, _ -> go(); true }
        save.setOnClickListener { go() }
        val copy = column(Gravity.START,
            text(getString(R.string.profiles_rename_title, p.name), SERIF_TITLE, serif = true),
            text(R.string.profiles_rename_desc, BODY, color = TEXT_2).marginTop(4),
            name.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(38)).apply { topMargin = dp(16) } },
            keyboard.apply { layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) } },
            error.marginTop(5),
            save.marginTop(7),
        ).apply { gravity = Gravity.CENTER_VERTICAL }
        val preview = column(Gravity.CENTER, avatar, previewName.marginTop(16)).apply { gravity = Gravity.CENTER }
        setWindowed(onboardingFrame("", 0, 0, copy, preview, dp(65), 1.05f, 0.95f), onboardingBackdrop())
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
        firstKey.requestFocus()
    }

    /**
     * Four digit boxes for a TV remote: Up/Down turn the focused digit, Left/Right move between boxes, number keys
     * type and move on. OK (or the fourth number key) hands the PIN to [check]; false shakes the boxes and clears them.
     */
    private fun askPin(title: String, back: () -> Unit, errorMessage: String = getString(R.string.profiles_pin_wrong), check: (String) -> Boolean) {
        backTo = back
        val digits = IntArray(4) { -1 }
        var at = 0
        val boxes = List(4) {
            text("", 34f, bold = true).apply {
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(dp(64), dp(76)).apply { marginStart = dp(8); marginEnd = dp(8) }
            }
        }
        val row = LinearLayout(this).apply { gravity = Gravity.CENTER; isFocusable = true; boxes.forEach { addView(it) } }
        val error = text("", BODY, color = TEXT)
        fun draw() = boxes.forEachIndexed { i, b ->
            b.text = when {
                digits[i] < 0 -> ""
                i == at -> "${digits[i]}"
                else -> "•"
            }
            b.background = glass(14, i == at)
        }
        fun submit() {
            if (digits.any { it < 0 }) return
            if (check(digits.joinToString("") { "$it" })) return
            digits.fill(-1); at = 0; draw()
            error.text = errorMessage
            row.shake()
        }
        row.setOnKeyListener { _, code, event ->
            if (event.action != KeyEvent.ACTION_DOWN) return@setOnKeyListener false
            error.text = ""
            when (code) {
                KeyEvent.KEYCODE_DPAD_UP -> digits[at] = (digits[at] + 1).mod(10)
                KeyEvent.KEYCODE_DPAD_DOWN -> digits[at] = if (digits[at] <= 0) 9 else digits[at] - 1
                KeyEvent.KEYCODE_DPAD_LEFT -> at = maxOf(0, at - 1)
                KeyEvent.KEYCODE_DPAD_RIGHT -> if (digits[at] >= 0) at = minOf(3, at + 1)
                in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9 -> {
                    digits[at] = code - KeyEvent.KEYCODE_0
                    if (at < 3) at++ else { draw(); submit(); return@setOnKeyListener true }
                }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> { submit(); return@setOnKeyListener true }
                else -> return@setOnKeyListener false
            }
            draw()
            true
        }
        draw()
        val content = column(Gravity.CENTER_HORIZONTAL,
            text(title, SERIF_TITLE, bold = true, serif = true),
            row.marginTop(36),
            error.marginTop(12),
            text(R.string.profiles_pin_keys, SMALL, color = TEXT_2).marginTop(28),
        ).apply { gravity = Gravity.CENTER }
        setWindowed(content, onboardingBackdrop())
        row.requestFocus()
    }

    private fun confirmRemove(p: Profile) {
        if (Profiles.all(this).any { it.libraryMode == LibraryMode.LOCAL && it.accountOwnerId == p.id }) {
            choose(getString(R.string.profiles_remove_owner_blocked),
                listOf(getString(R.string.action_ok)), getString(R.string.profiles_remove_owner_blocked_desc)) {}
            return
        }
        val warning = if (p.libraryMode == LibraryMode.LOCAL)
            getString(R.string.profiles_remove_local_desc, p.name)
        else getString(R.string.profiles_remove_desc, p.name)
        choose(getString(R.string.profiles_remove_title, p.name), listOf(getString(R.string.action_cancel), getString(R.string.action_remove)),
            warning) { i ->
            if (i == 0) return@choose
            Profiles.remove(this, p.id)
            background({ Http.forget() }) {}
            // Best effort; the TV forgets the profile either way. A sign-in another profile still uses stays signed in.
            if (Profiles.all(this).none { it.authKey == p.authKey }) {
                ProgressSaves.forget(p.authKey)
                background({ Stremio.logout(p.authKey) }) {}
            }
            if (Profiles.all(this).isEmpty()) showName() else showPicker()
        }
    }

    // ---------- add a profile ----------

    private fun showName() {
        ++pickerGeneration
        backTo = if (Profiles.all(this).isEmpty()) null else ::showPicker
        signingIn = false
        waitingCode = null
        val first = Profiles.all(this).isEmpty()
        val previewName = text(draftName, BODY, bold = true).apply { gravity = Gravity.CENTER }
        val avatar = onboardingAvatar(draftName.firstOrNull()?.uppercase().orEmpty(), 100, draftColor)
        val error = text("", SMALL, color = TUNGSTEN)
        val (name, keyboard, firstKey) = nameEntry(draftName) { typed ->
            previewName.text = typed
            avatar.text = typed.firstOrNull()?.uppercase().orEmpty()
            error.text = ""
        }
        val next = onboardingButton(getString(R.string.profiles_continue))
        val go = {
            name.text.toString().trim().takeIf { it.isNotEmpty() }?.replaceFirstChar { it.titlecase() }
                ?.let { draftName = it; showAccountChoice(it) }
                ?: run { error.text = getString(R.string.profiles_name_to_continue) }
        }
        name.setOnEditorActionListener { _, _, _ -> go(); true }
        next.setOnClickListener { go() }
        val swatches = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val marks = mutableListOf<TextView>()
        Profiles.COLORS.forEachIndexed { index, color ->
            val mark = text(if (draftColor == color) "✓" else "", SMALL, bold = true, color = BASE).apply {
                gravity = Gravity.CENTER
                isFocusable = true
                fun face(focused: Boolean) = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL; setColor(color)
                    if (focused) setStroke(dp(2), TUNGSTEN)
                }
                background = face(false)
                setOnFocusChangeListener { view, focused -> view.background = face(focused) }
                setOnClickListener {
                    draftColor = color
                    avatar.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(color) }
                    marks.forEachIndexed { i, view -> view.text = if (i == index) "✓" else "" }
                }
            }
            marks += mark
            swatches.addView(mark, LinearLayout.LayoutParams(dp(30), dp(30)).apply { marginEnd = dp(8) })
        }
        val copy = column(Gravity.START,
            text(if (first) R.string.profiles_welcome else R.string.profiles_new, SERIF_TITLE, serif = true),
            text(R.string.profiles_name_colour, BODY, color = TEXT_2).marginTop(4),
            name.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(38)).apply { topMargin = dp(16) } },
            keyboard.apply { layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) } },
            caps(R.string.profiles_portrait_colour, TUNGSTEN).marginTop(13),
            swatches.marginTop(7),
            error.marginTop(5),
            next.marginTop(7),
        ).apply { gravity = Gravity.CENTER_VERTICAL }
        val preview = column(Gravity.CENTER,
            avatar,
            previewName.marginTop(16),
        ).apply { gravity = Gravity.CENTER }
        val content = onboardingFrame(step(1, if (first) 2 else 3), 1, if (first) 2 else 3, copy, preview, dp(65), 1.05f, 0.95f)
        setWindowed(content, onboardingBackdrop())
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
        firstKey.requestFocus()
    }

    /** Choose shared local history by default, or allow the original separate Stremio sign-in. */
    private fun showAccountChoice(name: String) {
        val owners = Profiles.all(this).filter { it.libraryMode == LibraryMode.STREMIO }
        if (owners.isEmpty()) return showSignIn(name)

        choose(getString(R.string.profiles_account_mode_title),
            listOf(getString(R.string.profiles_share_account), getString(R.string.profiles_separate_account)),
            getString(R.string.profiles_share_account_desc), focus = 0) { choice ->
            if (choice == 1) showSignIn(name)
            else if (owners.size == 1) createLocalProfile(name, owners.first())
            else choose(getString(R.string.profiles_select_account), owners.map { it.name }) { selected ->
                createLocalProfile(name, owners[selected])
            }
        }
    }

    private fun createLocalProfile(name: String, owner: Profile) {
        val profile = Profiles.addLocal(this, name, owner.id, draftColor)
        draftName = ""
        draftColor = Profiles.COLORS[0]
        showReady(profile)
    }

    /**
     * The name box and its remote keyboard: letters, a one-shot ⇧ (on while the box is empty, so names start with a
     * capital), space, ⌫ and the system keyboard. [changed] gets the text after every edit.
     */
    private fun nameEntry(initial: String, changed: (String) -> Unit): Triple<EditText, View, View> {
        val name = EditText(this).apply {
            hint = getString(R.string.profiles_your_name)
            textSize = BODY
            setTextColor(TEXT)
            setHintTextColor(TEXT_3)
            setPadding(dp(14), 0, dp(14), 0)
            background = glass(8)
            setOnFocusChangeListener { v, has -> v.background = glass(8, has) }
            setSingleLine()
            showSoftInputOnFocus = false
            imeOptions = EditorInfo.IME_ACTION_DONE
            setText(initial)
            setSelection(initial.length)
        }
        nameInput = name
        val keyboard = column(Gravity.START).apply {
            setPadding(dp(8), dp(8), dp(8), dp(8)); background = glass(10)
        }
        val keys = mutableListOf<TextView>()
        fun key(label: String, row: LinearLayout, width: Int = 1, action: () -> Unit) = text(label, SMALL, color = TEXT_2).apply {
            gravity = Gravity.CENTER
            rowFocus(6)
            setOnClickListener { action() }
            row.addView(this, LinearLayout.LayoutParams(0, -1, width.toFloat()).apply {
                if (row.childCount > 0) marginStart = dp(3)
            })
            keys += this
        }
        var upper = false
        val letterKeys = mutableListOf<TextView>()
        fun caps(on: Boolean) {
            upper = on
            letterKeys.forEach { it.text = if (on) it.text.toString().uppercase() else it.text.toString().lowercase() }
        }
        "abcdefghijklmnopqrstuvwxyz".chunked(6).forEach { letters ->
            keyboard.addView(LinearLayout(this).apply {
                letters.forEach { letter -> letterKeys += key(letter.toString(), this) {
                    val typed = if (upper) letter.uppercaseChar() else letter
                    if (upper) caps(false)
                    name.text.append(typed)
                } }
                // "yz" keeps the grid: empty cells fill the row instead of two keys stretched across it.
                repeat(6 - letters.length) { addView(View(context), LinearLayout.LayoutParams(0, -1, 1f).apply { marginStart = dp(3) }) }
            }, LinearLayout.LayoutParams(-1, dp(KEY_H)).apply { if (keyboard.childCount > 0) topMargin = dp(3) })
        }
        keyboard.addView(LinearLayout(this).apply {
            key("⇧", this) { caps(!upper) }
            key(getString(R.string.search_space).uppercase(), this, 3) { name.text.append(" ") }
            key("⌫", this) { if (name.length() > 0) name.text.delete(name.length() - 1, name.length()) }
            key("⌨", this) {
                name.showSoftInputOnFocus = true
                name.requestFocus()
                name.post { (getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                    .showSoftInput(name, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT) }
            }
        }, LinearLayout.LayoutParams(-1, dp(KEY_H)).apply { topMargin = dp(3) })
        caps(initial.isEmpty())
        name.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                if (s.isNullOrEmpty()) caps(true)
                changed(s?.toString().orEmpty())
            }
            override fun afterTextChanged(s: android.text.Editable?) = Unit
        })
        return Triple(name, keyboard, keys.first())
    }

    /** Sign-in with a code: for a new profile called [name], or for [again], a profile Stremio signed out. */
    private fun showSignIn(name: String, again: Profile? = null) {
        ++pickerGeneration
        nameInput = null
        backTo = if (again != null) ::showPicker else ::showName
        signingIn = true
        val request = ++signInGeneration
        val qr = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        val status = text(R.string.profiles_getting_code, SMALL, color = TEXT_2)
        val countdown = ring(1f)
        val codeTiles = (0 until 4).map {
            text("–", 36f, bold = true).apply {
                gravity = Gravity.CENTER
                background = glass(10)
            }
        }
        val codeRow = LinearLayout(this).apply {
            codeTiles.forEach { tile -> addView(tile, LinearLayout.LayoutParams(dp(52), dp(62)).apply {
                if (childCount > 0) marginStart = dp(7)
            }) }
        }
        val back = chip(R.string.profiles_back)
        back.setOnClickListener { waitingCode = null; if (again != null) showPicker() else showName() }
        val left = column(Gravity.CENTER,
            FrameLayout(this).apply {
                setPadding(dp(18), dp(18), dp(18), dp(18))
                background = rounded(TEXT, 12)
                addView(qr, FrameLayout.LayoutParams(-1, -1))
            }.apply { layoutParams = LinearLayout.LayoutParams(dp(236), dp(236)) },
            LinearLayout(this).apply {
                gravity = Gravity.CENTER_VERTICAL
                addView(onboardingAvatar(name.take(1).uppercase(), 26, again?.color ?: draftColor))
                addView(text(name.replaceFirstChar { it.titlecase() }, BODY, bold = true).apply { setPadding(dp(8), 0, 0, 0) })
            }.marginTop(14),
        ).apply {
            gravity = Gravity.CENTER
            setPadding(dp(15), dp(20), dp(15), dp(20))
            background = glass(14)
        }
        val steps = column(Gravity.START,
            text(if (again != null) R.string.profiles_sign_in_again else R.string.profiles_connect, 40f, serif = true).onArt(),
            text(getString(if (again != null) R.string.profiles_signed_out else R.string.profiles_scan, name), BODY).onArt().marginTop(10),
            text("", BODY, color = TEXT_2).onArt().apply {
                val line = getString(R.string.profiles_or_go_to, "link.stremio.com")
                val at = line.indexOf("link.stremio.com")
                text = android.text.SpannableString(line).apply {
                    setSpan(android.text.style.StyleSpan(android.graphics.Typeface.BOLD), at, at + 16, 0)
                    setSpan(android.text.style.ForegroundColorSpan(TEXT), at, at + 16, 0)
                }
            }.marginTop(22),
            codeRow.marginTop(8),
            LinearLayout(this).apply {
                gravity = Gravity.CENTER_VERTICAL
                addView(countdown, LinearLayout.LayoutParams(dp(20), dp(20)))
                addView(status, wrap().apply { marginStart = dp(9) })
            }.marginTop(17),
            // Two people approving on one phone sign each other out: switching accounts there can end the other's sign-in.
            text(R.string.profiles_sharing_phone, SMALL, color = TEXT_2).onArt().marginTop(24),
            text(R.string.profiles_new_to_stremio, SMALL, color = TEXT_3).onArt().marginTop(10),
        ).apply { gravity = Gravity.CENTER_VERTICAL }
        val first = Profiles.all(this).isEmpty()
        val total = if (again != null || first) 2 else 3
        val content = onboardingFrame(if (again != null) getString(R.string.profiles_step_sign_in) else step(2, total),
            if (again != null) 1 else 2, total, left, steps, dp(55), 0f, 1f, dp(300))
        content.addView(back, FrameLayout.LayoutParams(-2, dp(32), Gravity.BOTTOM or Gravity.START).apply {
            leftMargin = dp(PAD); bottomMargin = dp(40)
        })
        setWindowed(content, onboardingBackdrop())
        back.requestFocus()

        waitingCode = null
        var pollFailure: Failure? = null
        background({ Stremio.createLink() }) { result ->
            if (!signingIn || request != signInGeneration) return@background
            result.onSuccess { link ->
                qr.setImageBitmap(qrBitmap(link.url, dp(200)))
                codeTiles.forEachIndexed { i, tile -> tile.text = link.code.getOrNull(i)?.toString() ?: "" }
                val started = SystemClock.elapsedRealtime()
                fun tick() {
                    if (!signingIn || request != signInGeneration || waitingCode != link.code) return
                    val leftSeconds = ((5 * 60_000L - (SystemClock.elapsedRealtime() - started)).coerceAtLeast(0) / 1000).toInt()
                    status.text = pollFailure?.let { failureMessage(R.string.profiles_unreachable, it) }
                        ?: getString(R.string.profiles_waiting, "${leftSeconds / 60}:${"%02d".format(leftSeconds % 60)}")
                    countdown.progress = leftSeconds * 1000 / 300
                    main.postDelayed(::tick, 1_000)
                }
                waitingCode = link.code
                tick()
                poll(name, link.code, started, again) { failure ->
                    if (failure != null) FailureLog.record(FailureLog.Operation.SIGN_IN, failure)
                    else pollFailure?.let { FailureLog.record(FailureLog.Operation.SIGN_IN, it, recovered = true) }
                    pollFailure = failure
                }
            }.onFailure {
                val failure = failureOf(it)
                FailureLog.record(FailureLog.Operation.SIGN_IN, failure)
                status.text = failureMessage(R.string.profiles_unreachable, failure)
                main.postDelayed({ if (signingIn && request == signInGeneration) showSignIn(name, again) }, 5_000)
            }
        }
    }

    private fun onboardingBackdrop(useLastFilm: Boolean = true) = ImageView(this).apply {
        setImageResource(R.drawable.onboarding_scene)
        scaleType = ImageView.ScaleType.CENTER_CROP
        // Dim, as the doc asks: the copy and code sit over it. A darkening filter, not alpha: the window has no
        // background, so a see-through backdrop would show the last frame instead of darkening.
        if (useLastFilm) setColorFilter(android.graphics.Color.argb(166, 14, 12, 10), android.graphics.PorterDuff.Mode.SRC_ATOP)
        if (useLastFilm) Profiles.active(this@ProfilesActivity)?.let { profile ->
            background({ ProfileLibrary.savedLibrary(applicationContext, profile)?.let(Library::continueWatching)?.firstOrNull()?.optString("_id") }) { result ->
                result.getOrNull()?.let(Images::backgroundFor)?.let { url -> Images.load(url, this, resources.displayMetrics.widthPixels) }
            }
        }
    }

    /** "step 1 of 3", the words above the dots of a setup. */
    private fun step(current: Int, total: Int) = getString(R.string.profiles_step, current, total)

    private fun onboardingFrame(step: String, current: Int, total: Int, left: View, right: View, gap: Int, leftWeight: Float,
                                rightWeight: Float, leftWidth: Int = 0) =
        android.widget.FrameLayout(this).apply {
            val body = LinearLayout(this@ProfilesActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(PAD), dp(68), dp(PAD), dp(35))
                addView(left, if (leftWidth > 0)
                    LinearLayout.LayoutParams(leftWidth, -2).apply { marginEnd = gap }
                else LinearLayout.LayoutParams(0, -1, leftWeight).apply { marginEnd = gap })
                addView(right, LinearLayout.LayoutParams(0, -1, rightWeight))
            }
            addView(body, android.widget.FrameLayout.LayoutParams(-1, -1))
            addView(LinearLayout(this@ProfilesActivity).apply {
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(PAD), dp(31), dp(PAD), 0)
                addView(brand(), LinearLayout.LayoutParams(0, -2, 1f))
                if (step.isEmpty()) return@apply // a profile's own screens (rename) aren't part of a setup
                addView(text(getString(if (total > 2) R.string.profiles_step_new else R.string.profiles_step_welcome, step), SMALL, color = TEXT_2))
                repeat(total) { index -> addView(View(this@ProfilesActivity).apply {
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL; setColor(if (index < current) TUNGSTEN else GLASS_EDGE)
                    }
                }, LinearLayout.LayoutParams(dp(5), dp(5)).apply { marginStart = dp(5) }) }
            }, android.widget.FrameLayout.LayoutParams(-1, dp(58), Gravity.TOP))
        }

    private fun onboardingButton(label: String) = pill(label)

    private fun onboardingAvatar(initial: String, size: Int, color: Int = draftColor) = text(initial, if (size > 50) 48f else 19f,
        serif = true, color = BASE).apply {
        gravity = Gravity.CENTER
        background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(color)
        }
        layoutParams = LinearLayout.LayoutParams(dp(size), dp(size))
    }

    private fun poll(name: String, code: String, startedAt: Long, again: Profile?, onStatus: (Failure?) -> Unit) {
        main.postDelayed({
            if (waitingCode != code) return@postDelayed
            background({ Stremio.readLink(code) }) { result ->
                if (waitingCode != code) return@background
                onStatus(result.exceptionOrNull()?.let(::failureOf))
                val key = result.getOrNull()
                when {
                    key != null -> {
                        waitingCode = null
                        signingIn = false
                        approved(name, key, again)
                    }
                    // ponytail: Stremio doesn't say when a code expires (waiting and expired look the same),
                    // so a fresh code every 5 minutes. Read the expiry if their API ever exposes it.
                    SystemClock.elapsedRealtime() - startedAt > 5 * 60_000 -> showSignIn(name, again)
                    else -> poll(name, code, startedAt, again, onStatus)
                }
            }
        }, 3_000)
    }

    /**
     * A code was approved. When that account is already another profile here (approved on a phone still signed in to
     * the other person), say so before going on. Each sign-in has its own key, so the accounts are compared by user id.
     */
    private fun approved(name: String, key: String, again: Profile?) {
        val others = Profiles.all(this).filter { it.id != again?.id && it.libraryMode == LibraryMode.STREMIO }
        background({
            others.firstOrNull { it.authKey == key } ?: Stremio.userId(key).let { account ->
                others.firstOrNull { runCatching { Stremio.userId(it.authKey) }.getOrNull() == account }
            }
        }) { result ->
            val same = result.getOrNull() ?: return@background signedIn(name, key, again) // unknown: don't hold anyone up
            choose(getString(R.string.profiles_same_account, same.name),
                listOf(getString(R.string.profiles_other_account), getString(R.string.profiles_continue_anyway)),
                getString(R.string.profiles_same_account_desc, name, same.name)) { i ->
                if (i == 0) showSignIn(name, again) else signedIn(name, key, again)
            }
        }
    }

    private fun signedIn(name: String, key: String, again: Profile?) {
        if (again != null) {
            Profiles.signIn(this, again.id, key)
            val destination = relinkLocalId ?: again.id
            relinkLocalId = null
            return openHome(Profiles.all(this).first { it.id == destination })
        }
        val others = Profiles.all(this)
        val profile = Profiles.add(this, name, key, draftColor)
        draftName = ""
        draftColor = Profiles.COLORS[0]
        // Each profile brings its own add-ons (stream add-ons are shared in Settings, never copied);
        // the others' lists only tell where Watchly lives, so the new profile can set up its own.
        if (others.isEmpty()) openHome(profile)
        else background({ others.flatMap { runCatching { Stremio.addons(it.authKey) }.getOrDefault(emptyList()) } }) {
            showWatchly(profile, it.getOrDefault(emptyList()))
        }
    }

    // ---------- recommendations ----------

    /** Watchly is per person: the new profile sets up its own, connected to its own Stremio account. */
    private fun showWatchly(profile: Profile, sourceAddons: List<Addon>) {
        backTo = { openHome(profile) }
        val watchly = sourceAddons.firstOrNull { it.name.contains("watchly", ignoreCase = true) }
            ?: return showReady(profile)
        val configure = Uri.parse(watchly.transportUrl).let { "${it.scheme}://${it.authority}/configure" }
        val qr = ImageView(this).apply { setImageBitmap(qrBitmap(configure, dp(220))) }
        val done = onboardingButton(getString(R.string.profiles_continue_to_alder)).apply { setOnClickListener { openHome(profile) } }
        val steps = column(Gravity.START,
            text(getString(R.string.profiles_recommendations, profile.name), SERIF_TITLE, bold = true, serif = true),
            text(getString(R.string.profiles_watchly_steps, profile.name), BODY, color = TEXT_3).marginTop(16),
            done.marginTop(32),
        )
        setWindowed(onboardingFrame(step(3, 3), 3, 3, column(Gravity.CENTER,
            qr.apply { background = rounded(TEXT, 12) },
            text(profile.name, BODY, bold = true).marginTop(12)
        ).apply { gravity = Gravity.CENTER; setPadding(dp(22), dp(22), dp(22), dp(22)); background = glass(14) },
            steps, dp(52), 0.9f, 1.1f), onboardingBackdrop())
        done.requestFocus()
    }

    private fun showReady(profile: Profile) {
        backTo = { openHome(profile) }
        val total = if (profile.libraryMode == LibraryMode.LOCAL) 2 else 3
        val done = onboardingButton(getString(R.string.profiles_continue_to_alder)).apply { setOnClickListener { openHome(profile) } }
        setWindowed(onboardingFrame(step(total, total), total, total, column(Gravity.CENTER,
            onboardingAvatar(profile.name.take(1).uppercase(), 100, profile.color),
            text(profile.name, SERIF_TITLE, serif = true).marginTop(12)
        ).apply { gravity = Gravity.CENTER }, column(Gravity.START,
            text(R.string.profiles_all_set, 40f, serif = true),
            text(getString(R.string.profiles_ready, profile.name), BODY, color = TEXT_2).marginTop(12),
            done.marginTop(24)
        ).apply { gravity = Gravity.CENTER_VERTICAL }, dp(55), 0.9f, 1.1f), onboardingBackdrop())
        done.requestFocus()
    }

    private companion object {
        const val LIFT_ROOM = 8 // dp above the portraits for the focused one's 10% lift and ring
        const val KEY_H = 25 // dp a key row on the name step, so Continue fits under the colours
    }
}
