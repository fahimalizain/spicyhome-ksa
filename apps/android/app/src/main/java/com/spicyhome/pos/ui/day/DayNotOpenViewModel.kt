package com.spicyhome.pos.ui.day

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.repository.DayRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class DayNotOpenUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val dayOpen: Boolean = false,
    val checkDone: Boolean = false,
)

class DayNotOpenViewModel(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DayNotOpenUiState())
    val uiState: StateFlow<DayNotOpenUiState> = _uiState

    init {
        checkDay()
    }

    fun checkDay() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)

        viewModelScope.launch {
            try {
                val bearerToken = preferencesManager.authToken.first() ?: ""
                val baseUrl = preferencesManager.serverUrl.first() ?: ""

                if (bearerToken.isBlank()) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Not authenticated",
                        checkDone = true,
                    )
                    return@launch
                }

                val dayApi = apiClientProvider.createDayApi(baseUrl, bearerToken)
                val repo = DayRepository(dayApi)

                val response = withContext(ioDispatcher) {
                    repo.getCurrent().execute()
                }

                if (response.isSuccessful) {
                    val body = response.body()
                    if (body != null && body.open == true) {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            dayOpen = true,
                            checkDone = true,
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            dayOpen = false,
                            checkDone = true,
                        )
                    }
                } else {
                    // Treat server errors as "not open" — user can retry
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        dayOpen = false,
                        checkDone = true,
                        error = "Unable to check day status (${response.code()})",
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    dayOpen = false,
                    checkDone = true,
                    error = "Network error checking day status" + (e.message?.let { ": $it" } ?: ""),
                )
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            preferencesManager.clearAuth()
        }
    }

    class Factory(
        private val preferencesManager: PreferencesManager,
        private val apiClientProvider: ApiClientProvider,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return DayNotOpenViewModel(preferencesManager, apiClientProvider) as T
        }
    }
}
