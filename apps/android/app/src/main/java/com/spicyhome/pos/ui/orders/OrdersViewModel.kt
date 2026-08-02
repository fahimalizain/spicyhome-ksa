package com.spicyhome.pos.ui.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.client.models.UserOptionResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
import com.spicyhome.pos.data.repository.AuthRepository
import com.spicyhome.pos.data.repository.OrderRepository
import com.spicyhome.pos.data.repository.TableRepository
import com.spicyhome.pos.util.ServiceDay
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** All selectable order statuses for the multiselect filter, in display order. */
val ORDER_FILTER_STATUSES = listOf("open", "paid", "voided", "refunded")

data class OrdersUiState(
    val orders: List<OrderSummaryResponse> = emptyList(),
    val tablesById: Map<Long, String> = emptyMap(), // table id → name
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedOrder: OrderResponse? = null,
    val showDetail: Boolean = false,
    val detailLoading: Boolean = false,
    // ── Filters (server-side) ────────────────────────────────────────────
    /**
     * YYYY-MM-DD Asia/Riyadh **service-day** label (window
     * [D 05:00, (D+1) 05:00), per ADR 0008). Fixed to the service day at
     * state creation — the Android UI has no date picker, so this is never
     * user-changed.
     */
    val date: String = ServiceDay.getServiceDayString(System.currentTimeMillis()),
    /** Selected statuses. Empty set → no status filter (all statuses). Default: open only. */
    val statuses: Set<String> = setOf("open"),
    /** orders.created_by filter. null → all users. Default: current user. */
    val userId: Long? = null,
    /** The logged-in user id (GET /auth/me). */
    val currentUserId: Long? = null,
    /** Active users for the dropdown (GET /auth/active-users). */
    val users: List<UserOptionResponse> = emptyList(),
    /** Whether me + active users have been loaded (first list waits for them). */
    val authReady: Boolean = false,
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
    private var authRepo: AuthRepository? = null

    init {
        viewModelScope.launch {
            val token = preferencesManager.authToken.first() ?: ""
            val url = preferencesManager.serverUrl.first() ?: ""
            orderRepo = OrderRepository(apiClientProvider.createOrdersApi(url, token))
            tableRepo = TableRepository(apiClientProvider.createTablesApi(url, token))
            authRepo = AuthRepository(apiClientProvider.createAuthApi(url, token))
            loadAuthAndOrders()
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

    /**
     * Load the current user (me) + active users first, then run the first
     * list with the default filters (today + open + current user). Waiting
     * for `me` avoids a flash of an unfiltered list.
     */
    private suspend fun loadAuthAndOrders() {
        var meId: Long? = null
        var users: List<UserOptionResponse> = emptyList()

        try {
            val meRes = withContext(ioDispatcher) { authRepo!!.getMe().execute() }
            if (meRes.isSuccessful) {
                meId = meRes.body()?.id
            }
        } catch (_: Exception) {
            // Best-effort: fall back to "all users" filter.
        }

        try {
            val usersRes = withContext(ioDispatcher) { authRepo!!.listActiveUsers().execute() }
            if (usersRes.isSuccessful) {
                users = usersRes.body() ?: emptyList()
            }
        } catch (_: Exception) {
            // Best-effort: dropdown shows only "All users".
        }

        _uiState.value = _uiState.value.copy(
            currentUserId = meId,
            userId = meId, // default user filter = current user
            users = users,
            authReady = true,
        )
        loadOrders()
    }

    fun loadOrders() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            try {
                val response = withContext(ioDispatcher) {
                    val state = _uiState.value
                    val statusParam = if (state.statuses.isEmpty()) {
                        null
                    } else {
                        state.statuses.sorted().joinToString(",")
                    }
                    orderRepo!!
                        .listOrders(statusParam, state.date.takeIf { it.isNotBlank() }, state.userId)
                        .execute()
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

    /** Toggle one status in the multiselect; clearing all → no status filter. */
    fun toggleStatus(status: String) {
        val current = _uiState.value.statuses
        val next = if (status in current) current - status else current + status
        _uiState.value = _uiState.value.copy(statuses = next)
        loadOrders()
    }

    /** Set the user filter; null → all users. */
    fun setUserId(userId: Long?) {
        _uiState.value = _uiState.value.copy(userId = userId)
        loadOrders()
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
