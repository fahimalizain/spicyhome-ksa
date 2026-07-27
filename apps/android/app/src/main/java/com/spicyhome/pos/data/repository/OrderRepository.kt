package com.spicyhome.pos.data.repository

import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.models.AddOrderItemDto
import com.spicyhome.client.models.AddOrderItemResponse
import com.spicyhome.client.models.CreateOrderDto
import com.spicyhome.client.models.CreateOrderResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.client.models.StatusResponse
import com.spicyhome.client.models.SuccessResponse
import com.spicyhome.client.models.UpdateOrderItemDto
import retrofit2.Call

class OrderRepository(private val ordersApi: OrdersApi) {

    fun createOrder(type: String, tableId: Long?): Call<CreateOrderResponse> {
        val dto = if (tableId != null) {
            CreateOrderDto(
                type = CreateOrderDto.Type.valueOf(type),
                tableId = tableId
            )
        } else {
            CreateOrderDto(type = CreateOrderDto.Type.valueOf(type))
        }
        return ordersApi.ordersControllerCreateOrder(dto)
    }

    fun getOrder(id: Long): Call<OrderResponse> {
        return ordersApi.ordersControllerGetOrder(id)
    }

    fun listOrders(status: String? = null, date: String? = null): Call<List<OrderSummaryResponse>> {
        return ordersApi.ordersControllerListOrders(status ?: "", date ?: "")
    }

    fun addItem(orderId: Long, itemId: Long, qty: Int, notes: String?): Call<AddOrderItemResponse> {
        return ordersApi.ordersControllerAddItem(
            orderId,
            AddOrderItemDto(
                itemId = itemId,
                qty = qty,
                notes = notes
            )
        )
    }

    fun updateItem(orderId: Long, itemId: Long, qty: Int?, notes: String?): Call<SuccessResponse> {
        return ordersApi.ordersControllerUpdateItem(
            orderId,
            itemId,
            UpdateOrderItemDto(qty = qty, notes = notes)
        )
    }

    fun removeItem(orderId: Long, itemId: Long): Call<SuccessResponse> {
        return ordersApi.ordersControllerRemoveItem(
            orderId,
            itemId
        )
    }

    fun payOrder(orderId: Long): Call<StatusResponse> {
        return ordersApi.ordersControllerPayOrder(orderId)
    }

    fun voidOrder(orderId: Long): Call<StatusResponse> {
        return ordersApi.ordersControllerVoidOrder(orderId)
    }
}
