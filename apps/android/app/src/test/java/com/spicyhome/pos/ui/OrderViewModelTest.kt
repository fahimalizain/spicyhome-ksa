package com.spicyhome.pos.ui.order

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.AuthApi
import com.spicyhome.client.apis.MenuApi
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.apis.TablesApi
import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.MeResponse
import com.spicyhome.client.models.OrderItemResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.TableResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
import com.spicyhome.pos.data.realtime.RealtimeEvent
import com.spicyhome.pos.util.MoneyFormatter
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import retrofit2.Call
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class OrderViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private val viewModelStores = mutableListOf<ViewModelStore>()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider
    private lateinit var realtimeClient: RealtimeClient
    private lateinit var menuApi: MenuApi
    private lateinit var ordersApi: OrdersApi
    private lateinit var authApi: AuthApi

    private val eventsFlow = MutableSharedFlow<RealtimeEvent>(extraBufferCapacity = 64)

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")
    private val authTokenFlow = MutableStateFlow("fake-jwt-token")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)
        realtimeClient = mockk(relaxed = true)
        menuApi = mockk(relaxed = true)
        ordersApi = mockk(relaxed = true)
        authApi = mockk(relaxed = true)
        val tablesApi = mockk<TablesApi>(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns authTokenFlow
        every { realtimeClient.events } returns eventsFlow

        every { apiClientProvider.createMenuApi(any(), any()) } returns menuApi
        every { apiClientProvider.createOrdersApi(any(), any()) } returns ordersApi
        every { apiClientProvider.createTablesApi(any(), any()) } returns tablesApi
        every { apiClientProvider.createAuthApi(any(), any()) } returns authApi

        // Stub API calls so loadMenu/loadTables succeed without IO races
        val catCall = mockk<Call<List<CategoryResponse>>>(relaxed = true)
        every { menuApi.menuControllerListCategories() } returns catCall
        every { catCall.execute() } returns Response.success(emptyList())

        val itemCall = mockk<Call<List<ItemResponse>>>(relaxed = true)
        every { menuApi.menuControllerListItems(any()) } returns itemCall
        every { itemCall.execute() } returns Response.success(emptyList())

        val tblCall = mockk<Call<List<TableResponse>>>(relaxed = true)
        every { tablesApi.tablesControllerList() } returns tblCall
        every { tblCall.execute() } returns Response.success(emptyList())

        // Stub getMe to return failure so permissions stay default
        val meCall = mockk<Call<MeResponse>>(relaxed = true)
        every { authApi.authControllerGetMe() } returns meCall
        every { meCall.execute() } returns Response.error(500, okhttp3.ResponseBody.create(null, ""))
    }

    @After
    fun tearDown() {
        viewModelStores.forEach { it.clear() }
        viewModelStores.clear()
        Dispatchers.resetMain()
    }

    private fun createViewModel(
        initialTableId: Long? = null,
        initialOrderId: Long? = null,
    ): OrderViewModel {
        val store = ViewModelStore()
        viewModelStores.add(store)
        val factory = OrderViewModel.Factory(
            preferencesManager = preferencesManager,
            apiClientProvider = apiClientProvider,
            realtimeClient = realtimeClient,
            initialTableId = initialTableId,
            initialOrderId = initialOrderId,
            ioDispatcher = testDispatcher,
        )
        return ViewModelProvider(store, factory)[OrderViewModel::class.java]
    }

    @Test
    fun `initial state is selecting type with empty cart`() = runTest(testDispatcher) {
        val vm = createViewModel()
        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(state.isCartEmpty).isTrue()
        assertThat(state.cartItemCount).isEqualTo(0)
        assertThat(state.cartTotalHalalas).isEqualTo(0)
    }

    @Test
    fun `addToCart adds new item`() = runTest(testDispatcher) {
        val vm = createViewModel()
        val item = createItem(1, "Chicken Biryani", 2000, 1500)
        vm.addToCart(item)
        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].item.name).isEqualTo("Chicken Biryani")
        assertThat(state.cart[0].qty).isEqualTo(1)
    }

    @Test
    fun `addToCart increments qty for existing item`() = runTest(testDispatcher) {
        val vm = createViewModel()
        val item = createItem(1, "Burger", 1500, 1500)
        vm.addToCart(item)
        vm.addToCart(item)
        vm.addToCart(item)
        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].qty).isEqualTo(3)
    }

    @Test
    fun `removeFromCart removes item at index`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.addToCart(createItem(1, "A", 1000, 1500))
        vm.addToCart(createItem(2, "B", 2000, 1500))
        vm.removeFromCart(0)
        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].item.name).isEqualTo("B")
    }

    @Test
    fun `clearCart empties the cart`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.addToCart(createItem(1, "A", 1000, 1500))
        vm.addToCart(createItem(2, "B", 2000, 1500))
        vm.clearCart()
        val state = vm.uiState.value
        assertThat(state.cart).isEmpty()
        assertThat(state.isCartEmpty).isTrue()
    }

    @Test
    fun `decreaseQty removes item when qty reaches 1`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.addToCart(createItem(1, "Item", 1000, 1500))
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(1)
        vm.decreaseQty(0)
        assertThat(vm.uiState.value.cart).isEmpty()
    }

    @Test
    fun `decreaseQty decrements qty when qty above 1`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.addToCart(createItem(1, "Item", 1000, 1500))
        vm.increaseQty(0)
        vm.increaseQty(0)
        vm.decreaseQty(0)
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(2)
    }

    @Test
    fun `cartTotals computes correctly with multiple items`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.addToCart(createItem(1, "Item1", 1150, 1500))
        vm.increaseQty(0)
        vm.addToCart(createItem(2, "Item2", 2300, 1500))
        val state = vm.uiState.value
        assertThat(state.cartTotalHalalas).isEqualTo(4600L)
        assertThat(state.cartItemCount).isEqualTo(3)
        val (_, excl, vat) = MoneyFormatter.cartItemTotal(1150, 2, 1500)
        assertThat(excl + vat).isEqualTo(2300L)
    }

    @Test
    fun `cartTotalHalalas sums all item prices times qty`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.addToCart(createItem(1, "A", 1000, 1500))
        vm.addToCart(createItem(2, "B", 2000, 1500))
        vm.increaseQty(0)
        assertThat(vm.uiState.value.cartTotalHalalas).isEqualTo(4000L)
    }

    @Test
    fun `setOrderType changes order type`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.setOrderType(OrderType.TAKEAWAY)
        assertThat(vm.uiState.value.orderType).isEqualTo(OrderType.TAKEAWAY)
    }

    @Test
    fun `setTable sets selected table`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.setTable(3)
        assertThat(vm.uiState.value.selectedTableId).isEqualTo(3)
    }

    @Test
    fun `proceedToBuild transitions to EDITING_ORDER state`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
    }

    @Test
    fun `proceedToBuild requires table for dine_in`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.proceedToBuild()
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(vm.uiState.value.error).isNotNull()
    }

    @Test
    fun `proceedToBuild with table for dine_in works`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.setOrderType(OrderType.DINE_IN)
        vm.setTable(2)
        vm.proceedToBuild()
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
    }

    @Test
    fun `newOrder resets to SELECTING_TYPE with empty cart`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.addToCart(createItem(1, "A", 1000, 1500))
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        vm.newOrder()
        val reset = vm.uiState.value
        assertThat(reset.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(reset.isCartEmpty).isTrue()
        assertThat(reset.currentOrderId).isNull()
    }

    @Test
    fun `updateItemNotes updates notes for cart item`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.addToCart(createItem(1, "A", 1000, 1500))
        vm.updateItemNotes(0, "no onions, extra spicy")
        assertThat(vm.uiState.value.cart[0].notes).isEqualTo("no onions, extra spicy")
    }

    // --- Category / item filtering tests (client-side) ---

    @Test
    fun `initial load with All selected shows all active items`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Burger", 1000, 1500, categoryId = 1)
        val item2 = createItem(2, "Pizza", 2000, 1500, categoryId = 2)
        val item3 = createItem(3, "Salad", 800, 1500, categoryId = 2)
        stubMenuItems(listOf(item1, item2, item3))

        val vm = createViewModel()
        val state = vm.uiState.value

        assertThat(state.selectedCategoryId).isNull()
        assertThat(state.filteredItems).containsExactly(item1, item2, item3).inOrder()
    }

    @Test
    fun `selectCategory filters to that category active items`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Burger", 1000, 1500, categoryId = 1)
        val item2 = createItem(2, "Pizza", 2000, 1500, categoryId = 2)
        val item3 = createItem(3, "Salad", 800, 1500, categoryId = 2)
        stubMenuItems(listOf(item1, item2, item3))

        val vm = createViewModel()
        assertThat(vm.uiState.value.filteredItems).hasSize(3)

        vm.selectCategory(2)
        val state = vm.uiState.value

        assertThat(state.selectedCategoryId).isEqualTo(2)
        assertThat(state.filteredItems).containsExactly(item2, item3).inOrder()
    }

    @Test
    fun `selectCategory null after a category shows full list again`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Burger", 1000, 1500, categoryId = 1)
        val item2 = createItem(2, "Pizza", 2000, 1500, categoryId = 2)
        stubMenuItems(listOf(item1, item2))

        val vm = createViewModel()
        vm.selectCategory(1)
        assertThat(vm.uiState.value.filteredItems).hasSize(1)

        vm.selectCategory(null)
        val state = vm.uiState.value

        assertThat(state.selectedCategoryId).isNull()
        assertThat(state.filteredItems).containsExactly(item1, item2).inOrder()
    }

    @Test
    fun `inactive items are excluded from All and category views`() = runTest(testDispatcher) {
        val active1 = createItem(1, "Active A", 1000, 1500, categoryId = 1, isActive = true)
        val inactive = createItem(2, "Inactive", 2000, 1500, categoryId = 1, isActive = false)
        val active2 = createItem(3, "Active B", 800, 1500, categoryId = 2, isActive = true)
        stubMenuItems(listOf(active1, inactive, active2))

        val vm = createViewModel()
        val state = vm.uiState.value

        assertThat(state.filteredItems).containsExactly(active1, active2).inOrder()
        assertThat(state.items).containsExactly(active1, active2).inOrder()

        vm.selectCategory(1)
        assertThat(vm.uiState.value.filteredItems).containsExactly(active1)
    }

    // --- initialOrderId tests ---

    @Test
    fun `initialOrderId open order hydrates cart and sets EDITING_ORDER`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 100L, orderId = 42L, itemId = 10L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 2, totalHalalas = 3000L, notes = "no onions",
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = OrderResponse(
            id = 42L, orderNo = 1001L, uuid = "abc-123",
            type = "dine_in", tableId = 5L, dayOpeningId = 1L,
            status = "open",
            subtotalHalalas = 2608L, vatHalalas = 392L, totalHalalas = 3000L,
            discountHalalas = 0L,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
            items = listOf(oi),
            auditLog = emptyList(),
        )
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(42L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(order)

        val vm = createViewModel(initialOrderId = 42L)

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
        assertThat(state.currentOrderId).isEqualTo(42L)
        assertThat(state.currentOrder).isNotNull()
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].orderItemId).isEqualTo(100L)
        assertThat(state.cart[0].qty).isEqualTo(2)
        assertThat(state.cart[0].notes).isEqualTo("no onions")
        assertThat(state.cart[0].item.name).isEqualTo("Burger")
        assertThat(state.orderType).isEqualTo(OrderType.DINE_IN)
        assertThat(state.selectedTableId).isEqualTo(5L)
    }

    @Test
    fun `initialOrderId paid order transitions to ORDER_TERMINAL`() = runTest(testDispatcher) {
        val order = OrderResponse(
            id = 42L, orderNo = 1001L, uuid = "abc-123",
            type = "dine_in", tableId = 5L, dayOpeningId = 1L,
            status = "paid",
            subtotalHalalas = 4000L, vatHalalas = 600L, totalHalalas = 4600L,
            discountHalalas = 0L,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
            items = emptyList(),
            events = emptyList(),
        )
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(42L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(order)

        val vm = createViewModel(initialOrderId = 42L)

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.ORDER_TERMINAL)
        assertThat(state.currentOrderId).isEqualTo(42L)
    }

    @Test
    fun `initialOrderId failure surfaces error and stays on SELECTING_TYPE`() = runTest(testDispatcher) {
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(99L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.error(404, okhttp3.ResponseBody.create(null, ""))

        val vm = createViewModel(initialOrderId = 99L)

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(state.error).isNotNull()
        assertThat(state.error).contains("404")
    }

    // --- hydrateFromOrder tests ---

    @Test
    fun `hydrateFromOrder maps orderItemId qty and notes`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Pizza", 2000, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Pizza", unitPriceHalalas = 2000L, vatRateBp = 1500,
            qty = 3, totalHalalas = 6000L, notes = "extra cheese",
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi))

        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].orderItemId).isEqualTo(200L)
        assertThat(state.cart[0].qty).isEqualTo(3)
        assertThat(state.cart[0].notes).isEqualTo("extra cheese")
        assertThat(state.cart[0].item.id).isEqualTo(10L)
        assertThat(state.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
    }

    @Test
    fun `hydrateFromOrder synthesizes ItemResponse when menu item missing`() = runTest(testDispatcher) {
        // No menu items loaded — synthesize from snapshot
        val oi = OrderItemResponse(
            id = 300L, orderId = 1L, itemId = 99L,
            itemName = "Deleted Item", unitPriceHalalas = 1200L, vatRateBp = 1500,
            qty = 1, totalHalalas = 1200L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi))

        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].orderItemId).isEqualTo(300L)
        assertThat(state.cart[0].item.name).isEqualTo("Deleted Item")
        assertThat(state.cart[0].item.priceHalalas).isEqualTo(1200L)
        assertThat(state.cart[0].item.vatRateBp).isEqualTo(1500)
    }

    @Test
    fun `hydrateFromOrder with voided order sets ORDER_TERMINAL`() = runTest(testDispatcher) {
        val oi = OrderItemResponse(
            id = 1L, orderId = 1L, itemId = null,
            itemName = "X", unitPriceHalalas = 1000L, vatRateBp = 1500,
            qty = 1, totalHalalas = 1000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "voided", listOf(oi))

        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.ORDER_TERMINAL)
    }

    // --- Server-synced mutation tests ---

    @Test
    fun `addItemServer success hydrates with orderItemId from refetch`() = runTest(testDispatcher) {
        val menuItem = createItem(5, "Cola", 500, 1500)
        stubMenuItems(listOf(menuItem))

        // Set up an open order
        val vm = createViewModel()
        setOpenOrderState(vm, 1L, "open")

        // Stub addItem
        val addItemCall = mockk<Call<com.spicyhome.client.models.AddOrderItemResponse>>(relaxed = true)
        every { ordersApi.ordersControllerAddItem(any(), any()) } returns addItemCall
        every { addItemCall.execute() } returns Response.success(
            com.spicyhome.client.models.AddOrderItemResponse(success = true, orderItemId = 400L)
        )

        // Stub refetch (getOrder) to return order with the new item
        val newOi = OrderItemResponse(
            id = 400L, orderId = 1L, itemId = 5L,
            itemName = "Cola", unitPriceHalalas = 500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val refetchedOrder = createOrderResponse(1L, 100L, "open", listOf(newOi))
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(1L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(refetchedOrder)

        vm.addItemServer(menuItem)

        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].orderItemId).isEqualTo(400L)
        assertThat(state.cart[0].qty).isEqualTo(1)
        assertThat(state.cart[0].item.name).isEqualTo("Cola")
    }

    @Test
    fun `addItemServer failure rolls back cart`() = runTest(testDispatcher) {
        val menuItem = createItem(5, "Cola", 500, 1500)
        stubMenuItems(listOf(menuItem))

        val vm = createViewModel()
        vm.addToCart(createItem(1, "Existing", 1000, 1500))
        setOpenOrderState(vm, 1L, "open")

        // The initial cart has orderItemId=null so it persists through the snapshot
        val initialCartSize = vm.uiState.value.cart.size

        // Stub addItem to throw
        every { ordersApi.ordersControllerAddItem(any(), any()) } throws RuntimeException("Network error")

        // Stub refetch to also fail
        every { ordersApi.ordersControllerGetOrder(1L) } throws RuntimeException("Network error")

        vm.addItemServer(menuItem)

        // Cart should be rolled back to snapshot state
        val state = vm.uiState.value
        assertThat(state.cart).hasSize(initialCartSize)
        assertThat(state.error).contains("Network error")
    }

    @Test
    fun `updateQtyServer success updates qty and refetches`() = runTest(testDispatcher) {
        val menuItem = createItem(5, "Cola", 500, 1500)
        stubMenuItems(listOf(menuItem))

        val vm = createViewModel()
        // Hydrate cart with server-synced item
        val existingOi = OrderItemResponse(
            id = 400L, orderId = 1L, itemId = 5L,
            itemName = "Cola", unitPriceHalalas = 500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(existingOi))
        vm.hydrateFromOrder(order)

        // Stub updateItem
        val updateCall = mockk<Call<com.spicyhome.client.models.SuccessResponse>>(relaxed = true)
        every { ordersApi.ordersControllerUpdateItem(any(), any(), any()) } returns updateCall
        every { updateCall.execute() } returns Response.success(
            com.spicyhome.client.models.SuccessResponse(success = true)
        )

        // Stub refetch with updated qty
        val updatedOi = existingOi.copy(qty = 3, totalHalalas = 1500L)
        val refetchedOrder = createOrderResponse(1L, 100L, "open", listOf(updatedOi))
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(1L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(refetchedOrder)

        vm.updateQtyServer(400L, 3)

        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].qty).isEqualTo(3)
        assertThat(state.cart[0].orderItemId).isEqualTo(400L)
    }

    @Test
    fun `updateQtyServer failure rolls back qty`() = runTest(testDispatcher) {
        val menuItem = createItem(5, "Cola", 500, 1500)
        stubMenuItems(listOf(menuItem))

        val vm = createViewModel()
        val existingOi = OrderItemResponse(
            id = 400L, orderId = 1L, itemId = 5L,
            itemName = "Cola", unitPriceHalalas = 500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(existingOi))
        vm.hydrateFromOrder(order)

        // Stub updateItem to throw
        every { ordersApi.ordersControllerUpdateItem(any(), any(), any()) } throws RuntimeException("Network error")
        // Stub refetch to also fail
        every { ordersApi.ordersControllerGetOrder(1L) } throws RuntimeException("Network error")

        vm.updateQtyServer(400L, 3)

        // Cart should be rolled back — qty back to 1
        val state = vm.uiState.value
        assertThat(state.cart[0].qty).isEqualTo(1)
        assertThat(state.error).contains("Network error")
    }

    @Test
    fun `removeItemServer success removes item and refetches`() = runTest(testDispatcher) {
        val menuItem = createItem(5, "Cola", 500, 1500)
        stubMenuItems(listOf(menuItem))

        val vm = createViewModel()
        val existingOi = OrderItemResponse(
            id = 400L, orderId = 1L, itemId = 5L,
            itemName = "Cola", unitPriceHalalas = 500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(existingOi))
        vm.hydrateFromOrder(order)
        assertThat(vm.uiState.value.cart).hasSize(1)

        // Stub removeItem
        val removeCall = mockk<Call<com.spicyhome.client.models.SuccessResponse>>(relaxed = true)
        every { ordersApi.ordersControllerRemoveItem(any(), any()) } returns removeCall
        every { removeCall.execute() } returns Response.success(
            com.spicyhome.client.models.SuccessResponse(success = true)
        )

        // Stub refetch with empty items
        val refetchedOrder = createOrderResponse(1L, 100L, "open", emptyList())
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(1L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(refetchedOrder)

        vm.removeItemServer(400L)

        val state = vm.uiState.value
        assertThat(state.cart).isEmpty()
    }

    @Test
    fun `removeItemServer failure rolls back cart`() = runTest(testDispatcher) {
        val menuItem = createItem(5, "Cola", 500, 1500)
        stubMenuItems(listOf(menuItem))

        val vm = createViewModel()
        val existingOi = OrderItemResponse(
            id = 400L, orderId = 1L, itemId = 5L,
            itemName = "Cola", unitPriceHalalas = 500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(existingOi))
        vm.hydrateFromOrder(order)

        // Stub removeItem to throw
        every { ordersApi.ordersControllerRemoveItem(any(), any()) } throws RuntimeException("Network error")
        every { ordersApi.ordersControllerGetOrder(1L) } throws RuntimeException("Network error")

        vm.removeItemServer(400L)

        // Cart should be restored
        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.error).contains("Network error")
    }

    // --- createOrder tests ---

    @Test
    fun `createOrder success populates orderItemId via refetch`() = runTest(testDispatcher) {
        val item = createItem(1, "Burger", 1500, 1500)
        stubMenuItems(listOf(item))

        val vm = createViewModel()
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        vm.addToCart(item)

        // Stub createOrder
        val createCall = mockk<Call<com.spicyhome.client.models.CreateOrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerCreateOrder(any()) } returns createCall
        every { createCall.execute() } returns Response.success(
            com.spicyhome.client.models.CreateOrderResponse(id = 10L, uuid = "uuid", orderNo = 200L)
        )

        // Stub addItem
        val addItemCall = mockk<Call<com.spicyhome.client.models.AddOrderItemResponse>>(relaxed = true)
        every { ordersApi.ordersControllerAddItem(any(), any()) } returns addItemCall
        every { addItemCall.execute() } returns Response.success(
            com.spicyhome.client.models.AddOrderItemResponse(success = true, orderItemId = 500L)
        )

        // Stub refetch
        val oi = OrderItemResponse(
            id = 500L, orderId = 10L, itemId = 1L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 1500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val refetchedOrder = createOrderResponse(10L, 200L, "open", listOf(oi))
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(10L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(refetchedOrder)

        vm.createOrder()

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
        assertThat(state.currentOrderId).isEqualTo(10L)
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].orderItemId).isEqualTo(500L)
    }

    @Test
    fun `createOrder partial failure refetches and hydrates cart`() = runTest(testDispatcher) {
        val item = createItem(1, "Burger", 1500, 1500)
        stubMenuItems(listOf(item))

        val vm = createViewModel()
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        vm.addToCart(item)

        // Stub createOrder success
        val createCall = mockk<Call<com.spicyhome.client.models.CreateOrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerCreateOrder(any()) } returns createCall
        every { createCall.execute() } returns Response.success(
            com.spicyhome.client.models.CreateOrderResponse(id = 10L, uuid = "uuid", orderNo = 200L)
        )

        // Stub addItem to fail
        every { ordersApi.ordersControllerAddItem(any(), any()) } throws RuntimeException("Add failed")

        // Stub refetch returns empty items (partial failure)
        val refetchedOrder = createOrderResponse(10L, 200L, "open", emptyList())
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(10L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(refetchedOrder)

        vm.createOrder()

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
        assertThat(state.currentOrderId).isEqualTo(10L)
        assertThat(state.error).contains("Some items could not be added")
    }

    // --- Permissions tests ---

    @Test
    fun `permissions default to all false`() = runTest(testDispatcher) {
        val vm = createViewModel()
        val perms = vm.uiState.value.permissions
        assertThat(perms.createOrder).isFalse()
        assertThat(perms.updateOrder).isFalse()
        assertThat(perms.deleteOrderItem).isFalse()
    }

    @Test
    fun `permissions load from MeResponse`() = runTest(testDispatcher) {
        // Override the getMe stub to return success with specific permissions
        val meResponse = MeResponse(
            id = 1L, username = "test", name = "Test User", roleId = 1L,
            isActive = true, roleName = "Admin",
            createOrder = true, updateOrder = true, deleteOrderItem = true,
            voidOrder = false, refundOrder = false, payOrder = false,
            manageMenu = false, manageTables = false,
            managePrinters = false, manageUsers = false, manageSettings = false,
        )
        val meCall = mockk<Call<MeResponse>>(relaxed = true)
        every { authApi.authControllerGetMe() } returns meCall
        every { meCall.execute() } returns Response.success(meResponse)

        val vm = createViewModel()
        val perms = vm.uiState.value.permissions
        assertThat(perms.createOrder).isTrue()
        assertThat(perms.updateOrder).isTrue()
        assertThat(perms.deleteOrderItem).isTrue()
        assertThat(perms.voidOrder).isFalse()
        assertThat(perms.payOrder).isFalse()
    }

    @Test
    fun `Permissions_from_null returns all false`() {
        val perms = Permissions.from(null)
        assertThat(perms.createOrder).isFalse()
        assertThat(perms.updateOrder).isFalse()
        assertThat(perms.deleteOrderItem).isFalse()
    }

    @Test
    fun `Permissions_from_me maps correctly`() {
        val me = MeResponse(
            id = 1L, username = "test", name = "Test", roleId = 1L,
            isActive = true, roleName = "Waiter",
            createOrder = true, updateOrder = true, deleteOrderItem = true,
            voidOrder = false, refundOrder = false, payOrder = false,
            manageMenu = false, manageTables = false,
            managePrinters = false, manageUsers = false, manageSettings = false,
        )
        val perms = Permissions.from(me)
        assertThat(perms.createOrder).isTrue()
        assertThat(perms.deleteOrderItem).isTrue()
    }

    // --- WS tests ---

    @Test
    fun `WS order_paid event transitions to ORDER_TERMINAL when currentOrderId set`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 100L, orderId = 42L, itemId = 10L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 1500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val openOrder = createOrderResponse(42L, 1001L, "open", listOf(oi))
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(42L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(openOrder)

        // Create VM with open order
        val vm = createViewModel(initialOrderId = 42L)
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)

        // Now emit a paid event — refetch needs to return paid
        val paidOrder = openOrder.copy(status = "paid")
        every { getOrderCall.execute() } returns Response.success(paidOrder)
        eventsFlow.emit(RealtimeEvent("order.paid", """{"orderId":42}""", 1700000001L))

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.ORDER_TERMINAL)
        assertThat(state.currentOrder?.status).isEqualTo("paid")
    }

    @Test
    fun `WS event when order still open stays EDITING_ORDER`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 100L, orderId = 42L, itemId = 10L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 1500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val openOrder = createOrderResponse(42L, 1001L, "open", listOf(oi))
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(42L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(openOrder)

        val vm = createViewModel(initialOrderId = 42L)
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)

        // Emit some other order event, refetch still returns open
        eventsFlow.emit(RealtimeEvent("order.item.added", """{"orderId":42}""", 1700000001L))

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
    }

    @Test
    fun `WS event with no currentOrderId does nothing`() = runTest(testDispatcher) {
        val vm = createViewModel()
        // VM has no currentOrderId initially
        eventsFlow.emit(RealtimeEvent("order.paid", """{"orderId":1}""", 1700000000L))

        val state = vm.uiState.value
        assertThat(state.currentOrderId).isNull()
        assertThat(state.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
    }

    @Test
    fun `updateQtyServer with newQty lt 1 delegates to removeItemServer`() = runTest(testDispatcher) {
        val menuItem = createItem(5, "Cola", 500, 1500)
        stubMenuItems(listOf(menuItem))

        val vm = createViewModel()
        val existingOi = OrderItemResponse(
            id = 400L, orderId = 1L, itemId = 5L,
            itemName = "Cola", unitPriceHalalas = 500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(existingOi))
        vm.hydrateFromOrder(order)
        assertThat(vm.uiState.value.cart).hasSize(1)

        // Stub removeItem (the path updateQtyServer should delegate to)
        val removeCall = mockk<Call<com.spicyhome.client.models.SuccessResponse>>(relaxed = true)
        every { ordersApi.ordersControllerRemoveItem(any(), any()) } returns removeCall
        every { removeCall.execute() } returns Response.success(
            com.spicyhome.client.models.SuccessResponse(success = true)
        )

        // Stub refetch with empty items
        val refetchedOrder = createOrderResponse(1L, 100L, "open", emptyList())
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(1L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(refetchedOrder)

        // Call updateQtyServer with 0 — should delegate to removeItemServer
        vm.updateQtyServer(400L, 0)

        val state = vm.uiState.value
        assertThat(state.cart).isEmpty()

        // Verify updateItem was NOT called
        verify(exactly = 0) { ordersApi.ordersControllerUpdateItem(any(), any(), any()) }
    }

    // --- createOrder isLoading tests (Bug 2) ---

    @Test
    fun `createOrder isLoading stays true until addCartItemsToOrder finishes`() = runTest(testDispatcher) {
        val item = createItem(1, "Burger", 1500, 1500)
        stubMenuItems(listOf(item))

        val vm = createViewModel()
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        vm.addToCart(item)

        // Stub createOrder
        val createCall = mockk<Call<com.spicyhome.client.models.CreateOrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerCreateOrder(any()) } returns createCall
        every { createCall.execute() } returns Response.success(
            com.spicyhome.client.models.CreateOrderResponse(id = 10L, uuid = "uuid", orderNo = 200L)
        )

        // Stub addItem
        val addItemCall = mockk<Call<com.spicyhome.client.models.AddOrderItemResponse>>(relaxed = true)
        every { ordersApi.ordersControllerAddItem(any(), any()) } returns addItemCall
        every { addItemCall.execute() } returns Response.success(
            com.spicyhome.client.models.AddOrderItemResponse(success = true, orderItemId = 500L)
        )

        // Stub refetch
        val oi = OrderItemResponse(
            id = 500L, orderId = 10L, itemId = 1L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 1500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val refetchedOrder = createOrderResponse(10L, 200L, "open", listOf(oi))
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(10L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(refetchedOrder)

        vm.createOrder()

        val state = vm.uiState.value
        // After everything completes, isLoading must be false
        assertThat(state.isLoading).isFalse()
        assertThat(state.currentOrderId).isEqualTo(10L)
        assertThat(state.currentOrder).isNotNull()
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].orderItemId).isEqualTo(500L)
    }

    // --- Helpers ---

    private fun stubMenuItems(items: List<ItemResponse>) {
        val call = mockk<Call<List<ItemResponse>>>(relaxed = true)
        every { menuApi.menuControllerListItems(any()) } returns call
        every { call.execute() } returns Response.success(items)
    }

    private fun createItem(
        id: Long,
        name: String,
        priceHalalas: Long,
        vatRateBp: Int,
        categoryId: Long = 1,
        isActive: Boolean = true,
    ): ItemResponse = ItemResponse(
        id = id,
        categoryId = categoryId,
        name = name,
        nameAr = null,
        priceHalalas = priceHalalas,
        vatRateBp = vatRateBp,
        sortOrder = 0,
        isActive = isActive,
        createdAt = 0L,
        updatedAt = 0L,
        createdBy = null,
        updatedBy = null,
    )

    private fun createOrderResponse(
        id: Long,
        orderNo: Long,
        status: String,
        items: List<OrderItemResponse>,
    ): OrderResponse = OrderResponse(
        id = id,
        orderNo = orderNo,
        uuid = "uuid-$id",
        type = "dine_in",
        tableId = 5L,
        dayOpeningId = 1L,
        status = status,
        subtotalHalalas = items.sumOf { it.totalHalalas - (it.totalHalalas * it.vatRateBp / (10000 + it.vatRateBp)) },
        vatHalalas = items.sumOf { it.totalHalalas * it.vatRateBp / (10000 + it.vatRateBp) },
        totalHalalas = items.sumOf { it.totalHalalas },
        discountHalalas = 0L,
        createdAt = 1700000000L,
        updatedAt = 1700000000L,
        createdBy = 1L,
        updatedBy = 1L,
        items = items,
        auditLog = emptyList(),
    )

    private fun setOpenOrderState(vm: OrderViewModel, orderId: Long, status: String) {
        // Directly set the state for testing server-synced methods
        val state = vm.uiState.value
        // Use internal state flow access to set open order context
        // We can do this by hydrating a minimal order
        val currentOrder = createOrderResponse(orderId, 100L, status, emptyList())
        vm.hydrateFromOrder(currentOrder)
    }
}
