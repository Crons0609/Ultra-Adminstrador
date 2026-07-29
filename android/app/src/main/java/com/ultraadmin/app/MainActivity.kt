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
        const val SAAS_URL = "https://ultra-adminstrador.onrender.com"
        // ─────────────────────────────────────────────────────────────────────

        private const val RC_PERMISSIONS = 1001
    }

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var wasOffline = false

    // ── Offline banner views ────────────────────────────────────────────
    private lateinit var offlineBanner: android.widget.LinearLayout
    private lateinit var syncingBar:    android.widget.LinearLayout
    private lateinit var offlineTitle:  android.widget.TextView
    private lateinit var offlineSubtitle: android.widget.TextView

    // ── Runtime permission launchers ─────────────────────────────────────────
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

        setupEdgeToEdge()
        setContentView(R.layout.activity_main)

        swipeRefresh    = findViewById(R.id.swipe_refresh)
        webView         = findViewById(R.id.webview)
        offlineBanner   = findViewById(R.id.offline_banner)
        syncingBar      = findViewById(R.id.syncing_bar)
        offlineTitle    = findViewById(R.id.offline_title)
        offlineSubtitle = findViewById(R.id.offline_subtitle)

        setupSwipeRefresh()
        setupWebView()

        // Handle deep links
        handleIntent(intent)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(SAAS_URL)
        }
    }

    // ── Edge-to-edge setup ───────────────────────────────────────────────────
    private fun setupEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(
            WindowInsetsCompat.Type.statusBars() or
                    WindowInsetsCompat.Type.navigationBars()
        )
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    // ── SwipeRefreshLayout ───────────────────────────────────────────────────
    private fun setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(
            ContextCompat.getColor(this, R.color.accent_primary),
            ContextCompat.getColor(this, R.color.accent_secondary)
        )
        swipeRefresh.setProgressBackgroundColorSchemeColor(
            ContextCompat.getColor(this, R.color.bg_surface)
        )
        // Only allow pull-to-refresh when the WebView is scrolled fully to the top
        swipeRefresh.isEnabled = false
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }
    }

    // ── WebView full configuration ───────────────────────────────────────────
    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        // Hardware acceleration is set at application level in Manifest
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

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

        // Enable pull-to-refresh only when WebView content is scrolled to the very top
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            webView.setOnScrollChangeListener { _, _, scrollY, _, _ ->
                swipeRefresh.isEnabled = scrollY == 0
            }
        }

        // ── Offline / Online connectivity monitoring ────────────────────────
        setupConnectivityMonitor()

        // JavaScript bridge for native features
        webView.addJavascriptInterface(AndroidBridge(), "AndroidApp")
    }

    // ── WebViewClient ────────────────────────────────────────────────────────
    inner class UltraWebViewClient : WebViewClient() {

        override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
            super.onPageStarted(view, url, favicon)
            swipeRefresh.isRefreshing = true
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            swipeRefresh.isRefreshing = false
            CookieManager.getInstance().flush()
        }

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            val url = request?.url?.toString() ?: return false

            return when {
                // Stay in WebView for our own domain
                url.startsWith(SAAS_URL) -> false
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
                swipeRefresh.isRefreshing = false
                showOfflinePage(view)
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(
                    android.os.VibrationEffect.createOneShot(
                        ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE
                    )
                )
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(ms)
            }
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

    // ── Deep link handling ───────────────────────────────────────────────────
    private fun handleIntent(intent: Intent?) {
        val data = intent?.data ?: return
        val url = data.toString()
        if (url.isNotBlank() && ::webView.isInitialized) {
            webView.loadUrl(url)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    // ── Back button navigates WebView history ────────────────────────────────
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
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
        webView.onResume()
        setupEdgeToEdge() // Re-apply after system dialogs
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
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

                    showSyncingBanner()          // green "Sincronizando..." bar
                    Handler(Looper.getMainLooper()).postDelayed({
                        hideOfflineBanner()      // hide everything after 4 s
                    }, 4000)
                }
            }

            override fun onLost(network: Network) {
                wasOffline = true
                Handler(Looper.getMainLooper()).post {
                    webView.settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new Event('offline'));", null
                    )
                    showOfflineBanner()          // persistent amber banner
                }
            }
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        cm.registerNetworkCallback(request, callback)
        networkCallback = callback

        // If already offline at launch, show the banner immediately
        wasOffline = !checkOnline()
        if (wasOffline) {
            webView.settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
            Handler(Looper.getMainLooper()).post { showOfflineBanner() }
        }
    }

    // ── Offline banner helpers ─────────────────────────────────────────────

    /** Shows the persistent amber "📴 Sin conexión" banner at the bottom. */
    private fun showOfflineBanner() {
        offlineTitle.text    = "Sin conexión a Internet"
        offlineSubtitle.text = "El sistema sigue funcionando. Los datos se sincronizarán al reconectarse."
        syncingBar.visibility   = View.GONE
        offlineBanner.visibility = View.VISIBLE
        offlineBanner.alpha = 0f
        offlineBanner.animate().alpha(1f).setDuration(300).start()
    }

    /** Replaces amber bar content with green "Sincronizando..." strip. */
    private fun showSyncingBanner() {
        syncingBar.visibility   = View.VISIBLE
        offlineBanner.visibility = View.VISIBLE
    }

    /** Fades and hides the entire banner. */
    private fun hideOfflineBanner() {
        offlineBanner.animate().alpha(0f).setDuration(400).withEndAction {
            offlineBanner.visibility = View.GONE
            syncingBar.visibility    = View.GONE
            offlineBanner.alpha = 1f
        }.start()
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
