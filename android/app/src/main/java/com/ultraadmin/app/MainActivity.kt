package com.ultraadmin.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.provider.MediaStore
import android.view.View
import android.webkit.*
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * MainActivity — hosts the Ultra Administrador SaaS inside a professional WebView.
 *
 * Features:
 *  - Edge-to-edge / Immersive fullscreen (no status/nav bar chrome)
 *  - Full WebView feature set: JS, LocalStorage, IndexedDB, Cookies, DOM Storage,
 *    Service Workers, WebRTC, Geolocation, Camera, Microphone, File upload
 *  - External links open in system browser
 *  - Back button navigates WebView history
 *  - SwipeRefreshLayout for pull-to-refresh
 *  - Offline detection with auto-retry page
 *  - Runtime permission requests for camera/mic/location/storage
 */
class MainActivity : AppCompatActivity() {

    companion object {
        // ── Change this to your Firebase Hosting URL ─────────────────────────
        const val SAAS_URL = "https://ultra-administrador.onrender.com"
        const val LOCAL_URL = "https://appassets.androidplatform.net/index.html"
        // ─────────────────────────────────────────────────────────────────────

        private const val RC_PERMISSIONS = 1001
        private var activeInstance: MainActivity? = null

        fun notifyNewFcmToken(token: String) {
            activeInstance?.let { activity ->
                Handler(Looper.getMainLooper()).post {
                    activity.webView.evaluateJavascript(
                        "if(window.__onFcmTokenReceived){ window.__onFcmTokenReceived('${token}'); }",
                        null
                    )
                }
            }
        }
    }

    private lateinit var webView: WebView
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var wasOffline = false

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    // ── Runtime permission launchers ─────────────────────────────────────────
    private val requestNotificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        Handler(Looper.getMainLooper()).post {
            webView.evaluateJavascript(
                "if(window.__onNotificationPermissionResult){ window.__onNotificationPermissionResult(${isGranted}); }",
                null
            )
        }
    }

    private val requestCameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* handled in WebChromeClient */ }

    private val requestLocationPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* handled in WebChromeClient */ }

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val results: Array<Uri>? = when {
            result.resultCode == Activity.RESULT_OK -> {
                val data = result.data
                when {
                    data?.clipData != null -> {
                        val count = data.clipData!!.itemCount
                        Array(count) { i -> data.clipData!!.getItemAt(i).uri }
                    }
                    data?.data != null -> arrayOf(data.data!!)
                    cameraImageUri != null -> arrayOf(cameraImageUri!!)
                    else -> null
                }
            }
            cameraImageUri != null -> arrayOf(cameraImageUri!!)
            else -> null
        }
        fileUploadCallback?.onReceiveValue(results)
        fileUploadCallback = null
        cameraImageUri = null
    }

    // ────────────────────────────────────────────────────────────────────────
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        activeInstance = this

        setupEdgeToEdge()
        setContentView(R.layout.activity_main)

        webView         = findViewById(R.id.webview)

        setupWebView()

        // Handle deep links & notification intent extras
        handleIntent(intent)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(LOCAL_URL)
        }
    }

    // ── System Status & Notification Bar setup ─────────────────────────────
    private fun setupEdgeToEdge() {
        // Let the system decorate the window area — the WebView layout will be
        // pushed below the status bar automatically via fitsSystemWindows="true"
        // in activity_main.xml. This ensures header buttons are never obstructed.
        WindowCompat.setDecorFitsSystemWindows(window, true)

        val controller = WindowInsetsControllerCompat(window, window.decorView)
        // Keep the Android notification/status bar visible at all times
        controller.show(WindowInsetsCompat.Type.statusBars())
        // Use light icons on dark status bar backgrounds
        controller.isAppearanceLightStatusBars = false

        // Apply branded dark background color to the status bar
        window.statusBarColor = ContextCompat.getColor(this, R.color.bg_primary)
    }


    // ── WebView full configuration ───────────────────────────────────────────
    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        // Hardware acceleration is set at application level in Manifest
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        
        // 🛠️ Ensure the WebView can receive focus for touch events
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true

        with(webView.settings) {
            // ── Core JS + Storage ──────────────────────────────────────────
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true

            // ── Cache strategy — use cache when offline ────────────────────────
            cacheMode = WebSettings.LOAD_DEFAULT

            // ── Media ──────────────────────────────────────────────────────
            mediaPlaybackRequiresUserGesture = false

            // ── Zoom (disabled for native feel) ────────────────────────────
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false

            // ── Viewport ───────────────────────────────────────────────────
            useWideViewPort = true
            loadWithOverviewMode = true

            // ── Security: NEVER allow mixed content in production ──────────
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

            // ── User Agent — identifies as an Android app, not a browser ───
            userAgentString = "UltraAdministrador/1.0 (Android ${Build.VERSION.RELEASE}; ${Build.MODEL})"

            // ── File chooser ───────────────────────────────────────────────
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
        }

        // Accept all cookies (required for Firebase Auth sessions)
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = UltraWebViewClient()
        webView.webChromeClient = UltraWebChromeClient()

        // ── Offline / Online connectivity monitoring ────────────────────────
        setupConnectivityMonitor()

        // JavaScript bridge for native features
        webView.addJavascriptInterface(AndroidBridge(), "AndroidApp")
    }

    // ── WebViewClient ────────────────────────────────────────────────────────
    inner class UltraWebViewClient : WebViewClient() {

        override fun shouldInterceptRequest(
            view: WebView?,
            request: WebResourceRequest?
        ): WebResourceResponse? {
            request?.url?.let { uri ->
                val assetResponse = assetLoader.shouldInterceptRequest(uri)
                if (assetResponse != null) {
                    return assetResponse
                }
            }
            return super.shouldInterceptRequest(view, request)
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
            super.onPageStarted(view, url, favicon)
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            CookieManager.getInstance().flush()
        }

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            val url = request?.url?.toString() ?: return false

            return when {
                // Stay in WebView for our own domain or local assets domain
                url.startsWith(SAAS_URL) -> false
                url.startsWith("https://appassets.androidplatform.net") -> false
                url.startsWith("https://ultra-administrador") -> false

                // Telephone / mailto → system handler
                url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("sms:") -> {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    true
                }

                // All other external links → system browser
                url.startsWith("https://") || url.startsWith("http://") -> {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    true
                }

                else -> false
            }
        }

        @SuppressLint("WebViewClientOnReceivedSslError")
        override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
            // In release builds, cancel on any SSL error.
            if (BuildConfig.DEBUG) {
                handler?.proceed() // Allow in debug for local testing
            } else {
                handler?.cancel()
            }
        }

        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
            if (request?.isForMainFrame == true) {
                val currentUrl = view?.url ?: ""
                if (!currentUrl.startsWith("https://appassets.androidplatform.net")) {
                    view?.loadUrl(LOCAL_URL)
                } else {
                    showOfflinePage(view)
                }
            }
        }
    }

    // ── WebChromeClient ──────────────────────────────────────────────────────
    inner class UltraWebChromeClient : WebChromeClient() {

        private var customView: View? = null
        private var customViewCallback: CustomViewCallback? = null
        private var originalSystemUiVisibility = 0

        // ── Geolocation ────────────────────────────────────────────────────
        override fun onGeolocationPermissionsShowPrompt(
            origin: String?,
            callback: GeolocationPermissions.Callback?
        ) {
            val fineGranted = ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (fineGranted) {
                callback?.invoke(origin, true, false)
            } else {
                requestLocationPermission.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
                callback?.invoke(origin, fineGranted, false)
            }
        }

        // ── Camera / Mic permissions ───────────────────────────────────────
        override fun onPermissionRequest(request: PermissionRequest?) {
            request ?: return
            val neededAndroidPerms = mutableListOf<String>()

            request.resources.forEach { res ->
                when (res) {
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE ->
                        neededAndroidPerms.add(Manifest.permission.CAMERA)
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE ->
                        neededAndroidPerms.add(Manifest.permission.RECORD_AUDIO)
                }
            }

            val allGranted = neededAndroidPerms.all {
                ContextCompat.checkSelfPermission(this@MainActivity, it) ==
                        PackageManager.PERMISSION_GRANTED
            }

            if (allGranted) {
                request.grant(request.resources)
            } else {
                requestCameraPermission.launch(neededAndroidPerms.toTypedArray())
                // Grant anyway — user will see permission dialog; WebRTC will retry
                request.grant(request.resources)
            }
        }

        // ── File chooser (input type=file) ────────────────────────────────
        override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?
        ): Boolean {
            fileUploadCallback?.onReceiveValue(null)
            fileUploadCallback = filePathCallback

            val intents = mutableListOf<Intent>()

            // Camera intent (creates temp file so we capture full resolution)
            val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            if (cameraIntent.resolveActivity(packageManager) != null) {
                val photoFile = createImageFile()
                cameraImageUri = FileProvider.getUriForFile(
                    this@MainActivity,
                    "${packageName}.fileprovider",
                    photoFile
                )
                cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri)
                intents.add(cameraIntent)
            }

            // Gallery / file picker intent
            val contentIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                type = fileChooserParams?.acceptTypes?.firstOrNull() ?: "*/*"
                addCategory(Intent.CATEGORY_OPENABLE)
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }

            val chooser = Intent.createChooser(contentIntent, "Seleccionar archivo")
            chooser.putExtra(
                Intent.EXTRA_INITIAL_INTENTS,
                intents.toTypedArray()
            )

            filePickerLauncher.launch(chooser)
            return true
        }

        // ── Fullscreen video ───────────────────────────────────────────────
        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
            if (customView != null) {
                onHideCustomView()
                return
            }
            customView = view
            customViewCallback = callback
            originalSystemUiVisibility = window.decorView.systemUiVisibility

            val decorView = window.decorView as FrameLayout
            decorView.addView(
                customView,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                )
            )
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }

        override fun onHideCustomView() {
            (window.decorView as FrameLayout).removeView(customView)
            customView = null
            window.decorView.systemUiVisibility = originalSystemUiVisibility
            customViewCallback?.onCustomViewHidden()
            customViewCallback = null
        }

        // ── JS dialogs pass-through ────────────────────────────────────────
        override fun onJsAlert(
            view: WebView?, url: String?, message: String?, result: JsResult?
        ): Boolean {
            android.app.AlertDialog.Builder(this@MainActivity)
                .setMessage(message)
                .setPositiveButton("OK") { _, _ -> result?.confirm() }
                .setCancelable(false)
                .show()
            return true
        }

        override fun onJsConfirm(
            view: WebView?, url: String?, message: String?, result: JsResult?
        ): Boolean {
            android.app.AlertDialog.Builder(this@MainActivity)
                .setMessage(message)
                .setPositiveButton("Aceptar") { _, _ -> result?.confirm() }
                .setNegativeButton("Cancelar") { _, _ -> result?.cancel() }
                .setCancelable(false)
                .show()
            return true
        }
    }

    // ── JavaScript Bridge ────────────────────────────────────────────────────
    inner class AndroidBridge {
        @JavascriptInterface
        fun isAndroidApp(): Boolean = true

        @JavascriptInterface
        fun getAppVersion(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun vibrate(ms: Long) {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE)
                        as android.os.VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
            }
            vibrator.vibrate(
                android.os.VibrationEffect.createOneShot(
                    ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE
                )
            )
        }

        @JavascriptInterface
        fun shareText(text: String, title: String) {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
                putExtra(Intent.EXTRA_TITLE, title)
            }
            startActivity(Intent.createChooser(intent, "Compartir"))
        }

        @JavascriptInterface
        fun isOnline(): Boolean = checkOnline()

        @JavascriptInterface
        fun getFcmToken(): String {
            val prefs = getSharedPreferences("ultra_prefs", Context.MODE_PRIVATE)
            val token = prefs.getString(UltraFirebaseMessagingService.PREF_FCM_TOKEN, "") ?: ""
            if (token.isNotBlank()) return token

            // Fallback: fetch directly from FirebaseMessaging SDK asynchronously
            com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                .addOnCompleteListener { task ->
                    if (task.isSuccessful && task.result != null) {
                        val newToken = task.result
                        prefs.edit().putString(UltraFirebaseMessagingService.PREF_FCM_TOKEN, newToken).apply()
                        notifyNewFcmToken(newToken)
                    }
                }
            return token
        }

        @JavascriptInterface
        fun hasNotificationPermission(): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                true
            }
        }

        @JavascriptInterface
        fun requestNotificationPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    Handler(Looper.getMainLooper()).post {
                        webView.evaluateJavascript(
                            "if(window.__onNotificationPermissionResult){ window.__onNotificationPermissionResult(true); }",
                            null
                        )
                    }
                }
            } else {
                Handler(Looper.getMainLooper()).post {
                    webView.evaluateJavascript(
                        "if(window.__onNotificationPermissionResult){ window.__onNotificationPermissionResult(true); }",
                        null
                    )
                }
            }
        }

        @JavascriptInterface
        fun openRoute(route: String) {
            val cleanRoute = route.trim().removePrefix("#").removePrefix("/")
            if (cleanRoute.isNotBlank()) {
                Handler(Looper.getMainLooper()).post {
                    webView.evaluateJavascript(
                        "window.location.hash = '#/${cleanRoute}';",
                        null
                    )
                }
            }
        }
    }

    // ── Offline page ─────────────────────────────────────────────────────────
    private fun showOfflinePage(view: WebView?) {
        val html = """
            <!DOCTYPE html>
            <html lang="es">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body {
                  background: #0a0a0b; color: #fff;
                  display: flex; flex-direction: column;
                  align-items: center; justify-content: center;
                  height: 100vh; font-family: system-ui, sans-serif;
                  text-align: center; padding: 24px;
                }
                .icon { font-size: 72px; margin-bottom: 24px; }
                h1 { font-size: 22px; margin-bottom: 12px; }
                p  { font-size: 14px; color: #888; margin-bottom: 32px; }
                button {
                  background: #7c3aed; color: #fff;
                  border: none; border-radius: 12px;
                  padding: 14px 32px; font-size: 16px; cursor: pointer;
                }
              </style>
            </head>
            <body>
              <div class="icon">📡</div>
              <h1>Sin conexión</h1>
              <p>Verifica tu conexión a Internet e inténtalo de nuevo.</p>
              <button onclick="location.reload()">Reintentar</button>
            </body>
            </html>
        """.trimIndent()
        view?.loadData(html, "text/html", "UTF-8")
    }

    // ── Deep link & Notification Intent handling ─────────────────────────────
    private fun handleIntent(intent: Intent?) {
        if (intent == null) return

        // 1. Check for route passed in notification intent extras
        val route = intent.getStringExtra("route")
        if (!route.isNullOrBlank() && ::webView.isInitialized) {
            val cleanRoute = route.trim().removePrefix("#").removePrefix("/")
            Handler(Looper.getMainLooper()).postDelayed({
                webView.evaluateJavascript(
                    "window.location.hash = '#/${cleanRoute}';",
                    null
                )
            }, 500)
            return
        }

        // 2. Standard web deep links
        val data = intent.data ?: return
        val url = data.toString()
        if (url.isNotBlank() && ::webView.isInitialized) {
            webView.loadUrl(url)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            // Check if we are at a "root" hash (like #/dashboard) to avoid getting stuck in loops
            val url = webView.url ?: ""
            if (url.contains("#/dashboard") || url.contains("#/login") || !url.contains("#")) {
                 super.onBackPressed()
            } else {
                 webView.goBack()
            }
        } else {
            super.onBackPressed()
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        activeInstance = this
        webView.onResume()
        setupEdgeToEdge() // Re-apply after system dialogs
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        if (activeInstance == this) {
            activeInstance = null
        }
        // Unregister network callback to avoid memory leaks
        networkCallback?.let {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.unregisterNetworkCallback(it)
        }
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    // ── Connectivity Monitor ──────────────────────────────────────────────────
    /**
     * Registers a real-time NetworkCallback:
     *  - Going offline  → cache-only WebView + persistent amber banner
     *  - Coming online  → normal mode + green syncing bar → hides after 4 s
     */
    private fun setupConnectivityMonitor() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        val callback = object : ConnectivityManager.NetworkCallback() {

            override fun onAvailable(network: Network) {
                if (!wasOffline) return
                wasOffline = false
                Handler(Looper.getMainLooper()).post {
                    webView.settings.cacheMode = WebSettings.LOAD_DEFAULT

                    // Notify JS: triggers Firebase goOnline + SW sync
                    webView.evaluateJavascript(
                        """(function(){
                          window.dispatchEvent(new Event('online'));
                          if(navigator.serviceWorker&&navigator.serviceWorker.controller){
                            navigator.serviceWorker.controller.postMessage({type:'OFFLINE_SYNC_TRIGGER'});
                          }
                        })()""", null
                    )
                }
            }

            override fun onLost(network: Network) {
                wasOffline = true
                Handler(Looper.getMainLooper()).post {
                    webView.settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new Event('offline'));", null
                    )
                }
            }
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        cm.registerNetworkCallback(request, callback)
        networkCallback = callback

        // If already offline at launch, set cache mode
        wasOffline = !checkOnline()
        if (wasOffline) {
            webView.settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    private fun checkOnline(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun createImageFile(): File {
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        return File.createTempFile("ULTRA_${timestamp}_", ".jpg", storageDir)
    }
}
