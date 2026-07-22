package com.spicyhome.pos.ui.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
import com.spicyhome.pos.data.repository.OrderRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class OrdersUiState(
    val orders: List<OrderResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedOrder: OrderResponse? = null,
    val showDetail: Boolean = false,
)

class OrdersViewModel(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
    private val realtimeClient: RealtimeClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(OrdersUiState())
    val uiState: StateFlow<OrdersUiState> = _uiState

    private var orderRepo: OrderRepository? = null

    init {
        viewModelScope.launch {
            val token = preferencesManager.authToken.first() ?: ""
            val url = preferencesManager.serverUrl.first() ?: ""
            orderRepo = OrderRepository(apiClientProvider.createOrdersApi(url, token))
            loadOrders()
        }
        viewModelScope.launch {
            realtimeClient.events.collect { event ->
                if (event.type.startsWith("order.")) {
                    loadOrders()
                }
            }
        }
        viewModelScope.launch {
            realtimeClient.reconnected.collect {
                loadOrders()
            }
        }
    }

    fun loadOrders() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    orderRepo!!.listOrders().execute()
                }
                if (response.isSuccessful) {
                    _uiState.value = _uiState.value.copy(
                        orders = response.body() ?: emptyList(),
                        isLoading = false,
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Failed to load orders (${response.code()})",
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message,
                )
            }
        }
    }

    fun selectOrder(order: OrderResponse) {
        _uiState.value = _uiState.value.copy(
            selectedOrder = order,
            showDetail = true,
        )
    }

    fun closeDetail() {
        _uiState.value = _uiState.value.copy(
            selectedOrder = null,
            showDetail = false,
        )
    }

    class Factory(
        private val preferencesManager: PreferencesManager,
        private val apiClientProvider: ApiClientProvider,
        private val realtimeClient: RealtimeClient,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return OrdersViewModel(preferencesManager, apiClientProvider, realtimeClient) as T
        }
    }
}
