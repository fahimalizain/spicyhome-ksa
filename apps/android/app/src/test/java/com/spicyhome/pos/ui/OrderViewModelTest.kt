package com.spicyhome.pos.ui.order

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.MenuApi
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.apis.TablesApi
import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.TableResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.util.MoneyFormatter
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import java.math.BigDecimal

@OptIn(ExperimentalCoroutinesApi::class)
class OrderViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private val viewModelStores = mutableListOf<ViewModelStore>()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider
    private lateinit var menuApi: MenuApi

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")
    private val authTokenFlow = MutableStateFlow("fake-jwt-token")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns authTokenFlow

        // Stable stubs for API factories — no NPEs, no swallowed exceptions
        menuApi = mockk(relaxed = true)
        val ordersApi = mockk<OrdersApi>(relaxed = true)
        val tablesApi = mockk<TablesApi>(relaxed = true)

        every { apiClientProvider.createMenuApi(any(), any()) } returns menuApi
        every { apiClientProvider.createOrdersApi(any(), any()) } returns ordersApi
        every { apiClientProvider.createTablesApi(any(), any()) } returns tablesApi

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
    }

    @After
    fun tearDown() {
        viewModelStores.forEach { it.clear() }
        viewModelStores.clear()
        Dispatchers.resetMain()
    }

    private fun createViewModel(): OrderViewModel {
        val store = ViewModelStore()
        viewModelStores.add(store)
        val factory = OrderViewModel.Factory(
            preferencesManager = preferencesManager,
            apiClientProvider = apiClientProvider,
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
    fun `proceedToBuild transitions to BUILDING_ORDER state`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.BUILDING_ORDER)
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
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.BUILDING_ORDER)
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
        // After load, selectedCategoryId is null (All)
        assertThat(vm.uiState.value.filteredItems).hasSize(3)

        // Select category 2
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

        // Switch back to All
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

        // All view: only active items
        assertThat(state.filteredItems).containsExactly(active1, active2).inOrder()
        // Items list should have filtered inactive out
        assertThat(state.items).containsExactly(active1, active2).inOrder()

        // Category 1: only active items in that category
        vm.selectCategory(1)
        assertThat(vm.uiState.value.filteredItems).containsExactly(active1)
    }

    private fun stubMenuItems(items: List<ItemResponse>) {
        val call = mockk<Call<List<ItemResponse>>>(relaxed = true)
        every { menuApi.menuControllerListItems(any()) } returns call
        every { call.execute() } returns Response.success(items)
    }

    private fun createItem(
        id: Long,
        name: String,
        priceHalalas: Long,
        vatRateBp: Long,
        categoryId: Long = 1,
        isActive: Boolean = true,
    ): ItemResponse = ItemResponse(
        id = BigDecimal.valueOf(id),
        categoryId = BigDecimal.valueOf(categoryId),
        name = name,
        nameAr = null,
        priceHalalas = BigDecimal.valueOf(priceHalalas),
        vatRateBp = BigDecimal.valueOf(vatRateBp),
        sortOrder = BigDecimal.ZERO,
        isActive = isActive,
        createdAt = BigDecimal.ZERO,
        updatedAt = BigDecimal.ZERO,
        createdBy = null,
        updatedBy = null,
    )
}
