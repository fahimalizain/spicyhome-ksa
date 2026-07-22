package com.spicyhome.pos.data.repository

import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.models.AddOrderItemDto
import com.spicyhome.client.models.CreateOrderDto
import com.spicyhome.client.models.CreateOrderResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.StatusResponse
import com.spicyhome.client.models.SuccessResponse
import com.spicyhome.client.models.UpdateOrderItemDto
import retrofit2.Call
import java.math.BigDecimal

class OrderRepository(private val ordersApi: OrdersApi) {

    fun createOrder(type: String, tableId: Long?): Call<CreateOrderResponse> {
        val dto = if (tableId != null) {
            CreateOrderDto(
                type = CreateOrderDto.Type.valueOf(type),
                tableId = BigDecimal.valueOf(tableId)
            )
        } else {
            CreateOrderDto(type = CreateOrderDto.Type.valueOf(type))
        }
        return ordersApi.ordersControllerCreateOrder(dto)
    }

    fun getOrder(id: Long): Call<OrderResponse> {
        return ordersApi.ordersControllerGetOrder(BigDecimal.valueOf(id))
    }

    fun listOrders(status: String? = null, date: String? = null): Call<List<OrderResponse>> {
        return ordersApi.ordersControllerListOrders(status ?: "", date ?: "")
    }

    fun addItem(orderId: Long, itemId: Long, qty: Int, notes: String?): Call<SuccessResponse> {
        return ordersApi.ordersControllerAddItem(
            BigDecimal.valueOf(orderId),
            AddOrderItemDto(
                itemId = BigDecimal.valueOf(itemId),
                qty = BigDecimal.valueOf(qty.toLong()),
                notes = notes
            )
        )
    }

    fun updateItem(orderId: Long, itemId: Long, qty: Int?, notes: String?): Call<SuccessResponse> {
        return ordersApi.ordersControllerUpdateItem(
            BigDecimal.valueOf(orderId),
            BigDecimal.valueOf(itemId),
            UpdateOrderItemDto(qty = qty?.let { BigDecimal.valueOf(it.toLong()) }, notes = notes)
        )
    }

    fun removeItem(orderId: Long, itemId: Long): Call<SuccessResponse> {
        return ordersApi.ordersControllerRemoveItem(
            BigDecimal.valueOf(orderId),
            BigDecimal.valueOf(itemId)
        )
    }

    fun sendOrder(orderId: Long): Call<StatusResponse> {
        return ordersApi.ordersControllerSendOrder(BigDecimal.valueOf(orderId))
    }

    fun payOrder(orderId: Long): Call<StatusResponse> {
        return ordersApi.ordersControllerPayOrder(BigDecimal.valueOf(orderId))
    }

    fun voidOrder(orderId: Long): Call<StatusResponse> {
        return ordersApi.ordersControllerVoidOrder(BigDecimal.valueOf(orderId))
    }
}
