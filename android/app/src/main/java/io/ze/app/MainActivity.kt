package io.ze.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.util.Base64
import android.view.ActionMode
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File

/**
 * MainActivity host for VNJAVA APK.
 * Exposes window.AndroidInterface and window.ZeNative JS Bridges for:
 * 1. Native VNPanelService floating 60x60 bubble & overlay menu (TYPE_APPLICATION_OVERLAY)
 * 2. WebView Microphone & Camera permission handling with App Settings redirect if denied
 * 3. In-app WireGuard VPNService, Chat Foreground Service & Background Music Player
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_OPEN_CHAT_ID = "open_chat_id"
        private const val REQ_INITIAL_PERMISSIONS = 1001
        private const val REQ_MEDIA_PERMISSIONS = 1002
        private const val REQ_STORAGE_PERMISSIONS = 1003
        private const val PREF_PERMISSIONS = "vn_permission_prefs"
        private const val KEY_MIC_REQUESTED_ONCE = "mic_requested_once"

        @Volatile
        var isAppInForeground: Boolean = false
            private set
    }

    private lateinit var webView: WebView
    private var pendingVpnServerCode: String = "SG"
    private var pendingVpnServerIp: String = "103.145.22.84"
    private var pendingVpnPort: Int = 51820
    private var pendingOpenChatId: String? = null
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var micSettingsDialogShowing = false

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            startInAppVpnService(pendingVpnServerCode, pendingVpnServerIp, pendingVpnPort)
        } else {
            notifyWebVpnState(false, pendingVpnServerCode, "")
        }
    }

    private val vpnStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == VPNService.ACTION_STATE_CHANGED) {
                val connected = intent.getBooleanExtra("connected", false)
                val code = intent.getStringExtra("serverCode") ?: "SG"
                val vip = intent.getStringExtra("virtualIp") ?: ""
                notifyWebVpnState(connected, code, vip)
            }
        }
    }

    private val musicControlReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ZeMusicForegroundService.ACTION_CONTROL_BROADCAST) {
                val action = intent.getStringExtra("action") ?: return
                val js = "window.__zeMusicControl && window.__zeMusicControl('$action');"
                webView.post { webView.evaluateJavascript(js, null) }
            }
        }
    }

    private val overlayPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
        val prefs = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(VNPanelService.KEY_MENU, granted).apply()
        if (granted) {
            startVnOverlayService(VNPanelService.ACTION_START_MENU)
        }
        notifyWebVnPanelState()
    }

    private val storagePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        notifyWebStoragePermission()
    }

    private val vnPanelSyncReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == VNPanelService.ACTION_VN_PANEL_SYNC) {
                notifyWebVnPanelState()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        pendingOpenChatId = intent?.getStringExtra(EXTRA_OPEN_CHAT_ID)

        // Minta izin RECORD_AUDIO + notifikasi sebelum WebView dimuat (tidak spam jika user sudah pernah Tolak)
        requestStartupPermissionsIfNeeded()

        webView = WebView(this)
        setContentView(webView)

        webView.isLongClickable = false
        webView.isHapticFeedbackEnabled = false
        webView.setOnLongClickListener { true }
        disableTextSelectionRecursively(window.decorView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString = "$userAgentString VNJAVAAPK/3.0"
        }

        webView.addJavascriptInterface(AndroidInterfaceBridge(), "AndroidInterface")
        webView.addJavascriptInterface(ZeNativeBridge(), "ZeNative")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                runOnUiThread {
                    val requestedResources = request.resources ?: arrayOf()
                    // Langsung grant resource di WebChromeClient agar mikrofon/kamera tidak pernah ditolak
                    try {
                        request.grant(requestedResources)
                    } catch (_: Throwable) {}

                    val needsAudio = requestedResources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    val needsVideo = requestedResources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)

                    val hasAudio = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED
                    val hasVideo = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.CAMERA
                    ) == PackageManager.PERMISSION_GRANTED

                    val toAsk = mutableListOf<String>()
                    if (needsAudio && !hasAudio) toAsk.add(Manifest.permission.RECORD_AUDIO)
                    if (needsVideo && !hasVideo) toAsk.add(Manifest.permission.CAMERA)

                    if (toAsk.isNotEmpty()) {
                        if (needsAudio && hasPreviouslyDeniedMic()) {
                            showMicSettingsDialog()
                        } else {
                            if (needsAudio) markMicRequestedOnce()
                            ActivityCompat.requestPermissions(
                                this@MainActivity,
                                toAsk.toTypedArray(),
                                REQ_MEDIA_PERMISSIONS
                            )
                        }
                    }
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: android.webkit.WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("intent://")) {
                    try {
                        val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(intent)
                    } catch (_: Throwable) {
                        val fallbackUrl = try {
                            Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                                .getStringExtra("browser_fallback_url")
                        } catch (_: Throwable) {
                            null
                        }
                        if (!fallbackUrl.isNullOrBlank()) {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl)))
                        }
                    }
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pendingOpenChatId?.let { chatId ->
                    dispatchOpenChatToWeb(chatId)
                    pendingOpenChatId = null
                }
            }
        }

        val initialUrl = if (!pendingOpenChatId.isNullOrBlank()) {
            "${BuildConfig.ZEIO_APP_URL}/?openChatId=${Uri.encode(pendingOpenChatId)}"
        } else {
            BuildConfig.ZEIO_APP_URL
        }
        webView.loadUrl(initialUrl)

        val vpnFilter = IntentFilter(VPNService.ACTION_STATE_CHANGED)
        val musicFilter = IntentFilter(ZeMusicForegroundService.ACTION_CONTROL_BROADCAST)
        val vnFilter = IntentFilter(VNPanelService.ACTION_VN_PANEL_SYNC)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(vpnStateReceiver, vpnFilter, Context.RECEIVER_NOT_EXPORTED)
            registerReceiver(musicControlReceiver, musicFilter, Context.RECEIVER_NOT_EXPORTED)
            registerReceiver(vnPanelSyncReceiver, vnFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(vpnStateReceiver, vpnFilter)
            registerReceiver(musicControlReceiver, musicFilter)
            registerReceiver(vnPanelSyncReceiver, vnFilter)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val chatId = intent.getStringExtra(EXTRA_OPEN_CHAT_ID)
        if (!chatId.isNullOrBlank()) {
            dispatchOpenChatToWeb(chatId)
        }
    }

    override fun onActionModeStarted(mode: ActionMode?) {
        mode?.finish()
        super.onActionModeStarted(mode)
    }

    private fun disableTextSelectionRecursively(root: View?) {
        if (root == null) return
        if (root is TextView) {
            root.setTextIsSelectable(false)
            root.isLongClickable = false
            root.setOnLongClickListener(null)
        }
        if (root is ViewGroup) {
            for (i in 0 until root.childCount) {
                disableTextSelectionRecursively(root.getChildAt(i))
            }
        }
    }

    override fun onResume() {
        super.onResume()
        isAppInForeground = true
        disableTextSelectionRecursively(window.decorView)
        if (::webView.isInitialized) {
            notifyWebStoragePermission()
        }
    }

    override fun onPause() {
        isAppInForeground = false
        super.onPause()
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(vpnStateReceiver)
            unregisterReceiver(musicControlReceiver)
            unregisterReceiver(vnPanelSyncReceiver)
        } catch (_: Throwable) {}
        super.onDestroy()
    }

    private fun markMicRequestedOnce() {
        getSharedPreferences(PREF_PERMISSIONS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_MIC_REQUESTED_ONCE, true)
            .apply()
    }

    private fun hasPreviouslyDeniedMic(): Boolean {
        val micGranted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (micGranted) return false
        val askedBefore = getSharedPreferences(PREF_PERMISSIONS, Context.MODE_PRIVATE)
            .getBoolean(KEY_MIC_REQUESTED_ONCE, false)
        return askedBefore || ActivityCompat.shouldShowRequestPermissionRationale(
            this,
            Manifest.permission.RECORD_AUDIO
        )
    }

    private fun showMicSettingsDialog() {
        if (micSettingsDialogShowing || isFinishing) return
        micSettingsDialogShowing = true
        AlertDialog.Builder(this)
            .setTitle("Izin Mikrofon Diperlukan")
            .setMessage("Izin mikrofon ditolak, buka Pengaturan > Aplikasi > VNJAVA > Izin > Mikrofon > Izinkan")
            .setPositiveButton("Buka Pengaturan") { _, _ ->
                micSettingsDialogShowing = false
                try {
                    val intent = Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:$packageName")
                    )
                    startActivity(intent)
                } catch (_: Throwable) {}
            }
            .setNegativeButton("Tutup") { _, _ ->
                micSettingsDialogShowing = false
            }
            .setOnDismissListener {
                micSettingsDialogShowing = false
            }
            .show()
    }

    private fun requestStartupPermissionsIfNeeded() {
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val micMissing = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) != PackageManager.PERMISSION_GRANTED
        if (micMissing && !hasPreviouslyDeniedMic()) {
            markMicRequestedOnce()
            perms.add(Manifest.permission.RECORD_AUDIO)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.CAMERA)
        }
        if (perms.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, perms.toTypedArray(), REQ_INITIAL_PERMISSIONS)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_MEDIA_PERMISSIONS) {
            val req = pendingWebPermissionRequest
            pendingWebPermissionRequest = null
            val micGranted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
            if (req != null) {
                try {
                    req.grant(req.resources)
                } catch (_: Throwable) {}
            }
            if (!micGranted && permissions.contains(Manifest.permission.RECORD_AUDIO)) {
                showMicSettingsDialog()
            }
        } else if (requestCode == REQ_STORAGE_PERMISSIONS) {
            notifyWebStoragePermission()
        }
    }

    private fun startInAppVpnService(serverCode: String, serverIp: String, port: Int) {
        val intent = Intent(this, VPNService::class.java).apply {
            action = VPNService.ACTION_CONNECT
            putExtra(VPNService.EXTRA_SERVER_CODE, serverCode)
            putExtra(VPNService.EXTRA_SERVER_IP, serverIp)
            putExtra(VPNService.EXTRA_SERVER_PORT, port)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun notifyWebVpnState(connected: Boolean, serverCode: String, virtualIp: String) {
        val safeCode = serverCode.replace("'", "")
        val safeIp = virtualIp.replace("'", "")
        val js = "window.dispatchEvent(new CustomEvent('ze-native-vpn-state',{detail:{connected:$connected,serverCode:'$safeCode',virtualIp:'$safeIp'}}));"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun dispatchOpenChatToWeb(chatId: String) {
        val safeId = chatId.replace("'", "\\'")
        val js = "window.__zeOpenChatById && window.__zeOpenChatById('$safeId');"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun startVnOverlayService(actionStr: String) {
        val svcIntent = Intent(this, VNPanelService::class.java).apply {
            action = actionStr
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svcIntent)
        } else {
            startService(svcIntent)
        }
    }

    private fun handleFloatingMenuToggle(enabled: Boolean) {
        runOnUiThread {
            val prefs = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
            if (enabled) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this@MainActivity)) {
                    prefs.edit().putBoolean(VNPanelService.KEY_MENU, false).apply()
                    val permIntent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                    overlayPermissionLauncher.launch(permIntent)
                } else {
                    prefs.edit().putBoolean(VNPanelService.KEY_MENU, true).apply()
                    startVnOverlayService(VNPanelService.ACTION_START_MENU)
                }
            } else {
                prefs.edit().putBoolean(VNPanelService.KEY_MENU, false).apply()
                startVnOverlayService(VNPanelService.ACTION_STOP_MENU)
            }
        }
    }

    private fun notifyWebVnPanelState() {
        val p = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
        val p90 = p.getBoolean(VNPanelService.KEY_90, false)
        val bypass = p.getBoolean(VNPanelService.KEY_BYPASS, false)
        val crosshair = p.getBoolean(VNPanelService.KEY_CROSSHAIR, false)
        val menu = p.getBoolean(VNPanelService.KEY_MENU, false)
        val js = "window.dispatchEvent(new CustomEvent('ze-native-vn-panel-sync',{detail:{is90Enabled:$p90,isBypassEnabled:$bypass,isCrosshairEnabled:$crosshair,isMenuEnabled:$menu}}));"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun isStorageAccessGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.READ_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun launchStoragePermissionPrompt() {
        runOnUiThread {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                if (!Environment.isExternalStorageManager()) {
                    try {
                        val intent = Intent(
                            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                            Uri.parse("package:$packageName")
                        )
                        storagePermissionLauncher.launch(intent)
                    } catch (_: Throwable) {
                        try {
                            val fallbackIntent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                            storagePermissionLauncher.launch(fallbackIntent)
                        } catch (_: Throwable) {}
                    }
                } else {
                    notifyWebStoragePermission()
                }
            } else {
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(
                        Manifest.permission.READ_EXTERNAL_STORAGE,
                        Manifest.permission.WRITE_EXTERNAL_STORAGE
                    ),
                    REQ_STORAGE_PERMISSIONS
                )
            }
        }
    }

    private fun notifyWebStoragePermission() {
        val granted = isStorageAccessGranted()
        val js = "window.dispatchEvent(new CustomEvent('ze-native-storage-permission',{detail:{granted:$granted}}));"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun findExistingNamedFile(rootDir: File, targetFileName: String, maxDepth: Int = 5): File? {
        if (maxDepth < 0 || !rootDir.exists() || !rootDir.isDirectory) return null
        val direct = File(rootDir, targetFileName)
        if (direct.exists() && direct.isFile) return direct
        val children = rootDir.listFiles() ?: return null
        for (child in children) {
            if (child.isDirectory) {
                val found = findExistingNamedFile(child, targetFileName, maxDepth - 1)
                if (found != null) return found
            }
        }
        return null
    }

    inner class AndroidInterfaceBridge {
        @JavascriptInterface
        fun startFloatingMenu() {
            handleFloatingMenuToggle(true)
        }

        @JavascriptInterface
        fun stopFloatingMenu() {
            handleFloatingMenuToggle(false)
        }

        @JavascriptInterface
        fun openFreeFire(): String {
            val packages = arrayOf("com.dts.freefireth", "com.dts.freefiremax", "com.garena.game.ff")
            for (pkg in packages) {
                val launchIntent = try {
                    packageManager.getLaunchIntentForPackage(pkg)
                } catch (_: Throwable) {
                    null
                }
                if (launchIntent != null) {
                    try {
                        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                        startActivity(launchIntent)
                        return pkg
                    } catch (_: Throwable) {}
                }
            }
            try {
                val marketIntent = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=com.dts.freefireth")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(marketIntent)
            } catch (_: Throwable) {}
            return "playstore"
        }

        @JavascriptInterface
        fun openMobileLegends(): String {
            val pkg = "com.mobile.legends"
            val launchIntent = try {
                packageManager.getLaunchIntentForPackage(pkg)
            } catch (_: Throwable) {
                null
            }
            if (launchIntent != null) {
                try {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                    startActivity(launchIntent)
                    return pkg
                } catch (_: Throwable) {}
            }
            try {
                val marketIntent = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=com.mobile.legends")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(marketIntent)
            } catch (_: Throwable) {}
            return "playstore"
        }

        @JavascriptInterface
        fun hasStoragePermission(): Boolean {
            return isStorageAccessGranted()
        }

        @JavascriptInterface
        fun requestStoragePermission() {
            launchStoragePermissionPrompt()
        }

        @JavascriptInterface
        fun writeFileToAndroidData(targetSubdir: String, fileName: String, base64Content: String): String {
            val res = JSONObject()
            if (!isStorageAccessGranted()) {
                launchStoragePermissionPrompt()
                res.put("success", false)
                res.put("needsPermission", true)
                res.put("message", "Izin penyimpanan penuh Android/data diperlukan")
                return res.toString()
            }

            val cleanName = fileName.trim().substringAfterLast('/').substringAfterLast('\\')
            if (cleanName.isBlank()) {
                res.put("success", false)
                res.put("message", "Nama file tidak valid")
                return res.toString()
            }

            return try {
                val decodedBytes = Base64.decode(base64Content, Base64.DEFAULT)
                val extRoot = Environment.getExternalStorageDirectory()
                val androidDataRoot = File(extRoot, "Android/data")
                if (!androidDataRoot.exists()) {
                    androidDataRoot.mkdirs()
                }

                val cleanSubdir = targetSubdir.trim().trim('/')
                val targetDir = if (cleanSubdir.isNotEmpty()) {
                    File(androidDataRoot, cleanSubdir)
                } else {
                    File(androidDataRoot, "com.dts.freefireth/files")
                }

                // Cek apakah sudah ada file dengan nama yang sama di Android/data untuk ditimpa langsung
                val existingMatch = findExistingNamedFile(targetDir, cleanName)
                    ?: findExistingNamedFile(androidDataRoot, cleanName)

                val outFile = existingMatch ?: run {
                    if (!targetDir.exists()) targetDir.mkdirs()
                    File(targetDir, cleanName)
                }
                val wasExisting = outFile.exists()
                outFile.parentFile?.mkdirs()
                outFile.writeBytes(decodedBytes)

                res.put("success", true)
                res.put("overwritten", wasExisting)
                res.put("path", outFile.absolutePath)
                res.put("bytes", decodedBytes.size)
                res.toString()
            } catch (e: Throwable) {
                res.put("success", false)
                res.put("message", e.message ?: "Gagal menulis ke Android/data")
                res.toString()
            }
        }

        @JavascriptInterface
        fun showMicDeniedDialog() {
            runOnUiThread {
                val micGranted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED
                if (!micGranted) {
                    if (hasPreviouslyDeniedMic()) {
                        showMicSettingsDialog()
                    } else {
                        markMicRequestedOnce()
                        ActivityCompat.requestPermissions(
                            this@MainActivity,
                            arrayOf(Manifest.permission.RECORD_AUDIO),
                            REQ_MEDIA_PERMISSIONS
                        )
                    }
                }
            }
        }
    }

    inner class ZeNativeBridge {
        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread { requestStartupPermissionsIfNeeded() }
        }

        @JavascriptInterface
        fun showMicDeniedDialog() {
            AndroidInterfaceBridge().showMicDeniedDialog()
        }

        @JavascriptInterface
        fun connectVpn(serverCode: String, serverIp: String, port: Int, killSwitch: Boolean) {
            pendingVpnServerCode = serverCode.ifBlank { "SG" }
            pendingVpnServerIp = serverIp.ifBlank { "103.145.22.84" }
            pendingVpnPort = if (port > 0) port else 51820

            runOnUiThread {
                val prepareIntent = VpnService.prepare(this@MainActivity)
                if (prepareIntent != null) {
                    vpnPermissionLauncher.launch(prepareIntent)
                } else {
                    startInAppVpnService(pendingVpnServerCode, pendingVpnServerIp, pendingVpnPort)
                }
            }
        }

        @JavascriptInterface
        fun disconnectVpn() {
            val intent = Intent(this@MainActivity, VPNService::class.java).apply {
                action = VPNService.ACTION_DISCONNECT
            }
            startService(intent)
        }

        @JavascriptInterface
        fun openApp(packageNameStr: String): Boolean {
            val targetPkg = if (packageNameStr.isBlank()) "com.mobile.legends" else packageNameStr
            val launchIntent = packageManager.getLaunchIntentForPackage(targetPkg)
            if (launchIntent != null) {
                return try {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(launchIntent)
                    true
                } catch (_: Throwable) {
                    false
                }
            }
            return false
        }

        @JavascriptInterface
        fun setUserSession(userId: String, userName: String, serverOrigin: String) {
            val prefs = getSharedPreferences(ZeChatForegroundService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(ZeChatForegroundService.KEY_USER_ID, userId)
                .putString(ZeChatForegroundService.KEY_USER_NAME, userName)
                .putString(ZeChatForegroundService.KEY_SERVER_URL, serverOrigin.ifBlank { BuildConfig.ZEIO_APP_URL })
                .apply()

            if (userId.isNotBlank()) {
                val svcIntent = Intent(this@MainActivity, ZeChatForegroundService::class.java).apply {
                    putExtra(ZeChatForegroundService.EXTRA_USER_ID, userId)
                    putExtra(ZeChatForegroundService.EXTRA_SERVER_URL, serverOrigin.ifBlank { BuildConfig.ZEIO_APP_URL })
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(svcIntent)
                } else {
                    startService(svcIntent)
                }
            }
        }

        @JavascriptInterface
        fun showChatNotification(chatId: String, senderName: String, messageText: String, senderPhoto: String) {
            ZeChatForegroundService.showChatNotification(
                applicationContext,
                chatId,
                senderName,
                messageText
            )
        }

        @JavascriptInterface
        fun updateMusicNotification(
            title: String,
            artist: String,
            coverUrl: String,
            audioUrl: String,
            isPlaying: Boolean
        ) {
            val svcIntent = Intent(this@MainActivity, ZeMusicForegroundService::class.java).apply {
                action = ZeMusicForegroundService.ACTION_UPDATE
                putExtra(ZeMusicForegroundService.EXTRA_TITLE, title)
                putExtra(ZeMusicForegroundService.EXTRA_ARTIST, artist)
                putExtra(ZeMusicForegroundService.EXTRA_COVER, coverUrl)
                putExtra(ZeMusicForegroundService.EXTRA_AUDIO_URL, audioUrl)
                putExtra(ZeMusicForegroundService.EXTRA_IS_PLAYING, isPlaying)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svcIntent)
            } else {
                startService(svcIntent)
            }
        }

        @JavascriptInterface
        fun stopMusicNotification() {
            val svcIntent = Intent(this@MainActivity, ZeMusicForegroundService::class.java).apply {
                action = ZeMusicForegroundService.ACTION_STOP
            }
            startService(svcIntent)
        }

        @JavascriptInterface
        fun canDrawOverlays(): Boolean {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this@MainActivity)
        }

        @JavascriptInterface
        fun setFloatingMenu(enabled: Boolean) {
            handleFloatingMenuToggle(enabled)
        }

        @JavascriptInterface
        fun setCrosshair(enabled: Boolean) {
            runOnUiThread {
                val prefs = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit().putBoolean(VNPanelService.KEY_CROSSHAIR, enabled).apply()
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this@MainActivity)) {
                    if (enabled || prefs.getBoolean(VNPanelService.KEY_MENU, false)) {
                        startVnOverlayService(VNPanelService.ACTION_UPDATE_STATE)
                    } else {
                        startVnOverlayService(VNPanelService.ACTION_STOP_MENU)
                    }
                }
            }
        }

        @JavascriptInterface
        fun syncVnPanelState(
            p90: Boolean,
            bypass: Boolean,
            crosshair: Boolean,
            menu: Boolean,
            customFileName: String,
            owner90Name: String,
            ownerBypassName: String
        ) {
            val prefs = getSharedPreferences(VNPanelService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean(VNPanelService.KEY_90, p90)
                .putBoolean(VNPanelService.KEY_BYPASS, bypass)
                .putBoolean(VNPanelService.KEY_CROSSHAIR, crosshair)
                .putBoolean(VNPanelService.KEY_MENU, menu)
                .putString(VNPanelService.KEY_CUSTOM_FILE, customFileName)
                .putString(VNPanelService.KEY_OWNER_90, owner90Name)
                .putString(VNPanelService.KEY_OWNER_BYPASS, ownerBypassName)
                .apply()

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this@MainActivity)) {
                if (menu || crosshair) {
                    startVnOverlayService(VNPanelService.ACTION_UPDATE_STATE)
                }
            }
        }

        @JavascriptInterface
        fun playFreeFire(): String {
            return VNPanelService.launchFreeFireOrStore(applicationContext)
        }
    }
}
