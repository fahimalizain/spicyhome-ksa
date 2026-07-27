package com.spicyhome.pos.data.repository

import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.models.CreateOrderDto
import com.spicyhome.client.models.CreateOrderResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.client.models.SyncOrderItemsDto
import com.spicyhome.client.models.SyncOrderItemDto
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

    fun syncItems(
        orderId: Long,
        baseUpdatedAt: Long,
        items: List<SyncOrderItemDto>,
    ): Call<OrderResponse> {
        val dto = SyncOrderItemsDto(
            baseUpdatedAt = baseUpdatedAt,
            items = items,
        )
        return ordersApi.ordersControllerSyncItems(orderId, dto)
    }
}
