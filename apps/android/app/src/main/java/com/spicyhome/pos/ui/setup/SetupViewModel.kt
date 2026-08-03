package com.spicyhome.pos.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import kotlinx.coroutines.CoroutineDispatcher
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
    private val skipAutoConnect: Boolean = false,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SetupUiState())
    val uiState: StateFlow<SetupUiState> = _uiState

    init {
        viewModelScope.launch {
            val savedUrl = preferencesManager.serverUrl.first()
            if (savedUrl != null) {
                if (!skipAutoConnect) {
                    _uiState.value = _uiState.value.copy(
                        serverUrl = savedUrl,
                        isTesting = true,
                        isAutoConnecting = true,
                    )
                    val reachable = withContext(ioDispatcher) {
                        apiClientProvider.testConnectivity(savedUrl)
                    }
                    _uiState.value = _uiState.value.copy(
                        isTesting = false,
                        isConnected = reachable,
                        testResult = if (reachable) "Connected" else "Cannot reach server at $savedUrl",
                        isAutoConnecting = false,
                    )
                } else {
                    // Change Server path: prefill the saved URL but do not auto-test
                    // connectivity or navigate away. The user must tap Connect.
                    _uiState.value = _uiState.value.copy(
                        serverUrl = savedUrl,
                        isTesting = false,
                        isAutoConnecting = false,
                    )
                }
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
            val reachable = withContext(ioDispatcher) {
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
        private val skipAutoConnect: Boolean = false,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return SetupViewModel(preferencesManager, apiClientProvider, skipAutoConnect) as T
        }
    }
}
