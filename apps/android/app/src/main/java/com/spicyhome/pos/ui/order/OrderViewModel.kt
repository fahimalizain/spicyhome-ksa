package com.spicyhome.pos.ui.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.MeResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.TableResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
import com.spicyhome.pos.data.repository.AuthRepository
import com.spicyhome.pos.data.repository.MenuRepository
import com.spicyhome.pos.data.repository.OrderRepository
import com.spicyhome.pos.data.repository.TableRepository
import com.spicyhome.pos.util.MoneyFormatter
import io.sentry.Sentry
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first

data class CartItem(
    val item: ItemResponse,
    val orderItemId: Long? = null,
    val qty: Int = 1,
    val notes: String = "",
)

data class Permissions(
    val createOrder: Boolean = false,
    val updateOrder: Boolean = false,
    val deleteOrderItem: Boolean = false,
    val voidOrder: Boolean = false,
    val refundOrder: Boolean = false,
    val payOrder: Boolean = false,
    val manageMenu: Boolean = false,
    val manageTables: Boolean = false,
    val managePrinters: Boolean = false,
    val manageUsers: Boolean = false,
    val manageSettings: Boolean = false,
) {
    companion object {
        fun from(me: MeResponse?): Permissions {
            if (me == null) return Permissions()
            return Permissions(
                createOrder = me.createOrder,
                updateOrder = me.updateOrder,
                deleteOrderItem = me.deleteOrderItem,
                voidOrder = me.voidOrder,
                refundOrder = me.refundOrder,
                payOrder = me.payOrder,
                manageMenu = me.manageMenu,
                manageTables = me.manageTables,
                managePrinters = me.managePrinters,
                manageUsers = me.manageUsers,
                manageSettings = me.manageSettings,
            )
        }
    }
}

enum class OrderType(val value: String) {
    DINE_IN("dine_in"),
    TAKEAWAY("takeaway"),
}

enum class OrderScreenState {
    SELECTING_TYPE,
    EDITING_ORDER,
    ORDER_TERMINAL,
    DAY_NOT_OPEN,
}

data class OrderUiState(
    val screenState: OrderScreenState = OrderScreenState.SELECTING_TYPE,
    val categories: List<CategoryResponse> = emptyList(),
    val items: List<ItemResponse> = emptyList(),
    val tables: List<TableResponse> = emptyList(),
    val selectedCategoryId: Long? = null,
    val cart: List<CartItem> = emptyList(),
    val orderType: OrderType = OrderType.DINE_IN,
    val selectedTableId: Long? = null,
    val currentOrderId: Long? = null,
    val currentOrder: OrderResponse? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val categoriesLoaded: Boolean = false,
    val permissions: Permissions = Permissions(),
) {
    // Filtered items — client-side filtering based on selected category
    val filteredItems: List<ItemResponse>
        get() = if (selectedCategoryId == null) {
            items
        } else {
            items.filter { it.categoryId.toLong() == selectedCategoryId }
        }

    // Cart totals — computed from cart state
    val cartTotalHalalas: Long
        get() = cart.sumOf { it.item.priceHalalas.toLong() * it.qty }

    val cartVatHalalas: Long
        get() {
            var totalVat = 0L
            for (ci in cart) {
                val (_, _, vat) = MoneyFormatter.cartItemTotal(
                    ci.item.priceHalalas.toLong(), ci.qty, ci.item.vatRateBp.toLong()
                )
                totalVat += vat
            }
            return totalVat
        }

    val cartSubtotalHalalas: Long
        get() = cartTotalHalalas - cartVatHalalas

    val cartItemCount: Int
        get() = cart.sumOf { it.qty }

    val isCartEmpty: Boolean
        get() = cart.isEmpty()
}

class OrderViewModel(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
    private val realtimeClient: RealtimeClient,
    private val initialTableId: Long? = null,
    private val initialOrderId: Long? = null,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {

    private val _uiState = MutableStateFlow(OrderUiState())
    val uiState: StateFlow<OrderUiState> = _uiState

    private var bearerToken: String = ""
    private var baseUrl: String = ""

    private var menuRepo: MenuRepository? = null
    private var orderRepo: OrderRepository? = null
    private var tableRepo: TableRepository? = null
    private var authRepo: AuthRepository? = null

    init {
        viewModelScope.launch {
            bearerToken = preferencesManager.authToken.first() ?: ""
            baseUrl = preferencesManager.serverUrl.first() ?: ""
            initRepos()
            loadMenu()
            loadTables()
            applyInitialTableContext()
            loadPermissions()
        }
        // WS subscription for multi-terminal safety
        viewModelScope.launch {
            realtimeClient.events.collect { event ->
                val currentId = _uiState.value.currentOrderId ?: return@collect
                if (event.type.startsWith("order.")) {
                    val order = refetchOrder() ?: return@collect
                    if (order.status != "open") {
                        _uiState.value = _uiState.value.copy(
                            currentOrder = order,
                            screenState = OrderScreenState.ORDER_TERMINAL,
                        )
                    } else {
                        hydrateFromOrder(order)
                    }
                }
            }
        }
    }

    private fun initRepos() {
        menuRepo = MenuRepository(apiClientProvider.createMenuApi(baseUrl, bearerToken))
        orderRepo = OrderRepository(apiClientProvider.createOrdersApi(baseUrl, bearerToken))
        tableRepo = TableRepository(apiClientProvider.createTablesApi(baseUrl, bearerToken))
        authRepo = AuthRepository(apiClientProvider.createAuthApi(baseUrl, bearerToken))
    }

    private fun loadPermissions() {
        viewModelScope.launch {
            try {
                val meResponse = withContext(ioDispatcher) {
                    authRepo!!.getMe().execute()
                }
                if (meResponse.isSuccessful) {
                    _uiState.value = _uiState.value.copy(
                        permissions = Permissions.from(meResponse.body())
                    )
                }
            } catch (_: Exception) {
                // permissions stay default (all false)
            }
        }
    }

    private fun applyInitialTableContext() {
        if (initialOrderId != null) {
            viewModelScope.launch {
                try {
                    val response = withContext(ioDispatcher) {
                        orderRepo!!.getOrder(initialOrderId).execute()
                    }
                    if (response.isSuccessful) {
                        val order = response.body()!!
                        hydrateFromOrder(order)
                    } else {
                        _uiState.value = _uiState.value.copy(
                            error = "Failed to load order (${response.code()})",
                            screenState = OrderScreenState.SELECTING_TYPE,
                        )
                    }
                } catch (e: Exception) {
                    _uiState.value = _uiState.value.copy(
                        error = e.message ?: "Failed to load order",
                        screenState = OrderScreenState.SELECTING_TYPE,
                    )
                }
            }
        } else if (initialTableId != null) {
            _uiState.value = _uiState.value.copy(
                orderType = OrderType.DINE_IN,
                selectedTableId = initialTableId,
                screenState = OrderScreenState.EDITING_ORDER,
            )
        }
    }

    private suspend fun loadMenu() {
        try {
            coroutineScope {
                val catsDeferred = async(ioDispatcher) {
                    menuRepo!!.listCategories().execute()
                }
                val itemsDeferred = async(ioDispatcher) {
                    menuRepo!!.listItems().execute()
                }

                val catsResponse = catsDeferred.await()
                val itemsResponse = itemsDeferred.await()

                val cats = if (catsResponse.isSuccessful) {
                    (catsResponse.body() ?: emptyList()).filter { it.isActive }
                } else {
                    emptyList()
                }
                val allItems = if (itemsResponse.isSuccessful) {
                    (itemsResponse.body() ?: emptyList()).filter { it.isActive }
                } else {
                    emptyList()
                }

                var error: String? = null
                if (!catsResponse.isSuccessful) {
                    error = "Failed to load categories (${catsResponse.code()})"
                }
                if (!itemsResponse.isSuccessful) {
                    error = "Failed to load items (${itemsResponse.code()})"
                }

                _uiState.value = _uiState.value.copy(
                    categories = cats,
                    items = allItems,
                    categoriesLoaded = true,
                    error = error,
                )
            }
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(error = e.message)
        }
    }

    private fun loadTables() {
        viewModelScope.launch {
            try {
                val response = withContext(ioDispatcher) {
                    tableRepo!!.listTables().execute()
                }
                if (response.isSuccessful) {
                    _uiState.value = _uiState.value.copy(
                        tables = response.body() ?: emptyList(),
                    )
                }
            } catch (_: Exception) {
                // Tables optional
            }
        }
    }

    fun selectCategory(categoryId: Long?) {
        _uiState.value = _uiState.value.copy(
            selectedCategoryId = categoryId,
        )
    }

    fun setOrderType(type: OrderType) {
        _uiState.value = _uiState.value.copy(orderType = type)
    }

    fun setTable(tableId: Long?) {
        _uiState.value = _uiState.value.copy(selectedTableId = tableId)
    }

    // ── Local cart mutations (pre-order only — no permission gate per D17) ──

    fun addToCart(item: ItemResponse) {
        val cart = _uiState.value.cart.toMutableList()
        val idx = cart.indexOfFirst { it.item.id == item.id }
        if (idx >= 0) {
            cart[idx] = cart[idx].copy(qty = cart[idx].qty + 1)
        } else {
            cart.add(CartItem(item = item))
        }
        _uiState.value = _uiState.value.copy(cart = cart)
    }

    fun removeFromCart(index: Int) {
        val cart = _uiState.value.cart.toMutableList()
        if (index in cart.indices) {
            cart.removeAt(index)
        }
        _uiState.value = _uiState.value.copy(cart = cart)
    }

    fun increaseQty(index: Int) {
        val cart = _uiState.value.cart.toMutableList()
        if (index in cart.indices) {
            cart[index] = cart[index].copy(qty = cart[index].qty + 1)
        }
        _uiState.value = _uiState.value.copy(cart = cart)
    }

    fun decreaseQty(index: Int) {
        val cart = _uiState.value.cart.toMutableList()
        if (index in cart.indices) {
            val item = cart[index]
            if (item.qty > 1) {
                cart[index] = item.copy(qty = item.qty - 1)
            } else {
                cart.removeAt(index)
            }
        }
        _uiState.value = _uiState.value.copy(cart = cart)
    }

    fun updateItemNotes(index: Int, notes: String) {
        val cart = _uiState.value.cart.toMutableList()
        if (index in cart.indices) {
            cart[index] = cart[index].copy(notes = notes)
            _uiState.value = _uiState.value.copy(cart = cart)
        }
    }

    fun clearCart() {
        _uiState.value = _uiState.value.copy(cart = mutableListOf())
    }

    // ── Server-synced cart mutations (canonical pattern: optimistic → API → refetch+hdyrate) ──

    fun addItemServer(item: ItemResponse) {
        val orderId = _uiState.value.currentOrderId ?: return
        viewModelScope.launch {
            val snapshotCart = _uiState.value.cart.toList()
            val snapshotState = _uiState.value.copy(cart = snapshotCart)

            // Optimistic: add item locally with qty=1, orderItemId=null (placeholder)
            val tempCartItem = CartItem(item = item, qty = 1)
            _uiState.value = _uiState.value.copy(
                cart = _uiState.value.cart + tempCartItem,
                error = null,
            )
            try {
                val response = withContext(ioDispatcher) {
                    orderRepo!!.addItem(
                        orderId = orderId,
                        itemId = item.id.toLong(),
                        qty = 1,
                        notes = null,
                    ).execute()
                }
                // Always refetch + hydrate
                val order = refetchOrder()
                if (order != null) {
                    hydrateFromOrder(order)
                } else {
                    _uiState.value = snapshotState.copy(
                        error = if (response.isSuccessful) "Sync failed — pull to refresh"
                        else "Failed to add item (${response.code()})"
                    )
                }
            } catch (e: Exception) {
                val order = refetchOrder()
                if (order != null) {
                    hydrateFromOrder(order)
                } else {
                    _uiState.value = snapshotState.copy(
                        error = e.message ?: "Failed to add item"
                    )
                }
            }
        }
    }

    fun updateQtyServer(orderItemId: Long, newQty: Int) {
        // Guard: qty below 1 is a remove, not a PATCH qty=0
        if (newQty < 1) {
            removeItemServer(orderItemId)
            return
        }
        val orderId = _uiState.value.currentOrderId ?: return
        viewModelScope.launch {
            val snapshotCart = _uiState.value.cart.toList()
            val snapshotState = _uiState.value.copy(cart = snapshotCart)

            // Optimistic: update qty locally
            val cart = _uiState.value.cart.toMutableList()
            val idx = cart.indexOfFirst { it.orderItemId == orderItemId }
            if (idx >= 0) {
                cart[idx] = cart[idx].copy(qty = newQty)
                _uiState.value = _uiState.value.copy(cart = cart, error = null)
            } else {
                return@launch
            }

            try {
                withContext(ioDispatcher) {
                    orderRepo!!.updateItem(orderId, orderItemId, newQty, null).execute()
                }
                val order = refetchOrder()
                if (order != null) {
                    hydrateFromOrder(order)
                } else {
                    _uiState.value = snapshotState.copy(
                        error = "Sync failed — pull to refresh"
                    )
                }
            } catch (e: Exception) {
                val order = refetchOrder()
                if (order != null) {
                    hydrateFromOrder(order)
                } else {
                    _uiState.value = snapshotState.copy(
                        error = e.message ?: "Failed to update quantity"
                    )
                }
            }
        }
    }

    fun removeItemServer(orderItemId: Long) {
        val orderId = _uiState.value.currentOrderId ?: return
        viewModelScope.launch {
            val snapshotCart = _uiState.value.cart.toList()
            val snapshotState = _uiState.value.copy(cart = snapshotCart)

            // Optimistic: remove from cart
            val cart = _uiState.value.cart.toMutableList()
            cart.removeAll { it.orderItemId == orderItemId }
            _uiState.value = _uiState.value.copy(cart = cart, error = null)

            try {
                withContext(ioDispatcher) {
                    orderRepo!!.removeItem(orderId, orderItemId).execute()
                }
                val order = refetchOrder()
                if (order != null) {
                    hydrateFromOrder(order)
                } else {
                    _uiState.value = snapshotState.copy(
                        error = "Sync failed — pull to refresh"
                    )
                }
            } catch (e: Exception) {
                val order = refetchOrder()
                if (order != null) {
                    hydrateFromOrder(order)
                } else {
                    _uiState.value = snapshotState.copy(
                        error = e.message ?: "Failed to remove item"
                    )
                }
            }
        }
    }

    fun updateNotesServer(orderItemId: Long, notes: String) {
        val orderId = _uiState.value.currentOrderId ?: return
        viewModelScope.launch {
            val snapshotCart = _uiState.value.cart.toList()
            val snapshotState = _uiState.value.copy(cart = snapshotCart)

            // Optimistic: update notes locally
            val cart = _uiState.value.cart.toMutableList()
            val idx = cart.indexOfFirst { it.orderItemId == orderItemId }
            if (idx >= 0) {
                cart[idx] = cart[idx].copy(notes = notes)
                _uiState.value = _uiState.value.copy(cart = cart, error = null)
            } else {
                return@launch
            }

            try {
                withContext(ioDispatcher) {
                    orderRepo!!.updateItem(orderId, orderItemId, null, notes.ifBlank { null }).execute()
                }
                val order = refetchOrder()
                if (order != null) {
                    hydrateFromOrder(order)
                } else {
                    _uiState.value = snapshotState.copy(
                        error = "Sync failed — pull to refresh"
                    )
                }
            } catch (e: Exception) {
                val order = refetchOrder()
                if (order != null) {
                    hydrateFromOrder(order)
                } else {
                    _uiState.value = snapshotState.copy(
                        error = e.message ?: "Failed to update notes"
                    )
                }
            }
        }
    }

    // ── Order creation ──

    fun proceedToBuild() {
        val state = _uiState.value
        if (state.orderType == OrderType.DINE_IN && state.selectedTableId == null) {
            _uiState.value = state.copy(error = "Please select a table")
            return
        }
        _uiState.value = state.copy(
            screenState = OrderScreenState.EDITING_ORDER,
            error = null,
        )
    }

    fun createOrder() {
        val state = _uiState.value
        if (state.isCartEmpty) {
            _uiState.value = state.copy(error = "Cart is empty")
            return
        }

        _uiState.value = state.copy(isLoading = true, error = null)

        viewModelScope.launch {
            try {
                val response = withContext(ioDispatcher) {
                    orderRepo!!.createOrder(
                        type = state.orderType.value,
                        tableId = state.selectedTableId,
                    ).execute()
                }

                if (response.isSuccessful) {
                    val created = response.body()!!
                    val orderId = created.id.toLong()
                    _uiState.value = _uiState.value.copy(
                        currentOrderId = orderId,
                    )
                    // Now add all cart items to the order (keeps isLoading=true until done)
                    addCartItemsToOrder(orderId)
                } else if (response.code() == 409) {
                    // No open business day
                    _uiState.value = _uiState.value.copy(
                        screenState = OrderScreenState.DAY_NOT_OPEN,
                        isLoading = false,
                        error = "No open business day. Please open a day first.",
                    )
                } else {
                    // HTTP 4xx/5xx are captured by SentryOkHttpInterceptor (with bodies).
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Failed to create order (${response.code()})",
                    )
                }
            } catch (e: Exception) {
                Sentry.captureException(e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Order creation failed",
                )
            }
        }
    }

    private suspend fun addCartItemsToOrder(orderId: Long) {
        val cart = _uiState.value.cart.toList()
        var hasError = false

        for (ci in cart) {
            try {
                val response = withContext(ioDispatcher) {
                    orderRepo!!.addItem(
                        orderId = orderId,
                        itemId = ci.item.id.toLong(),
                        qty = ci.qty,
                        notes = ci.notes.ifBlank { null },
                    ).execute()
                }
                if (!response.isSuccessful) {
                    hasError = true
                }
            } catch (_: Exception) {
                hasError = true
            }
        }

        // Always refetch + hydrate to populate orderItemId from authoritative server state
        val order = refetchOrder()
        if (order != null) {
            hydrateFromOrder(order)
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                error = if (hasError) "Some items could not be added" else null,
            )
        } else {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                screenState = OrderScreenState.EDITING_ORDER,
                error = if (hasError) "Some items could not be added; sync failed" else "Sync failed — pull to refresh",
            )
        }
    }

    // ── Order hydrate / refetch ──

    fun hydrateFromOrder(order: OrderResponse) {
        val cartItems = order.items.map { oi ->
            // Match menu item by itemId; fall back to synthesized ItemResponse from snapshots
            val menuItem = _uiState.value.items.find { it.id == oi.itemId }
            val item = menuItem ?: ItemResponse(
                id = oi.itemId ?: 0L,
                categoryId = 0L,
                name = oi.itemName,
                nameAr = null,
                priceHalalas = oi.unitPriceHalalas,
                vatRateBp = oi.vatRateBp,
                sortOrder = 0,
                isActive = true,
                createdAt = 0L,
                updatedAt = 0L,
                createdBy = null,
                updatedBy = null,
            )
            CartItem(
                item = item,
                orderItemId = oi.id,
                qty = oi.qty,
                notes = oi.notes ?: "",
            )
        }
        _uiState.value = _uiState.value.copy(
            cart = cartItems,
            currentOrderId = order.id.toLong(),
            currentOrder = order,
            orderType = if (order.type == "dine_in") OrderType.DINE_IN else OrderType.TAKEAWAY,
            selectedTableId = order.tableId,
            screenState = if (order.status == "open") OrderScreenState.EDITING_ORDER else OrderScreenState.ORDER_TERMINAL,
        )
    }

    private suspend fun refetchOrder(): OrderResponse? {
        val orderId = _uiState.value.currentOrderId ?: return null
        return try {
            val response = withContext(ioDispatcher) {
                orderRepo!!.getOrder(orderId).execute()
            }
            if (response.isSuccessful) response.body() else null
        } catch (e: Exception) {
            null
        }
    }

    // ── Navigation / reset ──

    fun newOrder() {
        _uiState.value = OrderUiState(
            categories = _uiState.value.categories,
            items = _uiState.value.items,
            tables = _uiState.value.tables,
            categoriesLoaded = _uiState.value.categoriesLoaded,
            permissions = _uiState.value.permissions,
        )
    }

    fun logout() {
        viewModelScope.launch {
            preferencesManager.clearAuth()
            _uiState.value = OrderUiState()
        }
    }

    class Factory(
        private val preferencesManager: PreferencesManager,
        private val apiClientProvider: ApiClientProvider,
        private val realtimeClient: RealtimeClient,
        private val initialTableId: Long? = null,
        private val initialOrderId: Long? = null,
        private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return OrderViewModel(
                preferencesManager,
                apiClientProvider,
                realtimeClient,
                initialTableId,
                initialOrderId,
                ioDispatcher,
            ) as T
        }
    }
}
