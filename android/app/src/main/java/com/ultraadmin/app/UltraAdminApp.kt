package com.ultraadmin.app

import android.app.Application
import android.webkit.WebView

/**
 * Application class — initializes global WebView state once at startup.
 * Enables debug mode only on debug builds so Chrome DevTools can inspect
 * the WebView from chrome://inspect on desktop.
 */
class UltraAdminApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // Enable Chrome DevTools remote debugging for debug builds
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    }
}
