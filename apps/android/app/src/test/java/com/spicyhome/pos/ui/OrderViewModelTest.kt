package com.spicyhome.pos.ui.order

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.AuthApi
import com.spicyhome.client.apis.DayApi
import com.spicyhome.client.apis.MenuApi
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.apis.TablesApi
import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.CurrentDayResponse
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.MeResponse
import com.spicyhome.client.models.OrderItemResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.SyncOrderItemsDto
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
import kotlinx.coroutines.test.StandardTestDispatcher
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
    private lateinit var dayApi: DayApi

    private val eventsFlow = MutableSharedFlow<RealtimeEvent>(extraBufferCapacity = 64)

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")
    private val authTokenFlow = MutableStateFlow("fake-jwt-token")
    private val usernameFlow = MutableStateFlow<String?>("admin")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)
        realtimeClient = mockk(relaxed = true)
        menuApi = mockk(relaxed = true)
        ordersApi = mockk(relaxed = true)
        authApi = mockk(relaxed = true)
        dayApi = mockk(relaxed = true)
        val tablesApi = mockk<TablesApi>(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns authTokenFlow
        every { preferencesManager.username } returns usernameFlow
        every { realtimeClient.events } returns eventsFlow

        every { apiClientProvider.createMenuApi(any(), any()) } returns menuApi
        every { apiClientProvider.createOrdersApi(any(), any()) } returns ordersApi
        every { apiClientProvider.createTablesApi(any(), any()) } returns tablesApi
        every { apiClientProvider.createAuthApi(any(), any()) } returns authApi
        every { apiClientProvider.createDayApi(any(), any()) } returns dayApi

        // Default stub for day API — return open day so existing tests work
        val dayCall = mockk<Call<CurrentDayResponse>>(relaxed = true)
        every { dayApi.businessDayControllerGetCurrent() } returns dayCall
        every { dayCall.execute() } returns Response.success(CurrentDayResponse(open = true))

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

    // --- Order-level notes ---

    @Test
    fun `updateOrderNotes stages locally before create`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.updateOrderNotes("call on arrival")
        assertThat(vm.uiState.value.orderNotes).isEqualTo("call on arrival")
        assertThat(vm.uiState.value.currentOrderId).isNull()
    }

    @Test
    fun `hydrateFromOrder with null notes resets orderNotes to empty`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.updateOrderNotes("stale staged value")
        val order = createOrderResponse(1L, 100L, "open", emptyList(), notes = null)
        vm.hydrateFromOrder(order)
        assertThat(vm.uiState.value.orderNotes).isEmpty()
    }

    @Test
    fun `updateOrderNotes PATCHes meta on an open order`() = runTest(testDispatcher) {
        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Pizza", unitPriceHalalas = 2000L, vatRateBp = 1500,
            qty = 1, totalHalalas = 2000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 5000L)
        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        // Stub updateOrderMeta
        val metaCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerUpdateOrderMeta(any(), any()) } returns metaCall
        val updatedOrder = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 6000L, notes = "extra napkins")
        every { metaCall.execute() } returns Response.success(updatedOrder)

        vm.updateOrderNotes("extra napkins")

        verify {
            ordersApi.ordersControllerUpdateOrderMeta(
                1L,
                match { dto ->
                    dto.baseUpdatedAt == 5000L &&
                        dto.type == com.spicyhome.client.models.UpdateOrderMetaDto.Type.dine_in &&
                        dto.tableId == 5L &&
                        dto.notes == "extra napkins"
                }
            )
        }
        val state = vm.uiState.value
        assertThat(state.orderNotes).isEqualTo("extra napkins")
        assertThat(state.isSyncing).isFalse()
        assertThat(state.isDirty).isFalse()
    }

    @Test
    fun `updateOrderNotes blank input sends empty string and clears`() = runTest(testDispatcher) {
        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Pizza", unitPriceHalalas = 2000L, vatRateBp = 1500,
            qty = 1, totalHalalas = 2000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 5000L, notes = "old")
        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        val metaCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerUpdateOrderMeta(any(), any()) } returns metaCall
        val updatedOrder = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 6000L, notes = null)
        every { metaCall.execute() } returns Response.success(updatedOrder)

        vm.updateOrderNotes("   ")

        verify {
            ordersApi.ordersControllerUpdateOrderMeta(
                1L,
                match { dto -> dto.notes == "" }
            )
        }
        assertThat(vm.uiState.value.orderNotes).isEmpty()
    }

    @Test
    fun `updateOrderNotes with same value is a no-op`() = runTest(testDispatcher) {
        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Pizza", unitPriceHalalas = 2000L, vatRateBp = 1500,
            qty = 1, totalHalalas = 2000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 5000L, notes = "same")
        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        vm.updateOrderNotes("same")

        verify(exactly = 0) { ordersApi.ordersControllerUpdateOrderMeta(any(), any()) }
        assertThat(vm.uiState.value.isSyncing).isFalse()
    }

    @Test
    fun `updateOrderNotes 409 refetches and resets`() = runTest(testDispatcher) {
        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Pizza", unitPriceHalalas = 2000L, vatRateBp = 1500,
            qty = 1, totalHalalas = 2000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 5000L, notes = "server value")
        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        val metaCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerUpdateOrderMeta(any(), any()) } returns metaCall
        every { metaCall.execute() } returns Response.error(409, okhttp3.ResponseBody.create(null, "Conflict"))

        // Refetch returns the server truth
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(1L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(order)

        vm.updateOrderNotes("my local edit")

        val state = vm.uiState.value
        assertThat(state.isSyncing).isFalse()
        assertThat(state.error).contains("modified elsewhere")
        assertThat(state.orderNotes).isEqualTo("server value")
    }

    @Test
    fun `clearCart resets orderNotes`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.updateOrderNotes("call on arrival")
        vm.clearCart()
        assertThat(vm.uiState.value.orderNotes).isEmpty()
    }

    @Test
    fun `createOrder passes staged order notes`() = runTest(testDispatcher) {
        val item = createItem(1, "Burger", 1500, 1500)
        stubMenuItems(listOf(item))

        val vm = createViewModel()
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        vm.addToCart(item)
        vm.updateOrderNotes("call on arrival")

        val createCall = mockk<Call<com.spicyhome.client.models.CreateOrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerCreateOrder(any()) } returns createCall
        every { createCall.execute() } returns Response.success(
            com.spicyhome.client.models.CreateOrderResponse(id = 10L, uuid = "uuid", orderNo = 200L, documentId = "INV26-10")
        )

        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(10L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(
            createOrderResponse(10L, 200L, "open", emptyList(), updatedAt = 5000L, notes = "call on arrival")
        )

        val syncCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerSyncItems(any(), any()) } returns syncCall
        every { syncCall.execute() } returns Response.success(
            createOrderResponse(10L, 200L, "open", emptyList(), updatedAt = 6000L, notes = "call on arrival")
        )

        vm.createOrder()

        verify {
            ordersApi.ordersControllerCreateOrder(
                match { dto -> dto.notes == "call on arrival" }
            )
        }
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

    // --- Item search filtering tests ---

    @Test
    fun `setItemSearch filters by English name substring`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Butter Chicken", 3450L, 1500, categoryId = 1, nameAr = "\u062F\u062C\u0627\u062C \u0628\u0627\u0644\u0632\u0628\u062F\u0629")
        val item2 = createItem(2, "Chicken Biryani", 2875L, 1500, categoryId = 1, nameAr = "\u0628\u0631\u064A\u0627\u0646\u064A \u062F\u062C\u0627\u062C")
        val item3 = createItem(3, "Falafel Wrap", 1150L, 1500, categoryId = 2)
        stubMenuItems(listOf(item1, item2, item3))

        val vm = createViewModel()
        vm.setItemSearch("chick")
        val state = vm.uiState.value

        assertThat(state.filteredItems).hasSize(2)
        assertThat(state.filteredItems.map { it.name }).containsExactly("Butter Chicken", "Chicken Biryani")
    }

    @Test
    fun `setItemSearch matches nameAr`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Butter Chicken", 3450L, 1500, nameAr = "\u062F\u062C\u0627\u062C \u0628\u0627\u0644\u0632\u0628\u062F\u0629")
        val item2 = createItem(2, "Chicken Biryani", 2875L, 1500, nameAr = "\u0628\u0631\u064A\u0627\u0646\u064A \u062F\u062C\u0627\u062C")
        val item3 = createItem(3, "Falafel Wrap", 1150L, 1500)
        stubMenuItems(listOf(item1, item2, item3))

        val vm = createViewModel()
        vm.setItemSearch("\u062F\u062C\u0627\u062C")
        val state = vm.uiState.value

        assertThat(state.filteredItems).hasSize(2)
        assertThat(state.filteredItems.map { it.name }).containsExactly("Butter Chicken", "Chicken Biryani")
    }

    @Test
    fun `category and search compose`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Butter Chicken", 3450L, 1500, categoryId = 1, nameAr = "\u062F\u062C\u0627\u062C \u0628\u0627\u0644\u0632\u0628\u062F\u0629")
        val item2 = createItem(2, "Falafel Wrap", 1150L, 1500, categoryId = 2)
        val item3 = createItem(3, "Chicken Biryani", 2875L, 1500, categoryId = 1)
        stubMenuItems(listOf(item1, item2, item3))

        val vm = createViewModel()
        vm.selectCategory(1)
        vm.setItemSearch("chick")
        val state = vm.uiState.value

        assertThat(state.filteredItems).hasSize(2)
        assertThat(state.filteredItems.map { it.name }).containsExactly("Butter Chicken", "Chicken Biryani")
    }

    @Test
    fun `category plus non-matching search returns empty`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Burger", 1000L, 1500, categoryId = 1)
        val item2 = createItem(2, "Pizza", 2000L, 1500, categoryId = 1)
        val item3 = createItem(3, "Hummus", 800L, 1500, categoryId = 2)
        stubMenuItems(listOf(item1, item2, item3))

        val vm = createViewModel()
        vm.selectCategory(1)
        vm.setItemSearch("hummus")
        val state = vm.uiState.value

        assertThat(state.filteredItems).isEmpty()
    }

    @Test
    fun `whitespace-only query shows full category list`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Burger", 1000L, 1500, categoryId = 1)
        val item2 = createItem(2, "Pizza", 2000L, 1500, categoryId = 1)
        val item3 = createItem(3, "Hummus", 800L, 1500, categoryId = 2)
        stubMenuItems(listOf(item1, item2, item3))

        val vm = createViewModel()
        vm.selectCategory(1)
        vm.setItemSearch("   ")
        val state = vm.uiState.value

        assertThat(state.filteredItems).hasSize(2)
    }

    @Test
    fun `clear search restores full list`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Burger", 1000L, 1500, categoryId = 1)
        val item2 = createItem(2, "Pizza", 2000L, 1500, categoryId = 2)
        stubMenuItems(listOf(item1, item2))

        val vm = createViewModel()
        vm.setItemSearch("burger")
        assertThat(vm.uiState.value.filteredItems).hasSize(1)

        vm.setItemSearch("")
        assertThat(vm.uiState.value.filteredItems).hasSize(2)
    }

    @Test
    fun `no match returns empty filteredItems`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Burger", 1000L, 1500)
        stubMenuItems(listOf(item1))

        val vm = createViewModel()
        vm.setItemSearch("xyzzy")
        assertThat(vm.uiState.value.filteredItems).isEmpty()
    }

    @Test
    fun `newOrder clears search query`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Burger", 1000L, 1500)
        stubMenuItems(listOf(item1))

        val vm = createViewModel()
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        vm.setItemSearch("burger")
        assertThat(vm.uiState.value.itemSearchQuery).isEqualTo("burger")

        vm.newOrder()
        assertThat(vm.uiState.value.itemSearchQuery).isEmpty()
    }

    @Test
    fun `case insensitive search`() = runTest(testDispatcher) {
        val item1 = createItem(1, "Butter Chicken", 3450L, 1500)
        val item2 = createItem(2, "Falafel", 1150L, 1500)
        stubMenuItems(listOf(item1, item2))

        val vm = createViewModel()
        vm.setItemSearch("BUTTER")
        assertThat(vm.uiState.value.filteredItems).hasSize(1)
        assertThat(vm.uiState.value.filteredItems[0].name).isEqualTo("Butter Chicken")
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
            documentId = "INV26-42",
            isStandardInvoice = false,
            type = "dine_in", tableId = 5L, dayOpeningId = 1L,
            status = "open",
            subtotalHalalas = 2608L, vatHalalas = 392L, totalHalalas = 3000L,
            discountHalalas = 0L,
            deliveryPartnerId = null,
            deliveryPartnerTitle = null,
            deliveryExternalRef = null,
            notes = "call on arrival",
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
            items = listOf(oi),
            events = emptyList(),
            payments = emptyList(),
        )
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(42L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(order)

        val vm = createViewModel(initialOrderId = 42L)

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
        assertThat(state.currentOrderId).isEqualTo(42L)
        assertThat(state.currentOrder).isNotNull()
        assertThat(state.orderNotes).isEqualTo("call on arrival")
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].orderItemId).isEqualTo(100L)
        assertThat(state.cart[0].qty).isEqualTo(2)
        assertThat(state.cart[0].notes).isEqualTo("no onions")
        assertThat(state.cart[0].item.name).isEqualTo("Burger")
        assertThat(state.orderType).isEqualTo(OrderType.DINE_IN)
        assertThat(state.selectedTableId).isEqualTo(5L)
        assertThat(state.isDirty).isFalse()
    }

    @Test
    fun `initialOrderId paid order transitions to ORDER_TERMINAL`() = runTest(testDispatcher) {
        val order = OrderResponse(
            id = 42L, orderNo = 1001L, uuid = "abc-123",
            documentId = "INV26-42",
            isStandardInvoice = false,
            type = "dine_in", tableId = 5L, dayOpeningId = 1L,
            status = "paid",
            subtotalHalalas = 4000L, vatHalalas = 600L, totalHalalas = 4600L,
            discountHalalas = 0L,
            deliveryPartnerId = null,
            deliveryPartnerTitle = null,
            deliveryExternalRef = null,
            notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
            items = emptyList(),
            events = emptyList(),
            payments = emptyList(),
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

    @Test
    fun `initialOrderId starts in LOADING before hydrate runs`() = runTest {
        // Standard dispatcher: the init coroutine stays queued until advanced,
        // so the constructor state is observable.
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)

        val order = createOrderResponse(42L, 1001L, "open", emptyList())
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(42L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(order)

        val store = ViewModelStore()
        viewModelStores.add(store)
        val factory = OrderViewModel.Factory(
            preferencesManager = preferencesManager,
            apiClientProvider = apiClientProvider,
            realtimeClient = realtimeClient,
            initialOrderId = 42L,
            ioDispatcher = dispatcher,
        )
        val vm = ViewModelProvider(store, factory)[OrderViewModel::class.java]

        // Before any coroutine runs: LOADING, not the type selector
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.LOADING)

        dispatcher.scheduler.advanceUntilIdle()

        // After hydrate: open order lands on EDITING_ORDER
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
        assertThat(vm.uiState.value.currentOrderId).isEqualTo(42L)
    }

    @Test
    fun `initialTableId starts in LOADING before init applies table context`() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)

        val store = ViewModelStore()
        viewModelStores.add(store)
        val factory = OrderViewModel.Factory(
            preferencesManager = preferencesManager,
            apiClientProvider = apiClientProvider,
            realtimeClient = realtimeClient,
            initialTableId = 7L,
            ioDispatcher = dispatcher,
        )
        val vm = ViewModelProvider(store, factory)[OrderViewModel::class.java]

        // Constructor pre-seeds the table and starts in LOADING
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.LOADING)
        assertThat(vm.uiState.value.selectedTableId).isEqualTo(7L)

        dispatcher.scheduler.advanceUntilIdle()

        // Free-table deep link exits LOADING into EDITING_ORDER with DINE_IN
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
        assertThat(vm.uiState.value.selectedTableId).isEqualTo(7L)
        assertThat(vm.uiState.value.orderType).isEqualTo(OrderType.DINE_IN)
    }

    @Test
    fun `initialTableId exits LOADING into EDITING_ORDER with table context`() = runTest(testDispatcher) {
        val vm = createViewModel(initialTableId = 7L)

        // Unconfined: applyInitialTableContext has already run
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
        assertThat(vm.uiState.value.selectedTableId).isEqualTo(7L)
        assertThat(vm.uiState.value.orderType).isEqualTo(OrderType.DINE_IN)
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
        assertThat(state.isDirty).isFalse()
    }

    @Test
    fun `hydrateFromOrder synthesizes ItemResponse when menu item missing`() = runTest(testDispatcher) {
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

    // --- Staged cart: dirty detection ---

    @Test
    fun `isDirty is false right after hydrate`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Pizza", 2000, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Pizza", unitPriceHalalas = 2000L, vatRateBp = 1500,
            qty = 3, totalHalalas = 6000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi))
        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        assertThat(vm.uiState.value.isDirty).isFalse()
    }

    @Test
    fun `isDirty becomes true after local add`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Pizza", 2000, 1500)
        stubMenuItems(listOf(menuItem))

        val vm = createViewModel()
        val order = createOrderResponse(1L, 100L, "open", emptyList())
        vm.hydrateFromOrder(order)

        // Add a new item locally — this should mark dirty
        vm.addToCart(menuItem)
        assertThat(vm.uiState.value.cart).hasSize(1)
        assertThat(vm.uiState.value.isDirty).isTrue()
    }

    @Test
    fun `isDirty becomes true after local qty increase`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Pizza", 2000, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Pizza", unitPriceHalalas = 2000L, vatRateBp = 1500,
            qty = 1, totalHalalas = 2000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val vm = createViewModel()
        val order = createOrderResponse(1L, 100L, "open", listOf(oi))
        vm.hydrateFromOrder(order)

        vm.increaseQty(0)
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(2)
        assertThat(vm.uiState.value.isDirty).isTrue()
    }

    @Test
    fun `isDirty becomes true after notes change`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Pizza", 2000, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Pizza", unitPriceHalalas = 2000L, vatRateBp = 1500,
            qty = 1, totalHalalas = 2000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val vm = createViewModel()
        val order = createOrderResponse(1L, 100L, "open", listOf(oi))
        vm.hydrateFromOrder(order)

        vm.updateItemNotes(0, "extra cheese")
        assertThat(vm.uiState.value.cart[0].notes).isEqualTo("extra cheese")
        assertThat(vm.uiState.value.isDirty).isTrue()
    }

    // --- Send to Kitchen (D3) ---

    @Test
    fun `sendToKitchen calls syncItems with full cart`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 2, totalHalalas = 3000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 5000L)
        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        // Simulate: user added one locally
        val newItem = createItem(20, "Fries", 500, 1500)
        stubMenuItems(listOf(menuItem, newItem))
        vm.addToCart(newItem)

        // Stub syncItems
        val syncCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerSyncItems(any(), any()) } returns syncCall
        val syncedOrder = createOrderResponse(1L, 100L, "open", listOf(
            oi.copy(qty = 2, totalHalalas = 3000L),
            OrderItemResponse(
                id = 201L, orderId = 1L, itemId = 20L,
                itemName = "Fries", unitPriceHalalas = 500L, vatRateBp = 1500,
                qty = 1, totalHalalas = 500L, notes = null,
                createdAt = 1700000000L, updatedAt = 1700000000L,
                createdBy = 1L, updatedBy = 1L,
            ),
        ), updatedAt = 6000L)
        every { syncCall.execute() } returns Response.success(syncedOrder)

        vm.sendToKitchen()

        val state = vm.uiState.value
        assertThat(state.isSyncing).isFalse()
        assertThat(state.cart).hasSize(2)
        assertThat(state.isDirty).isFalse()
    }

    @Test
    fun `sendToKitchen with blank item notes sends empty string not null`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 2, totalHalalas = 3000L, notes = "original",
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 5000L)
        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        // User clears the item notes
        vm.updateItemNotes(0, "   ")

        // Stub syncItems
        val syncCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerSyncItems(any(), any()) } returns syncCall
        val syncedOrder = createOrderResponse(1L, 100L, "open", listOf(oi.copy(notes = null)), updatedAt = 6000L)
        every { syncCall.execute() } returns Response.success(syncedOrder)

        vm.sendToKitchen()

        // "" (not null) — null is omitted by Moshi and would keep the server notes
        verify {
            ordersApi.ordersControllerSyncItems(
                1L,
                match { dto ->
                    dto.items.size == 1 &&
                        dto.items[0].orderItemId == 200L &&
                        dto.items[0].notes == ""
                }
            )
        }
        assertThat(vm.uiState.value.cart[0].notes).isEmpty()
    }

    @Test
    fun `sendToKitchen 409 resets to server state`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 2, totalHalalas = 3000L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 5000L)
        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        // Add local changes
        vm.addToCart(createItem(20, "Fries", 500, 1500))

        // Stub syncItems to return 409
        val syncCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerSyncItems(any(), any()) } returns syncCall
        every { syncCall.execute() } returns Response.error(409, okhttp3.ResponseBody.create(null, "Conflict"))

        // Stub refetch to return original state
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(1L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(order)

        vm.sendToKitchen()

        val state = vm.uiState.value
        assertThat(state.isSyncing).isFalse()
        assertThat(state.error).contains("modified elsewhere")
        assertThat(state.cart).hasSize(1) // Reset to server state
    }

    // --- Discard (D14) ---

    @Test
    fun `discardChanges restores snapshot cart and clears isDirty`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 2, totalHalalas = 3000L, notes = "original",
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 5000L)
        val vm = createViewModel()
        vm.hydrateFromOrder(order)

        // Make local changes
        vm.addToCart(createItem(20, "Fries", 500, 1500))
        assertThat(vm.uiState.value.cart).hasSize(2)
        assertThat(vm.uiState.value.isDirty).isTrue()

        // Discard
        vm.discardChanges()

        assertThat(vm.uiState.value.cart).hasSize(1) // Back to snapshot
        assertThat(vm.uiState.value.cart[0].notes).isEqualTo("original")
        assertThat(vm.uiState.value.isDirty).isFalse()
    }

    // --- createOrder tests (D10: create + sync) ---

    @Test
    fun `createOrder calls create then getOrder then syncItems`() = runTest(testDispatcher) {
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
            com.spicyhome.client.models.CreateOrderResponse(id = 10L, uuid = "uuid", orderNo = 200L, documentId = "INV26-10")
        )

        // B6: After creation, the VM refetches to get real updatedAt
        val oi = OrderItemResponse(
            id = 500L, orderId = 10L, itemId = 1L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 1500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(10L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(
            createOrderResponse(10L, 200L, "open", listOf(oi), updatedAt = 5000L)
        )

        // Stub syncItems — VM uses refetched updatedAt (5000) as baseUpdatedAt
        val syncCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerSyncItems(any(), any()) } returns syncCall
        every { syncCall.execute() } returns Response.success(
            createOrderResponse(10L, 200L, "open", listOf(oi), updatedAt = 6000L)
        )

        vm.createOrder()

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
        assertThat(state.currentOrderId).isEqualTo(10L)
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].orderItemId).isEqualTo(500L)
        assertThat(state.isDirty).isFalse()
    }

    @Test
    fun `createOrder with empty cart returns error`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        vm.createOrder()
        assertThat(vm.uiState.value.error).isEqualTo("Cart is empty")
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

        val vm = createViewModel(initialOrderId = 42L)
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)

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

        eventsFlow.emit(RealtimeEvent("order.item.added", """{"orderId":42}""", 1700000001L))

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.EDITING_ORDER)
    }

    @Test
    fun `WS event with no currentOrderId does nothing`() = runTest(testDispatcher) {
        val vm = createViewModel()
        eventsFlow.emit(RealtimeEvent("order.paid", """{"orderId":1}""", 1700000000L))

        val state = vm.uiState.value
        assertThat(state.currentOrderId).isNull()
        assertThat(state.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
    }

    // --- checkDayOpen (DAY_NOT_OPEN refresh) tests ---

    @Test
    fun `checkDayOpen when day now open returns to SELECTING_TYPE`() = runTest(testDispatcher) {
        // Override day API to return open
        val dayCall = mockk<Call<CurrentDayResponse>>(relaxed = true)
        every { dayApi.businessDayControllerGetCurrent() } returns dayCall
        every { dayCall.execute() } returns Response.success(CurrentDayResponse(open = true))

        val vm = createViewModel()
        // Manually set DAY_NOT_OPEN state
        vm.checkDayOpen()

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(state.isLoading).isFalse()
        assertThat(state.error).isNull()
    }

    @Test
    fun `checkDayOpen when day still closed stays DAY_NOT_OPEN`() = runTest(testDispatcher) {
        val dayCall = mockk<Call<CurrentDayResponse>>(relaxed = true)
        every { dayApi.businessDayControllerGetCurrent() } returns dayCall
        every { dayCall.execute() } returns Response.success(CurrentDayResponse(open = false))

        val vm = createViewModel()
        vm.checkDayOpen()

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.DAY_NOT_OPEN)
        assertThat(state.error).contains("No open business day")
    }

    @Test
    fun `checkDayOpen on network error shows error`() = runTest(testDispatcher) {
        val dayCall = mockk<Call<CurrentDayResponse>>(relaxed = true)
        every { dayApi.businessDayControllerGetCurrent() } returns dayCall
        every { dayCall.execute() } throws java.net.ConnectException("timeout")

        val vm = createViewModel()
        vm.checkDayOpen()

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.DAY_NOT_OPEN)
        assertThat(state.error).contains("Network error checking day status")
    }

    @Test
    fun `checkDayOpen on HTTP error shows error`() = runTest(testDispatcher) {
        val dayCall = mockk<Call<CurrentDayResponse>>(relaxed = true)
        every { dayApi.businessDayControllerGetCurrent() } returns dayCall
        every { dayCall.execute() } returns Response.error(500, okhttp3.ResponseBody.create(null, ""))

        val vm = createViewModel()
        vm.checkDayOpen()

        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.DAY_NOT_OPEN)
        assertThat(state.error).contains("500")
    }

    // --- Username (user dropdown) tests ---

    @Test
    fun `username loads from preferences on init`() = runTest(testDispatcher) {
        usernameFlow.value = "cashier1"

        val vm = createViewModel()

        // getMe fails by default, so the prefs username is not upgraded
        assertThat(vm.uiState.value.username).isEqualTo("cashier1")
    }

    @Test
    fun `username prefers me name when available`() = runTest(testDispatcher) {
        usernameFlow.value = "cashier1"
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

        assertThat(vm.uiState.value.username).isEqualTo("Test User")
    }

    @Test
    fun `username keeps prefs when me name blank`() = runTest(testDispatcher) {
        usernameFlow.value = "cashier1"
        val meResponse = MeResponse(
            id = 1L, username = "test", name = "", roleId = 1L,
            isActive = true, roleName = "Waiter",
            createOrder = false, updateOrder = false, deleteOrderItem = false,
            voidOrder = false, refundOrder = false, payOrder = false,
            manageMenu = false, manageTables = false,
            managePrinters = false, manageUsers = false, manageSettings = false,
        )
        val meCall = mockk<Call<MeResponse>>(relaxed = true)
        every { authApi.authControllerGetMe() } returns meCall
        every { meCall.execute() } returns Response.success(meResponse)

        val vm = createViewModel()

        assertThat(vm.uiState.value.username).isEqualTo("cashier1")
    }

    @Test
    fun `newOrder preserves username`() = runTest(testDispatcher) {
        val vm = createViewModel()
        assertThat(vm.uiState.value.username).isEqualTo("admin")

        vm.newOrder()

        assertThat(vm.uiState.value.username).isEqualTo("admin")
    }

    // --- refresh tests ---

    @Test
    fun `refresh reloads menu`() = runTest(testDispatcher) {
        val vm = createViewModel()

        vm.refresh()

        // init loadMenu + refresh loadMenu
        verify(atLeast = 2) { menuApi.menuControllerListCategories() }
        verify(atLeast = 2) { menuApi.menuControllerListItems(any()) }
    }

    @Test
    fun `refresh when DAY_NOT_OPEN calls checkDayOpen`() = runTest(testDispatcher) {
        // Day closed → land on DAY_NOT_OPEN
        val dayCall = mockk<Call<CurrentDayResponse>>(relaxed = true)
        every { dayApi.businessDayControllerGetCurrent() } returns dayCall
        every { dayCall.execute() } returns Response.success(CurrentDayResponse(open = false))

        val vm = createViewModel()
        vm.checkDayOpen()
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.DAY_NOT_OPEN)

        vm.refresh()

        // explicit checkDayOpen + the one triggered by refresh
        verify(atLeast = 2) { dayApi.businessDayControllerGetCurrent() }
        // refresh() short-circuits to checkDayOpen — menu is not reloaded
        verify(exactly = 1) { menuApi.menuControllerListCategories() }
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.DAY_NOT_OPEN)
    }

    @Test
    fun `refresh refetches current order when currentOrderId set`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 100L, orderId = 42L, itemId = 10L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = 1, totalHalalas = 1500L, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val openOrder = createOrderResponse(42L, 1001L, "open", listOf(oi), updatedAt = 5000L)
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(42L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(openOrder)

        val vm = createViewModel(initialOrderId = 42L)
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(1)

        // Server order changed (qty bumped by another terminal)
        val updatedOi = oi.copy(qty = 3, totalHalalas = 4500L, updatedAt = 6000L)
        val updatedOrder = openOrder.copy(updatedAt = 6000L, items = listOf(updatedOi))
        every { getOrderCall.execute() } returns Response.success(updatedOrder)

        vm.refresh()

        verify(atLeast = 2) { ordersApi.ordersControllerGetOrder(42L) }
        val state = vm.uiState.value
        assertThat(state.cart[0].qty).isEqualTo(3)
        assertThat(state.currentOrder?.updatedAt).isEqualTo(6000L)
        assertThat(state.isDirty).isFalse()
    }

    // --- ADR 0005: qty floor on synced lines ---

    private fun hydrateOpenOrder(qty: Int): OrderViewModel {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))

        val oi = OrderItemResponse(
            id = 200L, orderId = 1L, itemId = 10L,
            itemName = "Burger", unitPriceHalalas = 1500L, vatRateBp = 1500,
            qty = qty, totalHalalas = 1500L * qty, notes = null,
            createdAt = 1700000000L, updatedAt = 1700000000L,
            createdBy = 1L, updatedBy = 1L,
        )
        val order = createOrderResponse(1L, 100L, "open", listOf(oi), updatedAt = 5000L)
        val vm = createViewModel()
        vm.hydrateFromOrder(order)
        return vm
    }

    @Test
    fun `decrease below floor on synced line is no-op`() = runTest(testDispatcher) {
        val vm = hydrateOpenOrder(qty = 2)
        vm.decreaseQty(0)
        assertThat(vm.uiState.value.cart).hasSize(1)
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(2)
        assertThat(vm.uiState.value.isDirty).isFalse()
    }

    @Test
    fun `decrease from local bump above floor stops at floor`() = runTest(testDispatcher) {
        val vm = hydrateOpenOrder(qty = 2)
        vm.increaseQty(0) // 3
        vm.increaseQty(0) // 4
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(4)
        vm.decreaseQty(0) // 3
        vm.decreaseQty(0) // 2 (floor)
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(2)
        vm.decreaseQty(0) // must not go below floor
        assertThat(vm.uiState.value.cart).hasSize(1)
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(2)
    }

    @Test
    fun `decrease at qty 1 on synced line with floor 1 does not remove`() = runTest(testDispatcher) {
        val vm = hydrateOpenOrder(qty = 1)
        vm.decreaseQty(0)
        assertThat(vm.uiState.value.cart).hasSize(1)
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(1)
    }

    @Test
    fun `remove on synced line is no-op`() = runTest(testDispatcher) {
        val vm = hydrateOpenOrder(qty = 2)
        vm.removeFromCart(0)
        assertThat(vm.uiState.value.cart).hasSize(1)
        assertThat(vm.uiState.value.cart[0].orderItemId).isEqualTo(200L)
    }

    @Test
    fun `increase still works on synced lines`() = runTest(testDispatcher) {
        val vm = hydrateOpenOrder(qty = 2)
        vm.increaseQty(0)
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(3)
        assertThat(vm.uiState.value.isDirty).isTrue()
    }

    @Test
    fun `remove and decrease still work on new local lines on open order`() = runTest(testDispatcher) {
        val menuItem = createItem(10, "Burger", 1500, 1500)
        stubMenuItems(listOf(menuItem))
        val vm = createViewModel()
        val order = createOrderResponse(1L, 100L, "open", emptyList())
        vm.hydrateFromOrder(order)

        // New local line (orderItemId == null)
        vm.addToCart(menuItem)
        vm.increaseQty(0) // qty 2
        assertThat(vm.uiState.value.cart[0].orderItemId).isNull()

        vm.decreaseQty(0) // qty 1
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(1)
        vm.decreaseQty(0) // removes (qty was 1, orderItemId null)
        assertThat(vm.uiState.value.cart).isEmpty()

        vm.addToCart(menuItem)
        vm.removeFromCart(0)
        assertThat(vm.uiState.value.cart).isEmpty()
    }

    @Test
    fun `serverFloorQty returns 0 for new local lines`() = runTest(testDispatcher) {
        val vm = createViewModel()
        val item = createItem(1, "A", 1000, 1500)
        vm.addToCart(item)
        assertThat(serverFloorQty(vm.uiState.value.cart[0], vm.uiState.value.snapshotCart)).isEqualTo(0)
    }

    @Test
    fun `serverFloorQty returns snapshot qty for synced lines`() = runTest(testDispatcher) {
        val vm = hydrateOpenOrder(qty = 3)
        assertThat(serverFloorQty(vm.uiState.value.cart[0], vm.uiState.value.snapshotCart)).isEqualTo(3)
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
        nameAr: String? = null,
    ): ItemResponse = ItemResponse(
        id = id,
        categoryId = categoryId,
        name = name,
        nameAr = nameAr,
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
        updatedAt: Long = 1700000000L,
        notes: String? = null,
    ): OrderResponse = OrderResponse(
        id = id,
        orderNo = orderNo,
        uuid = "uuid-$id",
        documentId = "INV26-$id",
        isStandardInvoice = false,
        type = "dine_in",
        tableId = 5L,
        dayOpeningId = 1L,
        status = status,
        subtotalHalalas = items.sumOf { it.totalHalalas - (it.totalHalalas * it.vatRateBp / (10000 + it.vatRateBp)) },
        vatHalalas = items.sumOf { it.totalHalalas * it.vatRateBp / (10000 + it.vatRateBp) },
        totalHalalas = items.sumOf { it.totalHalalas },
        discountHalalas = 0L,
        deliveryPartnerId = null,
        deliveryPartnerTitle = null,
        deliveryExternalRef = null,
        notes = notes,
        createdAt = 1700000000L,
        updatedAt = updatedAt,
        createdBy = 1L,
        updatedBy = 1L,
        items = items,
        events = emptyList(),
        payments = emptyList(),
    )
}
