package com.spicyhome.pos.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.repository.AuthRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.HttpException

data class LoginUiState(
    val username: String = "",
    val pin: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val isLoggedIn: Boolean = false,
    val savedServerUrl: String = "",
    val usernames: List<String> = emptyList(),
    val usernameMode: UsernameMode = UsernameMode.LOADING,
)

enum class UsernameMode {
    LOADING,
    SELECT,
    INPUT,
}

class LoginViewModel(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState

    init {
        viewModelScope.launch {
            val url = preferencesManager.serverUrl.first() ?: ""
            _uiState.value = _uiState.value.copy(savedServerUrl = url)
            loadUsernames()
        }
    }

    private fun loadUsernames() {
        val baseUrl = _uiState.value.savedServerUrl
        if (baseUrl.isBlank()) {
            _uiState.value = _uiState.value.copy(usernameMode = UsernameMode.INPUT)
            return
        }

        _uiState.value = _uiState.value.copy(usernameMode = UsernameMode.LOADING)

        viewModelScope.launch {
            try {
                val api = apiClientProvider.createAuthApi(baseUrl)
                val repo = AuthRepository(api)

                val response = withContext(ioDispatcher) {
                    repo.listUsernames().execute()
                }

                if (response.isSuccessful) {
                    val body = response.body()
                    if (body != null && body.usernames.isNotEmpty()) {
                        _uiState.value = _uiState.value.copy(
                            usernames = body.usernames,
                            usernameMode = UsernameMode.SELECT,
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            usernameMode = UsernameMode.INPUT,
                        )
                    }
                } else {
                    _uiState.value = _uiState.value.copy(
                        usernameMode = UsernameMode.INPUT,
                    )
                }
            } catch (_: Exception) {
                _uiState.value = _uiState.value.copy(
                    usernameMode = UsernameMode.INPUT,
                )
            }
        }
    }

    fun onUsernameChange(value: String) {
        _uiState.value = _uiState.value.copy(username = value, error = null)
    }

    fun onPinChange(value: String) {
        if (value.length <= 6 && value.all { it.isDigit() }) {
            _uiState.value = _uiState.value.copy(pin = value, error = null)
        }
    }

    fun login() {
        val state = _uiState.value
        if (state.username.isBlank() || state.pin.isBlank()) {
            _uiState.value = state.copy(error = "Username and PIN required")
            return
        }

        _uiState.value = state.copy(isLoading = true, error = null)

        viewModelScope.launch {
            try {
                val baseUrl = _uiState.value.savedServerUrl
                val api = apiClientProvider.createAuthApi(baseUrl)
                val repo = AuthRepository(api)

                val response = withContext(ioDispatcher) {
                    repo.login(state.username, state.pin).execute()
                }

                if (response.isSuccessful) {
                    val token = response.body()!!.accessToken
                    preferencesManager.setAuthToken(token)
                    preferencesManager.setUsername(state.username)
                    _uiState.value = _uiState.value.copy(isLoading = false, isLoggedIn = true)
                } else {
                    val errorMsg = when (response.code()) {
                        401 -> "Invalid username or PIN"
                        403 -> "Account is inactive"
                        else -> "Login failed (${response.code()})"
                    }
                    _uiState.value = _uiState.value.copy(isLoading = false, error = errorMsg)
                }
            } catch (e: Exception) {
                val msg = when (e) {
                    is HttpException -> "Server error: ${e.code()}"
                    is java.net.ConnectException -> "Cannot connect to server"
                    is java.net.UnknownHostException -> "Cannot reach server"
                    is java.net.SocketTimeoutException -> "Connection timed out"
                    else -> e.message ?: "Unknown error"
                }
                _uiState.value = _uiState.value.copy(isLoading = false, error = msg)
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            preferencesManager.clearAuth()
            _uiState.value = LoginUiState()
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    class Factory(
        private val preferencesManager: PreferencesManager,
        private val apiClientProvider: ApiClientProvider,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return LoginViewModel(preferencesManager, apiClientProvider) as T
        }
    }
}
