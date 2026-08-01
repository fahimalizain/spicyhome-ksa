package com.spicyhome.pos.ui.orders

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.AuthApi
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.apis.TablesApi
import com.spicyhome.client.models.MeResponse
import com.spicyhome.client.models.OrderItemResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.client.models.TableResponse
import com.spicyhome.client.models.UserOptionResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.realtime.RealtimeClient
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
class OrdersViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private val viewModelStores = mutableListOf<ViewModelStore>()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider
    private lateinit var realtimeClient: RealtimeClient
    private lateinit var ordersApi: OrdersApi
    private lateinit var tablesApi: TablesApi
    private lateinit var authApi: AuthApi

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")
    private val authTokenFlow = MutableStateFlow("fake-jwt-token")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)
        realtimeClient = mockk(relaxed = true)
        ordersApi = mockk(relaxed = true)
        tablesApi = mockk(relaxed = true)
        authApi = mockk(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns authTokenFlow
        every { apiClientProvider.createOrdersApi(any(), any()) } returns ordersApi
        every { apiClientProvider.createTablesApi(any(), any()) } returns tablesApi
        every { apiClientProvider.createAuthApi(any(), any()) } returns authApi

        // Stub empty realtime flows so viewModel init coroutines suspend gracefully
        every { realtimeClient.events } returns MutableSharedFlow(replay = 0, extraBufferCapacity = 0)
        every { realtimeClient.reconnected } returns MutableSharedFlow(replay = 0, extraBufferCapacity = 0)

        // Stub auth so the default filters (me.id) are known before the first list call.
        val meCall = mockk<Call<MeResponse>>(relaxed = true)
        every { authApi.authControllerGetMe() } returns meCall
        every { meCall.execute() } returns Response.success(meResponse())

        val usersCall = mockk<Call<List<UserOptionResponse>>>(relaxed = true)
        every { authApi.authControllerListActiveUsers() } returns usersCall
        every { usersCall.execute() } returns Response.success(
            listOf(
                UserOptionResponse(id = 1L, username = "admin", name = "Administrator"),
                UserOptionResponse(id = 2L, username = "cashier", name = "Cashier"),
            )
        )

        // Stub listOrders so the init's loadOrders() call succeeds
        val listCall = mockk<Call<List<OrderSummaryResponse>>>(relaxed = true)
        every { ordersApi.ordersControllerListOrders(any(), any(), any()) } returns listCall
        every { listCall.execute() } returns Response.success(emptyList())

        // Stub listTables (best-effort) so the init's loadTables() call succeeds
        val tablesCall = mockk<Call<List<TableResponse>>>(relaxed = true)
        every { tablesApi.tablesControllerList() } returns tablesCall
        every { tablesCall.execute() } returns Response.success(emptyList())
    }

    private fun meResponse(id: Long = 1L): MeResponse {
        return MeResponse(
            id = id,
            username = "admin",
            name = "Administrator",
            roleId = 1L,
            isActive = true,
            roleName = "admin",
            createOrder = true,
            updateOrder = true,
            deleteOrderItem = true,
            voidOrder = true,
            refundOrder = true,
            payOrder = true,
            manageMenu = true,
            manageTables = true,
            managePrinters = true,
            manageUsers = true,
            manageSettings = true,
        )
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
            deliveryPartnerId = null,
            deliveryPartnerTitle = null,
            deliveryExternalRef = null,
            documentId = "INV26-$id",
            notes = null,
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
            documentId = "INV26-$id",
            isStandardInvoice = false,
            type = "dine_in",
            tableId = 1L,
            dayOpeningId = 1L,
            status = "open",
            subtotalHalalas = 2000L,
            vatHalalas = 300L,
            totalHalalas = 2300L,
            discountHalalas = 0L,
            deliveryPartnerId = null,
            deliveryPartnerTitle = null,
            deliveryExternalRef = null,
            notes = null,
            createdAt = 1700000000L,
            updatedAt = 1700000000L,
            createdBy = 1L,
            updatedBy = 1L,
            items = items,
            events = emptyList(),
            payments = emptyList(),
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

    @Test
    fun `loadOrders populates tablesById from tables endpoint`() = runTest(testDispatcher) {
        val table = TableResponse(
            id = 1L,
            name = "T12",
            sortOrder = 1,
            isActive = true,
            createdAt = 1700000000L,
            updatedAt = 1700000000L,
            createdBy = 1L,
            updatedBy = 1L,
        )
        val tablesCall = mockk<Call<List<TableResponse>>>(relaxed = true)
        every { tablesApi.tablesControllerList() } returns tablesCall
        every { tablesCall.execute() } returns Response.success(listOf(table))

        val vm = createViewModel()

        assertThat(vm.uiState.value.tablesById).containsEntry(1L, "T12")
        // Table id 1L matches the dine-in summary's tableId, so it resolves to "T12".
        assertThat(vm.uiState.value.orders).isEmpty()
    }

    @Test
    fun `loadTables failure keeps previous table map and does not block orders`() = runTest(testDispatcher) {
        // First load succeeds with one table.
        val table = TableResponse(
            id = 1L,
            name = "T12",
            sortOrder = 1,
            isActive = true,
            createdAt = 1700000000L,
            updatedAt = 1700000000L,
            createdBy = 1L,
            updatedBy = 1L,
        )
        val tablesCall = mockk<Call<List<TableResponse>>>(relaxed = true)
        every { tablesApi.tablesControllerList() } returns tablesCall
        every { tablesCall.execute() } returns Response.success(listOf(table))

        val vm = createViewModel()
        assertThat(vm.uiState.value.tablesById).containsEntry(1L, "T12")

        // Second refresh: tables endpoint fails, orders still load fine.
        val failingCall = mockk<Call<List<TableResponse>>>(relaxed = true)
        every { tablesApi.tablesControllerList() } returns failingCall
        every { failingCall.execute() } returns Response.error(500, okhttp3.ResponseBody.create(null, "boom"))

        val ordersCall = mockk<Call<List<OrderSummaryResponse>>>(relaxed = true)
        every { ordersApi.ordersControllerListOrders(any(), any(), any()) } returns ordersCall
        every { ordersCall.execute() } returns Response.success(listOf(createSummary(7L, 3003L)))

        vm.loadOrders()

        assertThat(vm.uiState.value.tablesById).containsEntry(1L, "T12")
        assertThat(vm.uiState.value.orders).hasSize(1)
        assertThat(vm.uiState.value.error).isNull()
    }

    @Test
    fun `default filters - status open, today date, current user id`() = runTest(testDispatcher) {
        val vm = createViewModel()

        // init flow: me + active users loaded, then the first list call.
        assertThat(vm.uiState.value.currentUserId).isEqualTo(1L)
        assertThat(vm.uiState.value.userId).isEqualTo(1L)
        assertThat(vm.uiState.value.date).isEqualTo(todayInRiyadhDate())
        assertThat(vm.uiState.value.statuses).containsExactly("open")

        verify {
            ordersApi.ordersControllerListOrders(
                "open",
                todayInRiyadhDate(),
                1L,
            )
        }
    }

    @Test
    fun `me failure falls back to all users filter`() = runTest(testDispatcher) {
        val meCall = mockk<Call<MeResponse>>(relaxed = true)
        every { authApi.authControllerGetMe() } returns meCall
        every { meCall.execute() } returns Response.error(500, okhttp3.ResponseBody.create(null, "boom"))

        val vm = createViewModel()

        assertThat(vm.uiState.value.currentUserId).isNull()
        assertThat(vm.uiState.value.userId).isNull()
        verify {
            ordersApi.ordersControllerListOrders("open", todayInRiyadhDate(), null)
        }
    }

    @Test
    fun `toggleStatus adds and removes statuses - empty set means no status filter`() = runTest(testDispatcher) {
        val vm = createViewModel()

        vm.toggleStatus("paid")
        assertThat(vm.uiState.value.statuses).containsExactly("open", "paid")
        verify {
            ordersApi.ordersControllerListOrders("open,paid", todayInRiyadhDate(), 1L)
        }

        vm.toggleStatus("open")
        assertThat(vm.uiState.value.statuses).containsExactly("paid")
        verify {
            ordersApi.ordersControllerListOrders("paid", todayInRiyadhDate(), 1L)
        }

        vm.toggleStatus("paid")
        assertThat(vm.uiState.value.statuses).isEmpty()
        // Empty statuses → no status filter (null → param omitted).
        verify {
            ordersApi.ordersControllerListOrders(null, todayInRiyadhDate(), 1L)
        }
    }

    @Test
    fun `setUserId null means all users`() = runTest(testDispatcher) {
        val vm = createViewModel()

        vm.setUserId(null)
        assertThat(vm.uiState.value.userId).isNull()
        verify {
            ordersApi.ordersControllerListOrders("open", todayInRiyadhDate(), null)
        }

        vm.setUserId(2L)
        assertThat(vm.uiState.value.userId).isEqualTo(2L)
        verify {
            ordersApi.ordersControllerListOrders("open", todayInRiyadhDate(), 2L)
        }
    }

    @Test
    fun `active users are exposed in state for the dropdown`() = runTest(testDispatcher) {
        val vm = createViewModel()

        val usernames = vm.uiState.value.users.map { it.username }
        assertThat(usernames).containsExactly("admin", "cashier")
    }
}
