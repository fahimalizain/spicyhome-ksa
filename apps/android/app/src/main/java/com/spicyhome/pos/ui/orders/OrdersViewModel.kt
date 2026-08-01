package com.spicyhome.pos.ui.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
import com.spicyhome.pos.data.repository.OrderRepository
import com.spicyhome.pos.data.repository.TableRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class OrdersUiState(
    val orders: List<OrderSummaryResponse> = emptyList(),
    val tablesById: Map<Long, String> = emptyMap(), // table id → name
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedOrder: OrderResponse? = null,
    val showDetail: Boolean = false,
    val detailLoading: Boolean = false,
)

class OrdersViewModel(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
    private val realtimeClient: RealtimeClient,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {

    private val _uiState = MutableStateFlow(OrdersUiState())
    val uiState: StateFlow<OrdersUiState> = _uiState

    private var orderRepo: OrderRepository? = null
    private var tableRepo: TableRepository? = null

    init {
        viewModelScope.launch {
            val token = preferencesManager.authToken.first() ?: ""
            val url = preferencesManager.serverUrl.first() ?: ""
            orderRepo = OrderRepository(apiClientProvider.createOrdersApi(url, token))
            tableRepo = TableRepository(apiClientProvider.createTablesApi(url, token))
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
                val response = withContext(ioDispatcher) {
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
        loadTables()
    }

    /**
     * Load the table id → name map used to resolve table names for dine-in
     * orders. Best-effort: a tables failure must never block the orders list,
     * so failures keep the previous map (or empty) and never set [OrdersUiState.error].
     */
    private fun loadTables() {
        viewModelScope.launch {
            try {
                val response = withContext(ioDispatcher) {
                    tableRepo!!.listTables().execute()
                }
                if (response.isSuccessful) {
                    val byId = (response.body() ?: emptyList())
                        .filter { it.name.isNotBlank() }
                        .associate { it.id.toLong() to it.name }
                    _uiState.value = _uiState.value.copy(tablesById = byId)
                }
            } catch (_: Exception) {
                // Best-effort: keep the previous table map.
            }
        }
    }

    fun selectOrder(order: OrderSummaryResponse) {
        _uiState.value = _uiState.value.copy(
            showDetail = true,
            detailLoading = true,
            error = null,
        )
        viewModelScope.launch {
            try {
                val response = withContext(ioDispatcher) {
                    orderRepo!!.getOrder(order.id).execute()
                }
                if (response.isSuccessful) {
                    _uiState.value = _uiState.value.copy(
                        selectedOrder = response.body(),
                        detailLoading = false,
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        detailLoading = false,
                        showDetail = true,
                        selectedOrder = null,
                        error = "Failed to load order details (${response.code()})",
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    detailLoading = false,
                    showDetail = true,
                    selectedOrder = null,
                    error = e.message,
                )
            }
        }
    }

    fun closeDetail() {
        _uiState.value = _uiState.value.copy(
            selectedOrder = null,
            showDetail = false,
            detailLoading = false,
        )
    }

    class Factory(
        private val preferencesManager: PreferencesManager,
        private val apiClientProvider: ApiClientProvider,
        private val realtimeClient: RealtimeClient,
        private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return OrdersViewModel(preferencesManager, apiClientProvider, realtimeClient, ioDispatcher) as T
        }
    }
}
