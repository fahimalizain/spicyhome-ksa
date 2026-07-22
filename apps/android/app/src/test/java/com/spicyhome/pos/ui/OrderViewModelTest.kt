package com.spicyhome.pos.ui.order

import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.TableResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.util.MoneyFormatter
import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.MenuApi
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.apis.TablesApi
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
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

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")
    private val authTokenFlow = MutableStateFlow("fake-jwt-token")

    private lateinit var viewModel: OrderViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns authTokenFlow
        coEvery { preferencesManager.setAuthToken(any()) } returns Unit
        coEvery { preferencesManager.setUsername(any()) } returns Unit
        coEvery { preferencesManager.clearAuth() } returns Unit
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state is selecting type with empty cart`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        val state = viewModel.uiState.first()
        assertThat(state.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(state.isCartEmpty).isTrue()
        assertThat(state.cartItemCount).isEqualTo(0)
        assertThat(state.cartTotalHalalas).isEqualTo(0)
    }

    @Test
    fun `addToCart adds new item`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        val item = createItem(1, "Chicken Biryani", 2000, 1500)

        viewModel.addToCart(item)

        val state = viewModel.uiState.first()
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].item.name).isEqualTo("Chicken Biryani")
        assertThat(state.cart[0].qty).isEqualTo(1)
    }

    @Test
    fun `addToCart increments qty for existing item`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        val item = createItem(1, "Burger", 1500, 1500)

        viewModel.addToCart(item)
        viewModel.addToCart(item)
        viewModel.addToCart(item)

        val state = viewModel.uiState.first()
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].qty).isEqualTo(3)
    }

    @Test
    fun `removeFromCart removes item at index`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.addToCart(createItem(1, "A", 1000, 1500))
        viewModel.addToCart(createItem(2, "B", 2000, 1500))

        viewModel.removeFromCart(0)

        val state = viewModel.uiState.first()
        assertThat(state.cart).hasSize(1)
        assertThat(state.cart[0].item.name).isEqualTo("B")
    }

    @Test
    fun `clearCart empties the cart`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.addToCart(createItem(1, "A", 1000, 1500))
        viewModel.addToCart(createItem(2, "B", 2000, 1500))

        viewModel.clearCart()

        val state = viewModel.uiState.first()
        assertThat(state.cart).isEmpty()
        assertThat(state.isCartEmpty).isTrue()
    }

    @Test
    fun `decreaseQty removes item when qty reaches 1`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.addToCart(createItem(1, "Item", 1000, 1500))
        assertThat(viewModel.uiState.first().cart[0].qty).isEqualTo(1)

        viewModel.decreaseQty(0)

        assertThat(viewModel.uiState.first().cart).isEmpty()
    }

    @Test
    fun `decreaseQty decrements qty when qty above 1`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.addToCart(createItem(1, "Item", 1000, 1500))
        viewModel.increaseQty(0) // qty = 2
        viewModel.increaseQty(0) // qty = 3

        viewModel.decreaseQty(0)

        assertThat(viewModel.uiState.first().cart[0].qty).isEqualTo(2)
    }

    @Test
    fun `cartTotals computes correctly with multiple items`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        // Item 1: 1150 halalas (11.50 SAR vat-incl), qty 2
        viewModel.addToCart(createItem(1, "Item1", 1150, 1500))
        viewModel.increaseQty(0)

        // Item 2: 2300 halalas (23.00 SAR vat-incl), qty 1
        viewModel.addToCart(createItem(2, "Item2", 2300, 1500))

        val state = viewModel.uiState.first()

        // Total = 1150*2 + 2300 = 4600
        assertThat(state.cartTotalHalalas).isEqualTo(4600L)
        assertThat(state.cartItemCount).isEqualTo(3)

        // Verify VAT decomposition: each decomposed VAT + excl = price*qty
        val (_, excl, vat) = MoneyFormatter.cartItemTotal(1150, 2, 1500)
        assertThat(excl + vat).isEqualTo(2300L)

        val (_, excl2, vat2) = MoneyFormatter.cartItemTotal(2300, 1, 1500)
        assertThat(excl2 + vat2).isEqualTo(2300L)
    }

    @Test
    fun `cartTotalHalalas sums all item prices times qty`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.addToCart(createItem(1, "A", 1000, 1500)) // 1000
        viewModel.addToCart(createItem(2, "B", 2000, 1500)) // 2000
        viewModel.increaseQty(0) // A qty=2 => 2000

        val state = viewModel.uiState.first()
        // Total = 2000 + 2000 = 4000
        assertThat(state.cartTotalHalalas).isEqualTo(4000L)
    }

    @Test
    fun `setOrderType changes order type`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.setOrderType(OrderType.TAKEAWAY)

        assertThat(viewModel.uiState.first().orderType).isEqualTo(OrderType.TAKEAWAY)
    }

    @Test
    fun `setTable sets selected table`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.setTable(3)

        assertThat(viewModel.uiState.first().selectedTableId).isEqualTo(3)
    }

    @Test
    fun `proceedToBuild transitions to BUILDING_ORDER state`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.setOrderType(OrderType.TAKEAWAY)
        viewModel.proceedToBuild()

        assertThat(viewModel.uiState.first().screenState)
            .isEqualTo(OrderScreenState.BUILDING_ORDER)
    }

    @Test
    fun `proceedToBuild requires table for dine_in`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        // DINE_IN without table selected
        viewModel.proceedToBuild()

        assertThat(viewModel.uiState.first().screenState)
            .isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(viewModel.uiState.first().error).isNotNull()
    }

    @Test
    fun `proceedToBuild with table for dine_in works`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.setOrderType(OrderType.DINE_IN)
        viewModel.setTable(2)
        viewModel.proceedToBuild()

        assertThat(viewModel.uiState.first().screenState)
            .isEqualTo(OrderScreenState.BUILDING_ORDER)
    }

    @Test
    fun `newOrder resets to SELECTING_TYPE with empty cart`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.addToCart(createItem(1, "A", 1000, 1500))
        viewModel.setOrderType(OrderType.TAKEAWAY)
        viewModel.proceedToBuild()

        // Manually advance screenState to simulate order created
        val advanced = viewModel.uiState.first().copy(
            screenState = OrderScreenState.ORDER_PAID,
            currentOrderId = 123,
        )
        // Reset via newOrder
        viewModel.newOrder()

        val reset = viewModel.uiState.first()
        assertThat(reset.screenState).isEqualTo(OrderScreenState.SELECTING_TYPE)
        assertThat(reset.isCartEmpty).isTrue()
        assertThat(reset.currentOrderId).isNull()
    }

    @Test
    fun `updateItemNotes updates notes for cart item`() = runTest {
        viewModel = OrderViewModel(preferencesManager, apiClientProvider)

        viewModel.addToCart(createItem(1, "A", 1000, 1500))
        viewModel.updateItemNotes(0, "no onions, extra spicy")

        assertThat(viewModel.uiState.first().cart[0].notes).isEqualTo("no onions, extra spicy")
    }

    // Helper to create fake ItemResponse
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
