package com.spicyhome.pos.ui.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.MeResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.SubcategoryResponse
import com.spicyhome.client.models.SyncOrderItemDto
import com.spicyhome.client.models.TableResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
import com.spicyhome.pos.data.repository.AuthRepository
import com.spicyhome.pos.data.repository.DayRepository
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
    /** Initial state for deep links (existing order / free table) while hydrate runs. */
    LOADING,
    SELECTING_TYPE,
    EDITING_ORDER,
    ORDER_TERMINAL,
    DAY_NOT_OPEN,
}

data class OrderUiState(
    val screenState: OrderScreenState = OrderScreenState.SELECTING_TYPE,
    /** Display name for the user menu (from prefs username, refined with me.name when available). */
    val username: String = "",
    val categories: List<CategoryResponse> = emptyList(),
    val subcategories: List<SubcategoryResponse> = emptyList(),
    val items: List<ItemResponse> = emptyList(),
    val tables: List<TableResponse> = emptyList(),
    val selectedCategoryId: Long? = null,
    val selectedSubcategoryId: Long? = null,
    val cart: List<CartItem> = emptyList(),
    val orderType: OrderType = OrderType.DINE_IN,
    val selectedTableId: Long? = null,
    /** Order-level notes ("Order notes"). Pre-create: staged locally, sent on create. Open order: hydrated from the server, PATCHed via updateOrderMeta. */
    val orderNotes: String = "",
    val currentOrderId: Long? = null,
    val currentOrder: OrderResponse? = null,
    val isLoading: Boolean = false,
    val isSyncing: Boolean = false,
    val error: String? = null,
    val categoriesLoaded: Boolean = false,
    val permissions: Permissions = Permissions(),
    /** Whether local cart differs from last server snapshot. Null when no order loaded yet. */
    val isDirty: Boolean? = null,
    /** Last known server updatedAt (for concurrency check). */
    val serverUpdatedAt: Long? = null,
    /** Server snapshot cart items (for discard). */
    val snapshotCart: List<CartItem>? = null,
    /** Whether a WS realtime conflict is pending (another terminal changed this order while we had local edits). */
    val showRemoteConflict: Boolean = false,
    /** Client-side item name / nameAr search query. */
    val itemSearchQuery: String = "",
) {
    val filteredItems: List<ItemResponse>
        get() {
            // A selected subcategory takes precedence over the category.
            val categoryFiltered = when {
                selectedSubcategoryId != null -> {
                    items.filter { it.subcategoryId.toLong() == selectedSubcategoryId }
                }
                selectedCategoryId != null -> {
                    items.filter { it.categoryId.toLong() == selectedCategoryId }
                }
                else -> items
            }
            val q = itemSearchQuery.trim()
            if (q.isEmpty()) return categoryFiltered
            val qLower = q.lowercase()
            return categoryFiltered.filter { item ->
                if (item.name.lowercase().contains(qLower)) {
                    true
                } else {
                    val ar = item.nameAr
                    ar != null && ar.toString() != "null" && ar.toString().lowercase().contains(qLower)
                }
            }
        }

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

/**
 * Compare two cart item lists for equality based on identity fields
 * (item.id for new lines, orderItemId for existing, plus qty and notes).
 */
private fun cartEquals(a: List<CartItem>, b: List<CartItem>): Boolean {
    if (a.size != b.size) return false
    for (i in a.indices) {
        val ai = a[i]
        val bi = b[i]
        if (ai.orderItemId != bi.orderItemId) return false
        if (ai.orderItemId == null && ai.item.id != bi.item.id) return false
        if (ai.qty != bi.qty) return false
        if (ai.notes != bi.notes) return false
    }
    return true
}

/**
 * ADR 0005: the qty floor for a cart line is the last server snapshot qty
 * matched by orderItemId. New local lines (orderItemId == null) have no
 * floor (0 — they may be reduced or removed until sent to kitchen).
 * A synced line missing from the snapshot falls back to 0 (defensive; the
 * snapshot always contains synced lines after hydrate).
 */
fun serverFloorQty(cartItem: CartItem, snapshot: List<CartItem>?): Int {
    val orderItemId = cartItem.orderItemId ?: return 0
    return snapshot?.firstOrNull { it.orderItemId == orderItemId }?.qty ?: 0
}

class OrderViewModel(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
    private val realtimeClient: RealtimeClient,
    private val initialTableId: Long? = null,
    private val initialOrderId: Long? = null,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        OrderUiState(
            // Deep links (existing order or free table) must not flash the type
            // selector while menu/order hydrate is in flight — start in LOADING.
            screenState = if (initialOrderId != null || initialTableId != null) {
                OrderScreenState.LOADING
            } else {
                OrderScreenState.SELECTING_TYPE
            },
            // Free-table path: pre-seed the table so it survives until
            // applyInitialTableContext runs (hydrateFromOrder overwrites it
            // for order deep links).
            selectedTableId = initialTableId,
        )
    )
    val uiState: StateFlow<OrderUiState> = _uiState

    private var bearerToken: String = ""
    private var baseUrl: String = ""

    private var menuRepo: MenuRepository? = null
    private var orderRepo: OrderRepository? = null
    private var tableRepo: TableRepository? = null
    private var authRepo: AuthRepository? = null
    private var dayRepo: DayRepository? = null

    init {
        viewModelScope.launch {
            bearerToken = preferencesManager.authToken.first() ?: ""
            baseUrl = preferencesManager.serverUrl.first() ?: ""
            val prefsUsername = preferencesManager.username.first() ?: ""
            initRepos()
            _uiState.value = _uiState.value.copy(username = prefsUsername)
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
                        // Terminal state (paid/voided/refunded) always applies
                        _uiState.value = _uiState.value.copy(
                            currentOrder = order,
                            screenState = OrderScreenState.ORDER_TERMINAL,
                            showRemoteConflict = false,
                        )
                    } else if (_uiState.value.isDirty == true) {
                        // D8: If dirty and remote order changed, show conflict dialog
                        val serverUpdatedAt = _uiState.value.serverUpdatedAt
                        if (serverUpdatedAt != null && order.updatedAt != serverUpdatedAt) {
                            _uiState.value = _uiState.value.copy(
                                showRemoteConflict = true,
                            )
                        }
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
        dayRepo = DayRepository(apiClientProvider.createDayApi(baseUrl, bearerToken))
    }

    private fun loadPermissions() {
        viewModelScope.launch {
            try {
                val meResponse = withContext(ioDispatcher) {
                    authRepo!!.getMe().execute()
                }
                if (meResponse.isSuccessful) {
                    val me = meResponse.body()
                    _uiState.value = _uiState.value.copy(
                        permissions = Permissions.from(me),
                        username = me?.name?.takeIf { it.isNotBlank() } ?: _uiState.value.username,
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
                val subsDeferred = async(ioDispatcher) {
                    menuRepo!!.listSubcategories().execute()
                }
                val itemsDeferred = async(ioDispatcher) {
                    menuRepo!!.listItems().execute()
                }

                val catsResponse = catsDeferred.await()
                val subsResponse = subsDeferred.await()
                val itemsResponse = itemsDeferred.await()

                val cats = if (catsResponse.isSuccessful) {
                    (catsResponse.body() ?: emptyList()).filter { it.isActive }
                } else {
                    emptyList()
                }
                val subs = if (subsResponse.isSuccessful) {
                    (subsResponse.body() ?: emptyList()).filter { it.isActive }
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
                if (!subsResponse.isSuccessful) {
                    error = "Failed to load subcategories (${subsResponse.code()})"
                }
                if (!itemsResponse.isSuccessful) {
                    error = "Failed to load items (${itemsResponse.code()})"
                }

                _uiState.value = _uiState.value.copy(
                    categories = cats,
                    subcategories = subs,
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
        // Changing category resets the subcategory chip to "All" (null).
        _uiState.value = _uiState.value.copy(
            selectedCategoryId = categoryId,
            selectedSubcategoryId = null,
        )
    }

    fun selectSubcategory(subcategoryId: Long?) {
        _uiState.value = _uiState.value.copy(
            selectedSubcategoryId = subcategoryId,
        )
    }

    fun setItemSearch(query: String) {
        _uiState.value = _uiState.value.copy(
            itemSearchQuery = query,
        )
    }

    fun setOrderType(type: OrderType) {
        _uiState.value = _uiState.value.copy(orderType = type)
    }

    fun setTable(tableId: Long?) {
        _uiState.value = _uiState.value.copy(selectedTableId = tableId)
    }

    // ── Local cart mutations (pre-order and post-order — all local staging) ──

    /** Recompute isDirty after a local cart mutation when an order is loaded. */
    private fun recomputeDirty(newCart: List<CartItem>) {
        val snapshot = _uiState.value.snapshotCart
        val isDirty = if (snapshot != null) !cartEquals(newCart, snapshot) else null
        _uiState.value = _uiState.value.copy(cart = newCart, isDirty = isDirty)
    }

    fun addToCart(item: ItemResponse) {
        val cart = _uiState.value.cart.toMutableList()
        // Merge by itemId (D11)
        val idx = cart.indexOfFirst { it.item.id == item.id }
        if (idx >= 0) {
            cart[idx] = cart[idx].copy(qty = cart[idx].qty + 1)
        } else {
            cart.add(CartItem(item = item))
        }
        recomputeDirty(cart)
    }

    fun removeFromCart(index: Int) {
        val cart = _uiState.value.cart.toMutableList()
        if (index in cart.indices) {
            val item = cart[index]
            // ADR 0005: lines that already exist on the server cannot be
            // removed from the tablet (cashier-only).
            if (item.orderItemId != null) return
            cart.removeAt(index)
        }
        recomputeDirty(cart)
    }

    fun increaseQty(index: Int) {
        val cart = _uiState.value.cart.toMutableList()
        if (index in cart.indices) {
            cart[index] = cart[index].copy(qty = cart[index].qty + 1)
        }
        recomputeDirty(cart)
    }

    fun decreaseQty(index: Int) {
        val cart = _uiState.value.cart.toMutableList()
        if (index in cart.indices) {
            val item = cart[index]
            if (item.orderItemId != null) {
                // ADR 0005: synced lines cannot go below the server floor
                // and are never removed (even at qty 1 with floor 1).
                val floor = serverFloorQty(item, _uiState.value.snapshotCart)
                if (item.qty <= floor) return
                cart[index] = item.copy(qty = item.qty - 1)
            } else if (item.qty > 1) {
                cart[index] = item.copy(qty = item.qty - 1)
            } else {
                cart.removeAt(index)
            }
        }
        recomputeDirty(cart)
    }

    fun updateItemNotes(index: Int, notes: String) {
        val cart = _uiState.value.cart.toMutableList()
        if (index in cart.indices) {
            cart[index] = cart[index].copy(notes = notes)
            recomputeDirty(cart)
        }
    }

    /**
     * Update the order-level notes ("Order notes").
     *
     * Pre-create: staged locally and sent with the create DTO (no server
     * call). Open order: immediate PATCH /orders/:id meta with the current
     * type/table + notes + serverUpdatedAt — a notes-only change NEVER
     * kitchen-prints (server rule). 409 (stale) refetches + hydrates, same
     * conflict UX as item sync.
     */
    fun updateOrderNotes(notes: String) {
        val state = _uiState.value
        val orderId = state.currentOrderId

        // Pre-create: local staging only
        if (orderId == null) {
            _uiState.value = state.copy(orderNotes = notes)
            return
        }

        val serverUpdatedAt = state.serverUpdatedAt ?: return
        if (notes.trim() == (state.currentOrder?.notes ?: "").trim()) return // no-op

        _uiState.value = state.copy(isSyncing = true, error = null)

        viewModelScope.launch {
            try {
                val response = withContext(ioDispatcher) {
                    orderRepo!!.updateOrderMeta(
                        orderId = orderId,
                        baseUpdatedAt = serverUpdatedAt,
                        type = state.orderType.value,
                        tableId = state.selectedTableId,
                        // Empty string (not null) — Moshi omits null fields, so a
                        // null here would be treated as "keep current" by the server.
                        notes = notes.trim(),
                    ).execute()
                }
                if (response.isSuccessful) {
                    hydrateFromOrder(response.body()!!)
                    _uiState.value = _uiState.value.copy(isSyncing = false)
                } else if (response.code() == 409) {
                    // Conflict: refetch and reset
                    val order = refetchOrder()
                    if (order != null) {
                        hydrateFromOrder(order)
                    }
                    _uiState.value = _uiState.value.copy(
                        isSyncing = false,
                        error = "Order was modified elsewhere. Your local changes have been reset.",
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        isSyncing = false,
                        error = "Failed to save order notes (${response.code()})",
                    )
                }
            } catch (e: Exception) {
                if (e.message?.contains("409") == true) {
                    val order = refetchOrder()
                    if (order != null) {
                        hydrateFromOrder(order)
                    }
                    _uiState.value = _uiState.value.copy(
                        isSyncing = false,
                        error = "Order was modified elsewhere. Your local changes have been reset.",
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        isSyncing = false,
                        error = e.message ?: "Failed to save order notes",
                    )
                }
            }
        }
    }

    fun clearCart() {
        _uiState.value = _uiState.value.copy(
            cart = mutableListOf(),
            isDirty = null,
            snapshotCart = null,
            serverUpdatedAt = null,
            orderNotes = "",
        )
    }

    // ── Order creation (D10: create + sync) ──

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
                        notes = state.orderNotes.trim().ifBlank { null },
                    ).execute()
                }

                if (response.isSuccessful) {
                    val created = response.body()!!
                    val orderId = created.id.toLong()

                    // B6: Refetch to get real updatedAt before syncing items
                    val fetchedOrder = withContext(ioDispatcher) {
                        orderRepo!!.getOrder(orderId).execute()
                    }
                    val baseUpdatedAt = if (fetchedOrder.isSuccessful) {
                        fetchedOrder.body()?.updatedAt?.toLong() ?: 0L
                    } else {
                        0L
                    }

                    // Sync all cart items in one bulk call
                    if (state.cart.isNotEmpty()) {
                        syncCartItemsToOrder(orderId, baseUpdatedAt)
                    } else {
                        if (fetchedOrder.isSuccessful && fetchedOrder.body() != null) {
                            hydrateFromOrder(fetchedOrder.body()!!)
                        }
                        _uiState.value = _uiState.value.copy(isLoading = false)
                    }
                } else if (response.code() == 409) {
                    _uiState.value = _uiState.value.copy(
                        screenState = OrderScreenState.DAY_NOT_OPEN,
                        isLoading = false,
                        error = "No open business day. Please open a day first.",
                    )
                } else {
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

    private suspend fun syncCartItemsToOrder(orderId: Long, baseUpdatedAt: Long) {
        val cart = _uiState.value.cart.toList()
        try {
            val syncItems = cart.map { ci ->
                SyncOrderItemDto(
                    itemId = ci.item.id,
                    qty = ci.qty,
                    // Blank → "" (never null): Moshi omits null, so null would be
                    // "keep current" on the server instead of clearing the notes.
                    notes = ci.notes.trim(),
                )
            }
            val response = withContext(ioDispatcher) {
                orderRepo!!.syncItems(orderId, baseUpdatedAt, items = syncItems).execute()
            }
            if (response.isSuccessful) {
                hydrateFromOrder(response.body()!!)
                _uiState.value = _uiState.value.copy(isLoading = false)
            } else {
                // B8: Order created but sync failed; set up for retry via sendToKitchen
                _uiState.value = _uiState.value.copy(
                    currentOrderId = orderId,
                    serverUpdatedAt = baseUpdatedAt,
                    snapshotCart = cart,
                    isDirty = true,
                    isLoading = false,
                    error = "Order created but item sync failed (${response.code()}). Tap Send to retry.",
                )
            }
        } catch (e: Exception) {
            // B8: Sync failed; keep orderId + dirty cart for retry
            _uiState.value = _uiState.value.copy(
                currentOrderId = orderId,
                serverUpdatedAt = baseUpdatedAt,
                snapshotCart = cart,
                isDirty = true,
                isLoading = false,
                error = e.message ?: "Order created but item sync failed. Tap Send to retry.",
            )
        }
    }

    // ── Send to Kitchen (D3: bulk sync) ──

    fun sendToKitchen() {
        val state = _uiState.value
        val orderId = state.currentOrderId ?: return
        val serverUpdatedAt = state.serverUpdatedAt ?: return

        _uiState.value = state.copy(isSyncing = true, error = null)

        viewModelScope.launch {
            try {
                val syncItems = state.cart.map { ci ->
                    if (ci.orderItemId != null) {
                        SyncOrderItemDto(
                            orderItemId = ci.orderItemId,
                            qty = ci.qty,
                            // Blank → "" (never null): null would be omitted by
                            // Moshi and treated as "keep current" by the server.
                            notes = ci.notes.trim(),
                        )
                    } else {
                        SyncOrderItemDto(
                            itemId = ci.item.id,
                            qty = ci.qty,
                            notes = ci.notes.trim(),
                        )
                    }
                }
                val response = withContext(ioDispatcher) {
                    orderRepo!!.syncItems(orderId, serverUpdatedAt, syncItems).execute()
                }
                if (response.isSuccessful) {
                    hydrateFromOrder(response.body()!!)
                    _uiState.value = _uiState.value.copy(isSyncing = false)
                } else if (response.code() == 409) {
                    // Conflict: refetch and reset
                    val order = refetchOrder()
                    if (order != null) {
                        hydrateFromOrder(order)
                    }
                    _uiState.value = _uiState.value.copy(
                        isSyncing = false,
                        error = "Order was modified elsewhere. Your local changes have been reset.",
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        isSyncing = false,
                        error = "Failed to sync (${response.code()})",
                    )
                }
            } catch (e: Exception) {
                if (e.message?.contains("409") == true) {
                    val order = refetchOrder()
                    if (order != null) {
                        hydrateFromOrder(order)
                    }
                    _uiState.value = _uiState.value.copy(
                        isSyncing = false,
                        error = "Order was modified elsewhere. Your local changes have been reset.",
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        isSyncing = false,
                        error = e.message ?: "Failed to sync",
                    )
                }
            }
        }
    }

    // ── Discard (D14) ──

    fun discardChanges() {
        val snapshot = _uiState.value.snapshotCart ?: return
        _uiState.value = _uiState.value.copy(
            cart = snapshot,
            isDirty = false,
            error = null,
        )
    }

    // ── Realtime conflict dismiss (D8) ──

    fun dismissRemoteConflict() {
        _uiState.value = _uiState.value.copy(showRemoteConflict = false)
        viewModelScope.launch {
            val order = refetchOrder()
            if (order != null) {
                hydrateFromOrder(order)
            }
            _uiState.value = _uiState.value.copy(showRemoteConflict = false)
        }
    }

    // ── Order hydrate / refetch ──

    fun hydrateFromOrder(order: OrderResponse) {
        val cartItems = order.items.map { oi ->
            val menuItem = _uiState.value.items.find { it.id == oi.itemId }
            val item = menuItem ?: ItemResponse(
                id = oi.itemId ?: 0L,
                categoryId = 0L,
                subcategoryId = 0L,
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
            snapshotCart = cartItems,
            currentOrderId = order.id.toLong(),
            currentOrder = order,
            orderType = if (order.type == "dine_in") OrderType.DINE_IN else OrderType.TAKEAWAY,
            selectedTableId = order.tableId,
            orderNotes = order.notes ?: "",
            screenState = if (order.status == "open") OrderScreenState.EDITING_ORDER else OrderScreenState.ORDER_TERMINAL,
            isDirty = false,
            serverUpdatedAt = order.updatedAt?.toLong(),
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
            subcategories = _uiState.value.subcategories,
            items = _uiState.value.items,
            tables = _uiState.value.tables,
            categoriesLoaded = _uiState.value.categoriesLoaded,
            permissions = _uiState.value.permissions,
            username = _uiState.value.username,
        )
    }

    /**
     * Soft reload: re-checks the day when not open, otherwise reloads menu,
     * tables, and permissions and refetches the current order (if any).
     * Does not reset auth or navigate.
     */
    fun refresh() {
        if (_uiState.value.screenState == OrderScreenState.DAY_NOT_OPEN) {
            checkDayOpen()
            return
        }
        viewModelScope.launch {
            loadMenu()
            loadTables()
            loadPermissions()
            val order = refetchOrder()
            if (order != null) {
                hydrateFromOrder(order)
            }
        }
    }

    fun checkDayOpen() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)

        viewModelScope.launch {
            try {
                val response = withContext(ioDispatcher) {
                    dayRepo!!.getCurrent().execute()
                }

                if (response.isSuccessful) {
                    val body = response.body()
                    if (body != null && body.open == true) {
                        // Day is now open — return to SELECTING_TYPE
                        _uiState.value = _uiState.value.copy(
                            screenState = OrderScreenState.SELECTING_TYPE,
                            isLoading = false,
                            error = null,
                        )
                    } else {
                        // Still not open
                        _uiState.value = _uiState.value.copy(
                            screenState = OrderScreenState.DAY_NOT_OPEN,
                            isLoading = false,
                            error = "No open business day. Please open a day first.",
                        )
                    }
                } else {
                    _uiState.value = _uiState.value.copy(
                        screenState = OrderScreenState.DAY_NOT_OPEN,
                        isLoading = false,
                        error = "Unable to check day status (${response.code()})",
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    screenState = OrderScreenState.DAY_NOT_OPEN,
                    isLoading = false,
                    error = "Network error checking day status" + (e.message?.let { ": $it" } ?: ""),
                )
            }
        }
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
