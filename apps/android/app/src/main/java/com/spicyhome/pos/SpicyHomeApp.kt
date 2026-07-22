package com.spicyhome.pos

import android.app.Application
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider

class SpicyHomeApp : Application() {

    lateinit var preferencesManager: PreferencesManager
        private set

    lateinit var apiClientProvider: ApiClientProvider
        private set

    override fun onCreate() {
        super.onCreate()
        preferencesManager = PreferencesManager(this)
        apiClientProvider = ApiClientProvider()
    }
}
