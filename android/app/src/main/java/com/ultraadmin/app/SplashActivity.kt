package com.ultraadmin.app

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.ImageView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * SplashActivity — shown for ~2 s on first launch.
 * Uses pure ObjectAnimator (no external dependencies).
 * Enters fullscreen / edge-to-edge from the very first frame.
 */
@SuppressLint("CustomSplashScreen")
class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ── Edge-to-edge: status bar + nav bar transparent ─────────────────
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        setContentView(R.layout.activity_splash)

        val logo = findViewById<ImageView>(R.id.splash_logo)

        // ── Animate: fade-in + scale-up ────────────────────────────────────
        logo.alpha = 0f
        logo.scaleX = 0.75f
        logo.scaleY = 0.75f

        logo.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(700)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction {
                // Short pause at full opacity, then fade out and launch Main
                logo.animate()
                    .alpha(0f)
                    .setStartDelay(800)
                    .setDuration(400)
                    .withEndAction { launchMain() }
                    .start()
            }
            .start()
    }

    private fun launchMain() {
        startActivity(Intent(this, MainActivity::class.java))
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        finish()
    }

    // Don't allow back-press to escape the splash
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { /* swallow */ }
}
