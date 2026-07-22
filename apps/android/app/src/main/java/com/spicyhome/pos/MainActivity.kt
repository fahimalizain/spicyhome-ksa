package com.spicyhome.pos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import com.spicyhome.pos.ui.navigation.NavGraph
import com.spicyhome.pos.ui.theme.SpicyHomeTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = application as SpicyHomeApp

        setContent {
            SpicyHomeTheme {
                androidx.compose.material3.Surface(modifier = Modifier.fillMaxSize()) {
                    NavGraph(
                        preferencesManager = app.preferencesManager,
                        apiClientProvider = app.apiClientProvider,
                    )
                }
            }
        }
    }
}
