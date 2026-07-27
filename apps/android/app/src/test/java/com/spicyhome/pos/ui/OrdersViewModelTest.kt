package com.spicyhome.pos.ui.orders

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.models.OrderItemResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
import io.mockk.every
import io.mockk.mockk
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
class OrdersViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private val viewModelStores = mutableListOf<ViewModelStore>()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider
    private lateinit var realtimeClient: RealtimeClient
    private lateinit var ordersApi: OrdersApi

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")
    private val authTokenFlow = MutableStateFlow("fake-jwt-token")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)
        realtimeClient = mockk(relaxed = true)
        ordersApi = mockk(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns authTokenFlow
        every { apiClientProvider.createOrdersApi(any(), any()) } returns ordersApi

        // Stub empty realtime flows so viewModel init coroutines suspend gracefully
        every { realtimeClient.events } returns MutableSharedFlow(replay = 0, extraBufferCapacity = 0)
        every { realtimeClient.reconnected } returns MutableSharedFlow(replay = 0, extraBufferCapacity = 0)

        // Stub listOrders so the init's loadOrders() call succeeds
        val listCall = mockk<Call<List<OrderSummaryResponse>>>(relaxed = true)
        every { ordersApi.ordersControllerListOrders(any(), any()) } returns listCall
        every { listCall.execute() } returns Response.success(emptyList())
    }

    @After
    fun tearDown() {
        viewModelStores.forEach { it.clear() }
        viewModelStores.clear()
        Dispatchers.resetMain()
    }

    private fun createViewModel(): OrdersViewModel {
        val store = ViewModelStore()
        viewModelStores.add(store)
        val factory = OrdersViewModel.Factory(
            preferencesManager = preferencesManager,
            apiClientProvider = apiClientProvider,
            realtimeClient = realtimeClient,
            ioDispatcher = testDispatcher,
        )
        return ViewModelProvider(store, factory)[OrdersViewModel::class.java]
    }

    private fun createSummary(id: Long, orderNo: Long): OrderSummaryResponse {
        return OrderSummaryResponse(
            id = id,
            orderNo = orderNo,
            uuid = "uuid-$id",
            type = "dine_in",
            tableId = 1L,
            dayOpeningId = 1L,
            status = "open",
            subtotalHalalas = 2000L,
            vatHalalas = 300L,
            totalHalalas = 2300L,
            discountHalalas = 0L,
            createdAt = 1700000000L,
            updatedAt = 1700000000L,
            createdBy = 1L,
            updatedBy = 1L,
        )
    }

    private fun createOrderResponse(id: Long, orderNo: Long, items: List<OrderItemResponse>): OrderResponse {
        return OrderResponse(
            id = id,
            orderNo = orderNo,
            uuid = "uuid-$id",
            type = "dine_in",
            tableId = 1L,
            dayOpeningId = 1L,
            status = "open",
            subtotalHalalas = 2000L,
            vatHalalas = 300L,
            totalHalalas = 2300L,
            discountHalalas = 0L,
            createdAt = 1700000000L,
            updatedAt = 1700000000L,
            createdBy = 1L,
            updatedBy = 1L,
            items = items,
            auditLog = emptyList(),
        )
    }

    private fun createItem(id: Long, name: String): OrderItemResponse {
        return OrderItemResponse(
            id = id,
            orderId = 1L,
            itemId = id,
            itemName = name,
            unitPriceHalalas = 1000L,
            vatRateBp = 1500,
            qty = 1,
            totalHalalas = 1000L,
            notes = null,
            createdAt = 1700000000L,
            updatedAt = 1700000000L,
            createdBy = 1L,
            updatedBy = 1L,
        )
    }

    @Test
    fun `selectOrder loads full order detail with items`() = runTest(testDispatcher) {
        val vm = createViewModel()
        val summary = createSummary(42L, 1001L)

        val items = listOf(
            createItem(10L, "Burger"),
            createItem(11L, "Fries"),
        )
        val order = createOrderResponse(42L, 1001L, items)

        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(42L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(order)

        vm.selectOrder(summary)

        val state = vm.uiState.value
        assertThat(state.showDetail).isTrue()
        assertThat(state.detailLoading).isFalse()
        assertThat(state.selectedOrder).isNotNull()
        assertThat(state.selectedOrder!!.id).isEqualTo(42L)
        assertThat(state.selectedOrder!!.items).hasSize(2)
        assertThat(state.selectedOrder!!.items[0].itemName).isEqualTo("Burger")
        assertThat(state.selectedOrder!!.items[1].itemName).isEqualTo("Fries")
        assertThat(state.error).isNull()
    }

    @Test
    fun `selectOrder failure surfaces error and keeps detail visible`() = runTest(testDispatcher) {
        val vm = createViewModel()
        val summary = createSummary(99L, 2002L)

        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(99L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.error(404, okhttp3.ResponseBody.create(null, ""))

        vm.selectOrder(summary)

        val state = vm.uiState.value
        assertThat(state.showDetail).isTrue()
        assertThat(state.detailLoading).isFalse()
        assertThat(state.selectedOrder).isNull()
        assertThat(state.error).isNotNull()
        assertThat(state.error).contains("404")
    }

    @Test
    fun `closeDetail resets detail state`() = runTest(testDispatcher) {
        val vm = createViewModel()
        val summary = createSummary(42L, 1001L)

        val order = createOrderResponse(42L, 1001L, emptyList())
        val getOrderCall = mockk<Call<OrderResponse>>(relaxed = true)
        every { ordersApi.ordersControllerGetOrder(42L) } returns getOrderCall
        every { getOrderCall.execute() } returns Response.success(order)

        vm.selectOrder(summary)
        assertThat(vm.uiState.value.showDetail).isTrue()
        assertThat(vm.uiState.value.selectedOrder).isNotNull()

        vm.closeDetail()
        val state = vm.uiState.value
        assertThat(state.showDetail).isFalse()
        assertThat(state.selectedOrder).isNull()
        assertThat(state.detailLoading).isFalse()
    }
}
