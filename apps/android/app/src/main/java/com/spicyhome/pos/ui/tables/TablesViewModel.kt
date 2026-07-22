package com.spicyhome.pos.ui.tables

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.TableResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
import com.spicyhome.pos.data.repository.OrderRepository
import com.spicyhome.pos.data.repository.TableRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class TableCard(
    val table: TableResponse,
    val openOrder: OrderResponse?,
)

data class TablesUiState(
    val tables: List<TableCard> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

class TablesViewModel(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
    private val realtimeClient: RealtimeClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TablesUiState())
    val uiState: StateFlow<TablesUiState> = _uiState

    private var tableRepo: TableRepository? = null
    private var orderRepo: OrderRepository? = null

    init {
        viewModelScope.launch {
            val token = preferencesManager.authToken.first() ?: ""
            val url = preferencesManager.serverUrl.first() ?: ""
            tableRepo = TableRepository(apiClientProvider.createTablesApi(url, token))
            orderRepo = OrderRepository(apiClientProvider.createOrdersApi(url, token))
            loadTables()
        }
        viewModelScope.launch {
            realtimeClient.events.collect { event ->
                if (event.type.startsWith("order.")) {
                    loadTables()
                }
            }
        }
        viewModelScope.launch {
            realtimeClient.reconnected.collect {
                loadTables()
            }
        }
    }

    fun loadTables() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            try {
                val tablesResponse = withContext(Dispatchers.IO) {
                    tableRepo!!.listTables().execute()
                }
                val ordersResponse = withContext(Dispatchers.IO) {
                    orderRepo!!.listOrders(status = "open").execute()
                }
                if (tablesResponse.isSuccessful && ordersResponse.isSuccessful) {
                    val allTables = tablesResponse.body() ?: emptyList()
                    val openOrders = ordersResponse.body() ?: emptyList()
                    val cards = allTables
                        .filter { it.isActive }
                        .map { table ->
                            val matchedOrder = openOrders.find { order ->
                                order.tableId != null &&
                                    order.tableId is java.math.BigDecimal &&
                                    (order.tableId as java.math.BigDecimal).toLong() == table.id.toLong()
                            }
                            TableCard(table = table, openOrder = matchedOrder)
                        }
                    _uiState.value = _uiState.value.copy(
                        tables = cards,
                        isLoading = false,
                    )
                } else {
                    val errCode = if (!tablesResponse.isSuccessful)
                        tablesResponse.code()
                    else
                        ordersResponse.code()
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Failed to load ($errCode)",
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

    class Factory(
        private val preferencesManager: PreferencesManager,
        private val apiClientProvider: ApiClientProvider,
        private val realtimeClient: RealtimeClient,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return TablesViewModel(preferencesManager, apiClientProvider, realtimeClient) as T
        }
    }
}
