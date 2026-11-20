package io.ze.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import kotlin.math.abs

/**
 * Persistent Foreground Service untuk VN Panel:
 * 1. Menampilkan 1 bubble kecil 60x60 draggable (WindowManager TYPE_APPLICATION_OVERLAY,
 *    FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT) di atas semua aplikasi.
 * 2. Tap bubble membuka panel kontrol (90%, BYPASS, CROSS HAIR, FILE COSTUM, MENU, PLAY)
 *    langsung lewat WindowManager Native (bukan WebView).
 * 3. Hanya berhenti ketika user mematikan MENU di panel atau menggeser/mematikan notifikasi.
 */
class VNPanelService : Service() {

    companion object {
        const val PREFS_NAME = "vn_panel_native_prefs"
        const val KEY_90 = "vn_90_enabled"
        const val KEY_BYPASS = "vn_bypass_enabled"
        const val KEY_CROSSHAIR = "vn_crosshair_enabled"
        const val KEY_MENU = "vn_menu_enabled"
        const val KEY_CUSTOM_FILE = "vn_custom_file_name"
        const val KEY_OWNER_90 = "vn_owner_90_name"
        const val KEY_OWNER_BYPASS = "vn_owner_bypass_name"

        const val ACTION_START_MENU = "io.ze.app.VN_START_MENU"
        const val ACTION_STOP_MENU = "io.ze.app.VN_STOP_MENU"
        const val ACTION_UPDATE_STATE = "io.ze.app.VN_UPDATE_STATE"
        const val ACTION_VN_PANEL_SYNC = "io.ze.app.VN_PANEL_SYNC"

        private const val CHANNEL_ID = "vn_panel_overlay_channel"
        private const val NOTIF_ID = 4009

        private fun showToast(context: Context, message: String) {
            Handler(Looper.getMainLooper()).post {
                try {
                    Toast.makeText(context.applicationContext, message, Toast.LENGTH_SHORT).show()
                } catch (_: Throwable) {}
            }
        }

        /**
         * Urutan mutlak membuka game Free Fire:
         * 1. Cek satu-satu: com.dts.freefireth, com.dts.freefiremax, com.garena.game.ff.
         *    Jika ketemu getLaunchIntentForPackage -> langsung startActivity + return. JANGAN KE PLAY STORE.
         * 2. Hanya jika 3-3nya null (tidak terinstall), baru buka market://details?id=com.dts.freefireth.
         */
        fun launchFreeFireOrStore(context: Context): String {
            val pm = context.packageManager
            val packages = arrayOf("com.dts.freefireth", "com.dts.freefiremax", "com.garena.game.ff")

            for (pkg in packages) {
                val launchIntent: Intent? = try {
                    pm.getLaunchIntentForPackage(pkg)
                } catch (_: Throwable) {
                    null
                }
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                    try {
                        context.startActivity(launchIntent)
                        showToast(context, "Membuka Free Fire...")
                        return pkg
                    } catch (_: Throwable) {
                        // Lanjut cek package berikutnya jika gagal launch
                    }
                }
            }

            showToast(context, "Free Fire tidak ditemukan, membuka Play Store...")
            return openPlayStorePackage(context, "com.dts.freefireth")
        }

        /**
         * Urutan mutlak membuka Mobile Legends (com.mobile.legends):
         * Jika terinstall langsung startActivity + return, jika tidak ada baru ke market://details?id=com.mobile.legends.
         */
        fun launchMobileLegendsOrStore(context: Context): String {
            val pm = context.packageManager
            val pkg = "com.mobile.legends"
            val launchIntent: Intent? = try {
                pm.getLaunchIntentForPackage(pkg)
            } catch (_: Throwable) {
                null
            }
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                try {
                    context.startActivity(launchIntent)
                    showToast(context, "Membuka Mobile Legends...")
                    return pkg
                } catch (_: Throwable) {
                    // Fallback ke store hanya jika gagal
                }
            }

            showToast(context, "Mobile Legends tidak ditemukan, membuka Play Store...")
            return openPlayStorePackage(context, pkg)
        }

        private fun openPlayStorePackage(context: Context, packageId: String): String {
            return try {
                val marketIntent = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=$packageId")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(marketIntent)
                "playstore"
            } catch (_: Throwable) {
                try {
                    val webIntent = Intent(
                        Intent.ACTION_VIEW,
                        Uri.parse("https://play.google.com/store/apps/details?id=$packageId")
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(webIntent)
                } catch (_: Throwable) {}
                "playstore"
            }
        }
    }

    private lateinit var windowManager: WindowManager
    private var floatingBubbleView: View? = null
    private var floatingMenuView: View? = null
    private var crosshairView: View? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private var menuParams: WindowManager.LayoutParams? = null
    private var isMenuExpanded = false

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createChannel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()

        when (intent?.action) {
            ACTION_STOP_MENU -> {
                saveFlag(KEY_MENU, false)
                removeMenuWindow()
                removeFloatingBubble()
                broadcastSyncToWeb()
                if (!readFlag(KEY_CROSSHAIR)) {
                    stopSelfSafely()
                    return START_NOT_STICKY
                }
            }
            ACTION_START_MENU -> {
                saveFlag(KEY_MENU, true)
                broadcastSyncToWeb()
            }
            ACTION_UPDATE_STATE -> {
                // Preferences sudah disimpan sebelum intent
            }
        }

        syncOverlaysWithPrefs()
        return START_STICKY
    }

    override fun onDestroy() {
        removeMenuWindow()
        removeFloatingBubble()
        removeCrosshairOverlay()
        super.onDestroy()
    }

    private fun stopSelfSafely() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun startAsForeground() {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val pi = PendingIntent.getActivity(
            this,
            10,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, VNPanelService::class.java).apply {
            action = ACTION_STOP_MENU
        }
        val stopPi = PendingIntent.getService(
            this,
            11,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentTitle("VN Panel Aktif")
            .setContentText("Ketuk bubble mengambang untuk kontrol VN Panel")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pi)
            .setDeleteIntent(stopPi)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "OFF", stopPi)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java) ?: return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VN Panel Aktif",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Menjaga bubble mengambang VN Panel tetap tampil di atas semua aplikasi"
                setShowBadge(false)
            }
            mgr.createNotificationChannel(channel)
        }
    }

    private fun prefs() = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private fun readFlag(key: String) = prefs().getBoolean(key, false)
    private fun saveFlag(key: String, value: Boolean) {
        prefs().edit().putBoolean(key, value).apply()
    }

    private fun broadcastSyncToWeb() {
        val p = prefs()
        val syncIntent = Intent(ACTION_VN_PANEL_SYNC).apply {
            setPackage(packageName)
            putExtra(KEY_90, p.getBoolean(KEY_90, false))
            putExtra(KEY_BYPASS, p.getBoolean(KEY_BYPASS, false))
            putExtra(KEY_CROSSHAIR, p.getBoolean(KEY_CROSSHAIR, false))
            putExtra(KEY_MENU, p.getBoolean(KEY_MENU, false))
        }
        sendBroadcast(syncIntent)
    }

    private fun canOverlay(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
    }

    private fun syncOverlaysWithPrefs() {
        if (!canOverlay()) return

        val menuOn = readFlag(KEY_MENU)
        val crosshairOn = readFlag(KEY_CROSSHAIR)

        if (menuOn) {
            ensureFloatingBubble()
            if (isMenuExpanded) {
                refreshMenuContent()
            }
        } else {
            removeMenuWindow()
            removeFloatingBubble()
        }

        if (crosshairOn) {
            ensureCrosshairOverlay()
        } else {
            removeCrosshairOverlay()
        }

        if (!menuOn && !crosshairOn) {
            stopSelfSafely()
        }
    }

    private fun overlayWindowType(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }

    private fun ensureFloatingBubble() {
        if (floatingBubbleView != null) return

        // Bubble kecil 60x60 dp yang bisa di-drag di atas semua aplikasi
        val sizePx = dp(60)
        val bubbleBtn = TextView(this).apply {
            text = "VN"
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(232, 14, 16, 22))
                setStroke(dp(2), Color.argb(215, 255, 255, 255))
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                elevation = dp(8).toFloat()
            }
        }

        val lp = WindowManager.LayoutParams(
            sizePx,
            sizePx,
            overlayWindowType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(16)
            y = dp(160)
        }

        val touchSlop = ViewConfiguration.get(this).scaledTouchSlop
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var isDragging = false

        bubbleBtn.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = lp.x
                    initialY = lp.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - initialTouchX).toInt()
                    val dy = (event.rawY - initialTouchY).toInt()
                    if (abs(dx) > touchSlop || abs(dy) > touchSlop) {
                        isDragging = true
                    }
                    lp.x = initialX + dx
                    lp.y = initialY + dy
                    try {
                        windowManager.updateViewLayout(bubbleBtn, lp)
                    } catch (_: Throwable) {}
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!isDragging) {
                        toggleMenuWindow()
                    }
                    true
                }
                else -> false
            }
        }

        floatingBubbleView = bubbleBtn
        bubbleParams = lp
        try {
            windowManager.addView(bubbleBtn, lp)
        } catch (_: Throwable) {
            floatingBubbleView = null
        }
    }

    private fun removeFloatingBubble() {
        floatingBubbleView?.let {
            try {
                windowManager.removeView(it)
            } catch (_: Throwable) {}
        }
        floatingBubbleView = null
        bubbleParams = null
    }

    private fun toggleMenuWindow() {
        if (isMenuExpanded) {
            removeMenuWindow()
        } else {
            showMenuWindow()
        }
    }

    private fun showMenuWindow() {
        if (floatingMenuView != null) {
            refreshMenuContent()
            return
        }
        isMenuExpanded = true
        val panel = buildMenuPanelView()
        val lp = WindowManager.LayoutParams(
            dp(268),
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayWindowType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
        }
        floatingMenuView = panel
        menuParams = lp
        try {
            windowManager.addView(panel, lp)
        } catch (_: Throwable) {
            floatingMenuView = null
            isMenuExpanded = false
        }
    }

    private fun refreshMenuContent() {
        if (!isMenuExpanded) return
        removeMenuWindow()
        showMenuWindow()
    }

    private fun removeMenuWindow() {
        isMenuExpanded = false
        floatingMenuView?.let {
            try {
                windowManager.removeView(it)
            } catch (_: Throwable) {}
        }
        floatingMenuView = null
        menuParams = null
    }

    private fun buildMenuPanelView(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(16))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(16).toFloat()
                setColor(Color.argb(238, 10, 12, 16))
                setStroke(dp(1), Color.argb(110, 255, 255, 255))
            }
        }

        // Top Header with Title & Close
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(10))
        }
        val titleTxt = TextView(this).apply {
            text = "VN INJECTOR"
            setTextColor(Color.WHITE)
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.16f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val closeBtn = TextView(this).apply {
            text = "X"
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(dp(9), dp(4), dp(9), dp(4))
            background = GradientDrawable().apply {
                cornerRadius = dp(8).toFloat()
                setColor(Color.argb(40, 255, 255, 255))
            }
            setOnClickListener { removeMenuWindow() }
        }
        headerRow.addView(titleTxt)
        headerRow.addView(closeBtn)
        root.addView(headerRow)

        fun addToggleRow(label: String, key: String, onAfterToggle: ((Boolean) -> Unit)? = null) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(7), 0, dp(7))
            }
            val lbl = TextView(this).apply {
                text = label
                setTextColor(Color.WHITE)
                textSize = 12f
                typeface = Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }

            val isChecked = readFlag(key)
            val pill = TextView(this).apply {
                text = if (isChecked) "ON" else "OFF"
                setTextColor(if (isChecked) Color.BLACK else Color.WHITE)
                textSize = 10f
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setPadding(dp(12), dp(5), dp(12), dp(5))
                background = GradientDrawable().apply {
                    cornerRadius = dp(99).toFloat()
                    setColor(if (isChecked) Color.WHITE else Color.argb(40, 255, 255, 255))
                    setStroke(dp(1), if (isChecked) Color.WHITE else Color.argb(90, 255, 255, 255))
                }
            }
            row.setOnClickListener {
                val next = !readFlag(key)
                saveFlag(key, next)
                pill.text = if (next) "ON" else "OFF"
                pill.setTextColor(if (next) Color.BLACK else Color.WHITE)
                pill.background = GradientDrawable().apply {
                    cornerRadius = dp(99).toFloat()
                    setColor(if (next) Color.WHITE else Color.argb(40, 255, 255, 255))
                    setStroke(dp(1), if (next) Color.WHITE else Color.argb(90, 255, 255, 255))
                }
                onAfterToggle?.invoke(next)
                broadcastSyncToWeb()
            }
            row.addView(lbl)
            row.addView(pill)
            root.addView(row)
        }

        // Baris kontrol native WindowManager: 90%, BYPASS, CROSSHAIR, FILE COSTUM, MENU, PLAY FF, PLAY ML, TUTUP
        addToggleRow("90%", KEY_90)
        addToggleRow("BYPASS", KEY_BYPASS)
        addToggleRow("CROSSHAIR", KEY_CROSSHAIR) { enabled ->
            if (enabled) ensureCrosshairOverlay() else removeCrosshairOverlay()
        }

        // Baris FILE COSTUM
        val fileCostumRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(7), 0, dp(7))
        }
        val fileCostumLbl = TextView(this).apply {
            text = "FILE COSTUM"
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val fileCostumBtn = TextView(this).apply {
            text = "ATUR"
            setTextColor(Color.WHITE)
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(5), dp(12), dp(5))
            background = GradientDrawable().apply {
                cornerRadius = dp(99).toFloat()
                setColor(Color.argb(40, 255, 255, 255))
                setStroke(dp(1), Color.argb(90, 255, 255, 255))
            }
            setOnClickListener {
                removeMenuWindow()
                val launchMain = Intent(this@VNPanelService, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
                }
                try {
                    startActivity(launchMain)
                } catch (_: Throwable) {}
            }
        }
        fileCostumRow.addView(fileCostumLbl)
        fileCostumRow.addView(fileCostumBtn)
        root.addView(fileCostumRow)

        addToggleRow("MENU", KEY_MENU) { enabled ->
            if (!enabled) {
                removeMenuWindow()
                removeFloatingBubble()
                if (!readFlag(KEY_CROSSHAIR)) {
                    stopSelfSafely()
                }
            }
        }

        // PLAY FF ROW
        val playFfBtn = TextView(this).apply {
            text = "PLAY FF"
            setTextColor(Color.BLACK)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.16f
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(10)
            }
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.WHITE)
            }
            setOnClickListener {
                removeMenuWindow()
                launchFreeFireOrStore(applicationContext)
            }
        }
        root.addView(playFfBtn)

        // TUTUP BUTTON (hentikan overlay sepenuhnya sampai MENU dinyalakan lagi)
        val closeAllBtn = TextView(this).apply {
            text = "TUTUP"
            setTextColor(Color.WHITE)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.18f
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(8), dp(12), dp(8))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(8)
            }
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.argb(45, 255, 65, 65))
                setStroke(dp(1), Color.argb(140, 255, 90, 90))
            }
            setOnClickListener {
                saveFlag(KEY_MENU, false)
                removeMenuWindow()
                removeFloatingBubble()
                broadcastSyncToWeb()
                if (!readFlag(KEY_CROSSHAIR)) {
                    stopSelfSafely()
                }
            }
        }
        root.addView(closeAllBtn)

        return root
    }

    private fun ensureCrosshairOverlay() {
        if (crosshairView != null) return

        val sizePx = dp(34)
        val reticle = object : View(this) {
            private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                strokeWidth = dp(2).toFloat()
                setShadowLayer(4f, 0f, 0f, Color.BLACK)
            }
            private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.RED
            }

            override fun onDraw(canvas: Canvas) {
                super.onDraw(canvas)
                val cx = width / 2f
                val cy = height / 2f
                val gap = dp(4).toFloat()
                val arm = dp(10).toFloat()
                canvas.drawLine(cx, cy - gap - arm, cx, cy - gap, linePaint)
                canvas.drawLine(cx, cy + gap, cx, cy + gap + arm, linePaint)
                canvas.drawLine(cx - gap - arm, cy, cx - gap, cy, linePaint)
                canvas.drawLine(cx + gap, cy, cx + gap + arm, cy, linePaint)
                canvas.drawCircle(cx, cy, dp(2).toFloat(), dotPaint)
            }
        }.apply {
            setLayerType(View.LAYER_TYPE_SOFTWARE, null)
        }

        val lp = WindowManager.LayoutParams(
            sizePx,
            sizePx,
            overlayWindowType(),
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
        }

        crosshairView = reticle
        try {
            windowManager.addView(reticle, lp)
        } catch (_: Throwable) {
            crosshairView = null
        }
    }

    private fun removeCrosshairOverlay() {
        crosshairView?.let {
            try {
                windowManager.removeView(it)
            } catch (_: Throwable) {}
        }
        crosshairView = null
    }
}
