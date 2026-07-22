package com.spicyhome.pos.data.repository

import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.models.CreateOrderDto
import com.spicyhome.client.models.CreateOrderResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.StatusResponse
import com.spicyhome.client.models.SuccessResponse
import com.spicyhome.client.models.AddOrderItemDto
import io.mockk.MockKAnnotations
import io.mockk.every
import io.mockk.impl.annotations.MockK
import io.mockk.verify
import org.junit.Before
import org.junit.Test
import retrofit2.Call
import retrofit2.Response
import java.math.BigDecimal

class OrderRepositoryTest {

    @MockK
    private lateinit var ordersApi: OrdersApi

    @MockK
    private lateinit var createCall: Call<CreateOrderResponse>

    @MockK
    private lateinit var getOrderCall: Call<OrderResponse>

    @MockK
    private lateinit var listOrdersCall: Call<List<OrderResponse>>

    @MockK
    private lateinit var addItemCall: Call<SuccessResponse>

    @MockK
    private lateinit var sendCall: Call<StatusResponse>

    @MockK
    private lateinit var payCall: Call<StatusResponse>

    @MockK
    private lateinit var voidCall: Call<StatusResponse>

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
                    dto.tableId == BigDecimal.valueOf(5)
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
            id = BigDecimal.valueOf(42),
            uuid = "uuid-123",
            orderNo = BigDecimal.valueOf(1001),
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

        verify { ordersApi.ordersControllerGetOrder(BigDecimal.valueOf(42)) }
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
    fun `addItem delegates correctly`() {
        every { ordersApi.ordersControllerAddItem(any(), any()) } returns addItemCall

        repository.addItem(orderId = 1, itemId = 10, qty = 3, notes = "no onions")

        verify {
            ordersApi.ordersControllerAddItem(
                BigDecimal.valueOf(1),
                match { dto ->
                    dto.itemId == BigDecimal.valueOf(10) &&
                        dto.qty == BigDecimal.valueOf(3) &&
                        dto.notes == "no onions"
                }
            )
        }
    }

    @Test
    fun `sendOrder delegates correctly`() {
        every { ordersApi.ordersControllerSendOrder(any()) } returns sendCall

        repository.sendOrder(42)

        verify { ordersApi.ordersControllerSendOrder(BigDecimal.valueOf(42)) }
    }

    @Test
    fun `payOrder delegates correctly`() {
        every { ordersApi.ordersControllerPayOrder(any()) } returns payCall

        repository.payOrder(42)

        verify { ordersApi.ordersControllerPayOrder(BigDecimal.valueOf(42)) }
    }

    @Test
    fun `voidOrder delegates correctly`() {
        every { ordersApi.ordersControllerVoidOrder(any()) } returns voidCall

        repository.voidOrder(42)

        verify { ordersApi.ordersControllerVoidOrder(BigDecimal.valueOf(42)) }
    }

    @Test
    fun `order lifecycle create send pay`() {
        // Create
        val created = CreateOrderResponse(
            id = BigDecimal.ONE,
            uuid = "uuid",
            orderNo = BigDecimal.valueOf(100),
        )
        every { ordersApi.ordersControllerCreateOrder(any()) } returns createCall
        every { createCall.execute() } returns Response.success(created)

        val createResult = repository.createOrder("dine_in", 1).execute()
        assertThat(createResult.isSuccessful).isTrue()
        assertThat(createResult.body()?.orderNo?.toLong()).isEqualTo(100)

        // Send
        every { ordersApi.ordersControllerSendOrder(any()) } returns sendCall
        every { sendCall.execute() } returns Response.success(
            StatusResponse(status = "sent", success = true)
        )

        val sendResult = repository.sendOrder(1).execute()
        assertThat(sendResult.isSuccessful).isTrue()
        assertThat(sendResult.body()?.status).isEqualTo("sent")

        // Pay
        every { ordersApi.ordersControllerPayOrder(any()) } returns payCall
        every { payCall.execute() } returns Response.success(
            StatusResponse(status = "paid", success = true)
        )

        val payResult = repository.payOrder(1).execute()
        assertThat(payResult.isSuccessful).isTrue()
        assertThat(payResult.body()?.status).isEqualTo("paid")
    }
}
