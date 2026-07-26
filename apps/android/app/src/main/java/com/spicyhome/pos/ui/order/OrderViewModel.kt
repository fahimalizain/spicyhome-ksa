package com.spicyhome.pos.ui.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.OrderItemResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.TableResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import io.sentry.Sentry
import com.spicyhome.pos.data.repository.MenuRepository
import com.spicyhome.pos.data.repository.OrderRepository
import com.spicyhome.pos.data.repository.TableRepository
import com.spicyhome.pos.util.MoneyFormatter
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import java.math.BigDecimal

data class CartItem(
    val item: ItemResponse,
    val qty: Int = 1,
    val notes: String = "",
)

enum class OrderType(val value: String) {
    DINE_IN("dine_in"),
    TAKEAWAY("takeaway"),
}

enum class OrderScreenState {
    SELECTING_TYPE,  // choose dine-in/takeaway + table if dine-in
    BUILDING_ORDER,  // add items to cart
    ORDER_CREATED,   // order created, items being added/removed
    ORDER_PAID,      // order paid
    DAY_NOT_OPEN,    // no open business day — must open day first
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
    // Day opening
    val openingCash: String = "",
    val dayOpeningError: String? = null,
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

    init {
        viewModelScope.launch {
            bearerToken = preferencesManager.authToken.first() ?: ""
            baseUrl = preferencesManager.serverUrl.first() ?: ""
            initRepos()
            loadMenu()
            loadTables()
            applyInitialTableContext()
        }
    }

    private fun initRepos() {
        menuRepo = MenuRepository(apiClientProvider.createMenuApi(baseUrl, bearerToken))
        orderRepo = OrderRepository(apiClientProvider.createOrdersApi(baseUrl, bearerToken))
        tableRepo = TableRepository(apiClientProvider.createTablesApi(baseUrl, bearerToken))
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
                        _uiState.value = _uiState.value.copy(
                            currentOrderId = order.id.toLong(),
                            currentOrder = order,
                            orderType = if (order.type == "dine_in") OrderType.DINE_IN else OrderType.TAKEAWAY,
                            selectedTableId = (order.tableId as? BigDecimal)?.toLong(),
                            screenState = OrderScreenState.ORDER_CREATED,
                        )
                    }
                } catch (_: Exception) {
                }
            }
        } else if (initialTableId != null) {
            _uiState.value = _uiState.value.copy(
                orderType = OrderType.DINE_IN,
                selectedTableId = initialTableId,
                screenState = OrderScreenState.BUILDING_ORDER,
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

    fun proceedToBuild() {
        val state = _uiState.value
        if (state.orderType == OrderType.DINE_IN && state.selectedTableId == null) {
            _uiState.value = state.copy(error = "Please select a table")
            return
        }
        _uiState.value = state.copy(
            screenState = OrderScreenState.BUILDING_ORDER,
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
                        isLoading = false,
                    )
                    // Now add all cart items to the order
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

        if (hasError) {
            _uiState.value = _uiState.value.copy(
                screenState = OrderScreenState.ORDER_CREATED,
                error = "Some items could not be added",
            )
        } else {
            _uiState.value = _uiState.value.copy(
                screenState = OrderScreenState.ORDER_CREATED,
                error = null,
            )
            refreshOrder()
        }
    }

    fun refreshOrder() {
        val orderId = _uiState.value.currentOrderId ?: return
        viewModelScope.launch {
            try {
                val response = withContext(ioDispatcher) {
                    orderRepo!!.getOrder(orderId).execute()
                }
                if (response.isSuccessful) {
                    val order = response.body()!!
                    _uiState.value = _uiState.value.copy(currentOrder = order)
                }
            } catch (_: Exception) {
                // Silently fail refresh
            }
        }
    }

    fun payOrder() {
        val orderId = _uiState.value.currentOrderId ?: return
        _uiState.value = _uiState.value.copy(isLoading = true)
        viewModelScope.launch {
            try {
                val response = withContext(ioDispatcher) {
                    orderRepo!!.payOrder(orderId).execute()
                }
                if (response.isSuccessful) {
                    _uiState.value = _uiState.value.copy(
                        screenState = OrderScreenState.ORDER_PAID,
                        isLoading = false,
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Failed to pay order (${response.code()})",
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

    fun newOrder() {
        _uiState.value = OrderUiState(
            categories = _uiState.value.categories,
            items = _uiState.value.items,
            tables = _uiState.value.tables,
            categoriesLoaded = _uiState.value.categoriesLoaded,
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
        private val initialTableId: Long? = null,
        private val initialOrderId: Long? = null,
        private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return OrderViewModel(
                preferencesManager,
                apiClientProvider,
                initialTableId,
                initialOrderId,
                ioDispatcher,
            ) as T
        }
    }
}
