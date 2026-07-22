package com.spicyhome.pos.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Test fake for PreferencesManager. Stores values in memory, no Android deps.
 */
class FakePreferencesManager {
    private val _serverUrl = MutableStateFlow<String?>("http://localhost:3000")
    private val _authToken = MutableStateFlow<String?>("test-token")
    private val _username = MutableStateFlow<String?>("admin")

    val serverUrl: Flow<String?> = _serverUrl
    val authToken: Flow<String?> = _authToken
    val username: Flow<String?> = _username

    fun setServerUrl(url: String) { _serverUrl.value = url }
    fun setAuthToken(token: String?) { _authToken.value = token }
    fun setUsername(username: String?) { _username.value = username }
    fun clearAuth() { _authToken.value = null; _username.value = null }
}
