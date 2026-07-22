package com.spicyhome.pos.ui.order

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

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider

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
        val menuApi = mockk<MenuApi>(relaxed = true)
        val ordersApi = mockk<OrdersApi>(relaxed = true)
        val tablesApi = mockk<TablesApi>(relaxed = true)

        every { apiClientProvider.createMenuApi(any(), any()) } returns menuApi
        every { apiClientProvider.createOrdersApi(any(), any()) } returns ordersApi
        every { apiClientProvider.createTablesApi(any(), any()) } returns tablesApi

        // Stub API calls so loadCategories/loadTables succeed without IO races
        val catCall = mockk<Call<List<CategoryResponse>>>(relaxed = true)
        every { menuApi.menuControllerListCategories() } returns catCall
        every { catCall.execute() } returns Response.success(emptyList())

        val tblCall = mockk<Call<List<TableResponse>>>(relaxed = true)
        every { tablesApi.tablesControllerList() } returns tblCall
        every { tblCall.execute() } returns Response.success(emptyList())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state is selecting type with empty cart`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        val state = vm.uiState.value
        assertThat(state.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(state.isCartEmpty).isTrue()
        assertThat(state.cartItemCount).isEqualTo(0)
        assertThat(state.cartTotalHalalas).isEqualTo(0)
    }

    @Test
    fun `addToCart adds new item`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        val item = createItem(1, "Chicken Biryani", 2000, 1500)
        vm.addToCart(item)
        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].item.name).isEqualTo("Chicken Biryani")
        assertThat(state.cart[0].qty).isEqualTo(1)
    }

    @Test
    fun `addToCart increments qty for existing item`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        val item = createItem(1, "Burger", 1500, 1500)
        vm.addToCart(item)
        vm.addToCart(item)
        vm.addToCart(item)
        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].qty).isEqualTo(3)
    }

    @Test
    fun `removeFromCart removes item at index`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.addToCart(createItem(1, "A", 1000, 1500))
        vm.addToCart(createItem(2, "B", 2000, 1500))
        vm.removeFromCart(0)
        val state = vm.uiState.value
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].item.name).isEqualTo("B")
    }

    @Test
    fun `clearCart empties the cart`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.addToCart(createItem(1, "A", 1000, 1500))
        vm.addToCart(createItem(2, "B", 2000, 1500))
        vm.clearCart()
        val state = vm.uiState.value
        assertThat(state.cart).isEmpty()
        assertThat(state.isCartEmpty).isTrue()
    }

    @Test
    fun `decreaseQty removes item when qty reaches 1`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.addToCart(createItem(1, "Item", 1000, 1500))
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(1)
        vm.decreaseQty(0)
        assertThat(vm.uiState.value.cart).isEmpty()
    }

    @Test
    fun `decreaseQty decrements qty when qty above 1`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.addToCart(createItem(1, "Item", 1000, 1500))
        vm.increaseQty(0)
        vm.increaseQty(0)
        vm.decreaseQty(0)
        assertThat(vm.uiState.value.cart[0].qty).isEqualTo(2)
    }

    @Test
    fun `cartTotals computes correctly with multiple items`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
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
    fun `cartTotalHalalas sums all item prices times qty`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.addToCart(createItem(1, "A", 1000, 1500))
        vm.addToCart(createItem(2, "B", 2000, 1500))
        vm.increaseQty(0)
        assertThat(vm.uiState.value.cartTotalHalalas).isEqualTo(4000L)
    }

    @Test
    fun `setOrderType changes order type`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.setOrderType(OrderType.TAKEAWAY)
        assertThat(vm.uiState.value.orderType).isEqualTo(OrderType.TAKEAWAY)
    }

    @Test
    fun `setTable sets selected table`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.setTable(3)
        assertThat(vm.uiState.value.selectedTableId).isEqualTo(3)
    }

    @Test
    fun `proceedToBuild transitions to BUILDING_ORDER state`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.setOrderType(OrderType.TAKEAWAY)
        vm.proceedToBuild()
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.BUILDING_ORDER)
    }

    @Test
    fun `proceedToBuild requires table for dine_in`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.proceedToBuild()
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(vm.uiState.value.error).isNotNull()
    }

    @Test
    fun `proceedToBuild with table for dine_in works`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.setOrderType(OrderType.DINE_IN)
        vm.setTable(2)
        vm.proceedToBuild()
        assertThat(vm.uiState.value.screenState).isEqualTo(OrderScreenState.BUILDING_ORDER)
    }

    @Test
    fun `newOrder resets to SELECTING_TYPE with empty cart`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
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
    fun `updateItemNotes updates notes for cart item`() = runTest {
        val vm = OrderViewModel(preferencesManager, apiClientProvider)
        vm.addToCart(createItem(1, "A", 1000, 1500))
        vm.updateItemNotes(0, "no onions, extra spicy")
        assertThat(vm.uiState.value.cart[0].notes).isEqualTo("no onions, extra spicy")
    }

    private fun createItem(
        id: Long,
        name: String,
        priceHalalas: Long,
        vatRateBp: Long,
    ): ItemResponse = ItemResponse(
        id = BigDecimal.valueOf(id),
        categoryId = BigDecimal.ONE,
        name = name,
        nameAr = null,
        priceHalalas = BigDecimal.valueOf(priceHalalas),
        vatRateBp = BigDecimal.valueOf(vatRateBp),
        sortOrder = BigDecimal.ZERO,
        isActive = true,
        createdAt = BigDecimal.ZERO,
        updatedAt = BigDecimal.ZERO,
        createdBy = null,
        updatedBy = null,
    )
}
