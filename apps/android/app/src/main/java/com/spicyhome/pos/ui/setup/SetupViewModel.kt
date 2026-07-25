package com.spicyhome.pos.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class SetupUiState(
    val serverUrl: String = "http://192.168.1.50:3000",
    val isTesting: Boolean = false,
    val testResult: String? = null,
    val isConnected: Boolean = false,
    val isAutoConnecting: Boolean = false,
)

class SetupViewModel(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SetupUiState())
    val uiState: StateFlow<SetupUiState> = _uiState

    init {
        viewModelScope.launch {
            val savedUrl = preferencesManager.serverUrl.first()
            if (savedUrl != null) {
                _uiState.value = _uiState.value.copy(
                    serverUrl = savedUrl,
                    isTesting = true,
                    isAutoConnecting = true,
                )
                val reachable = withContext(Dispatchers.IO) {
                    apiClientProvider.testConnectivity(savedUrl)
                }
                _uiState.value = _uiState.value.copy(
                    isTesting = false,
                    isConnected = reachable,
                    testResult = if (reachable) "Connected" else "Cannot reach server at $savedUrl",
                    isAutoConnecting = false,
                )
            }
        }
    }

    fun onServerUrlChange(url: String) {
        _uiState.value = _uiState.value.copy(
            serverUrl = url,
            testResult = null,
            isConnected = false,
        )
    }

    fun testConnection() {
        val url = _uiState.value.serverUrl.trimEnd('/')
        _uiState.value = _uiState.value.copy(isTesting = true, testResult = null)

        viewModelScope.launch {
            val reachable = withContext(Dispatchers.IO) {
                apiClientProvider.testConnectivity(url)
            }
            if (reachable) {
                preferencesManager.setServerUrl(url)
                _uiState.value = _uiState.value.copy(
                    isTesting = false,
                    testResult = "Connected",
                    isConnected = true,
                )
            } else {
                _uiState.value = _uiState.value.copy(
                    isTesting = false,
                    testResult = "Cannot reach server at $url",
                    isConnected = false,
                )
            }
        }
    }

    class Factory(
        private val preferencesManager: PreferencesManager,
        private val apiClientProvider: ApiClientProvider,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return SetupViewModel(preferencesManager, apiClientProvider) as T
        }
    }
}
