package com.spicyhome.pos.data.repository

import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.models.CreateOrderDto
import com.spicyhome.client.models.CreateOrderResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.client.models.SyncOrderItemDto
import com.spicyhome.client.models.SyncOrderItemsDto
import io.mockk.MockKAnnotations
import io.mockk.every
import io.mockk.impl.annotations.MockK
import io.mockk.verify
import org.junit.Before
import org.junit.Test
import retrofit2.Call
import retrofit2.Response

class OrderRepositoryTest {

    @MockK
    private lateinit var ordersApi: OrdersApi

    @MockK
    private lateinit var createCall: Call<CreateOrderResponse>

    @MockK
    private lateinit var getOrderCall: Call<OrderResponse>

    @MockK
    private lateinit var listOrdersCall: Call<List<OrderSummaryResponse>>

    @MockK
    private lateinit var syncCall: Call<OrderResponse>

    private lateinit var repository: OrderRepository

    @Before
    fun setUp() {
        MockKAnnotations.init(this)
        repository = OrderRepository(ordersApi)
    }

    @Test
    fun `createOrder dine-in with table`() {
        every { ordersApi.ordersControllerCreateOrder(any()) } returns createCall

        val result = repository.createOrder("dine_in", 5)

        assertThat(result).isSameInstanceAs(createCall)
        verify {
            ordersApi.ordersControllerCreateOrder(match { dto ->
                dto.type == CreateOrderDto.Type.dine_in &&
                    dto.tableId == 5L
            })
        }
    }

    @Test
    fun `createOrder takeaway without table`() {
        every { ordersApi.ordersControllerCreateOrder(any()) } returns createCall

        val result = repository.createOrder("takeaway", null)

        verify {
            ordersApi.ordersControllerCreateOrder(match { dto ->
                dto.type == CreateOrderDto.Type.takeaway &&
                    dto.tableId == null
            })
        }
    }

    @Test
    fun `createOrder returns response`() {
        val created = CreateOrderResponse(
            id = 42L,
            uuid = "uuid-123",
            orderNo = 1001L,
            documentId = "INV26-42",
        )
        every { ordersApi.ordersControllerCreateOrder(any()) } returns createCall
        every { createCall.execute() } returns Response.success(created)

        val result = repository.createOrder("dine_in", 1).execute()

        assertThat(result.isSuccessful).isTrue()
        assertThat(result.body()?.id?.toLong()).isEqualTo(42)
        assertThat(result.body()?.orderNo?.toLong()).isEqualTo(1001)
    }

    @Test
    fun `createOrder 409 no open day`() {
        every { ordersApi.ordersControllerCreateOrder(any()) } returns createCall
        every { createCall.execute() } returns Response.error(409, okhttp3.ResponseBody.create(null, ""))

        val result = repository.createOrder("takeaway", null).execute()

        assertThat(result.code()).isEqualTo(409)
        assertThat(result.isSuccessful).isFalse()
    }

    @Test
    fun `getOrder delegates correctly`() {
        every { ordersApi.ordersControllerGetOrder(any()) } returns getOrderCall

        repository.getOrder(42)

        verify { ordersApi.ordersControllerGetOrder(42L) }
    }

    @Test
    fun `listOrders with filters`() {
        every { ordersApi.ordersControllerListOrders(any(), any()) } returns listOrdersCall

        repository.listOrders("open", "2024-01-15")

        verify { ordersApi.ordersControllerListOrders("open", "2024-01-15") }
    }

    @Test
    fun `listOrders without filters`() {
        every { ordersApi.ordersControllerListOrders(any(), any()) } returns listOrdersCall

        repository.listOrders()

        verify { ordersApi.ordersControllerListOrders("", "") }
    }

    @Test
    fun `syncItems delegates correctly`() {
        every { ordersApi.ordersControllerSyncItems(any(), any()) } returns syncCall

        val items = listOf(
            SyncOrderItemDto(orderItemId = 100L, qty = 2, notes = "no onion"),
            SyncOrderItemDto(itemId = 50L, qty = 1, notes = null),
        )
        repository.syncItems(orderId = 1, baseUpdatedAt = 5000L, items = items)

        verify {
            ordersApi.ordersControllerSyncItems(
                1L,
                match { dto ->
                    dto.baseUpdatedAt == 5000L &&
                        dto.items.size == 2 &&
                        dto.items[0].orderItemId == 100L &&
                        dto.items[0].qty == 2 &&
                        dto.items[1].itemId == 50L &&
                        dto.items[1].qty == 1
                }
            )
        }
    }

    @Test
    fun `syncItems 409 conflict`() {
        every { ordersApi.ordersControllerSyncItems(any(), any()) } returns syncCall
        every { syncCall.execute() } returns Response.error(409, okhttp3.ResponseBody.create(null, "Conflict"))

        val items = listOf(SyncOrderItemDto(itemId = 1L, qty = 1))
        val result = repository.syncItems(orderId = 1, baseUpdatedAt = 1000L, items = items).execute()

        assertThat(result.code()).isEqualTo(409)
        assertThat(result.isSuccessful).isFalse()
    }
}
