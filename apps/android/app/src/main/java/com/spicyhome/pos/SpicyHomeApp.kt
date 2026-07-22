package com.spicyhome.pos

import android.app.Application
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class SpicyHomeApp : Application() {

    lateinit var preferencesManager: PreferencesManager
        private set

    lateinit var apiClientProvider: ApiClientProvider
        private set

    lateinit var realtimeClient: RealtimeClient
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        preferencesManager = PreferencesManager(this)
        apiClientProvider = ApiClientProvider()
        realtimeClient = RealtimeClient()

        appScope.launch {
            combine(
                preferencesManager.serverUrl,
                preferencesManager.authToken,
            ) { url, token -> url to token }
            .collect { (url, token) ->
                if (!url.isNullOrBlank() && !token.isNullOrBlank()) {
                    realtimeClient.connect(url, token)
                } else {
                    realtimeClient.disconnect()
                }
            }
        }
    }
}
