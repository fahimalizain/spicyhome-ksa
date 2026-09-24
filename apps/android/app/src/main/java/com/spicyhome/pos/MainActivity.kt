package com.spicyhome.pos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.spicyhome.pos.ui.navigation.NavGraph
import com.spicyhome.pos.ui.theme.SpicyHomeTheme
import com.spicyhome.pos.ui.update.UpdateOverlay

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        hideSystemBars()

        val app = application as SpicyHomeApp

        setContent {
            SpicyHomeTheme {
                androidx.compose.material3.Surface(modifier = Modifier.fillMaxSize()) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        NavGraph(
                            preferencesManager = app.preferencesManager,
                            apiClientProvider = app.apiClientProvider,
                            sessionManager = app.sessionManager,
                        )

                        val updateState by app.updateManager.uiState.collectAsState()
                        UpdateOverlay(
                            state = updateState,
                            currentVersion = BuildConfig.VERSION_NAME,
                            onUpdate = app.updateManager::startDownload,
                            onLater = app.updateManager::dismiss,
                            onCancelDownload = app.updateManager::cancelDownload,
                            onInstall = app.updateManager::install,
                            onRetry = app.updateManager::retry,
                        )
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        // Soft auto-check; throttled inside UpdateManager (30 min) and silent on failure.
        (application as SpicyHomeApp).updateManager.checkForUpdate(force = false)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemBars()
        }
    }

    private fun hideSystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
}
