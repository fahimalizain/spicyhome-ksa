package com.spicyhome.pos.data.repository

import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.models.CreateOrderDto
import com.spicyhome.client.models.CreateOrderResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.client.models.SyncOrderItemsDto
import com.spicyhome.client.models.SyncOrderItemDto
import com.spicyhome.client.models.UpdateOrderMetaDto
import retrofit2.Call

class OrderRepository(private val ordersApi: OrdersApi) {

    fun createOrder(type: String, tableId: Long?, notes: String? = null): Call<CreateOrderResponse> {
        val dto = if (tableId != null) {
            CreateOrderDto(
                type = CreateOrderDto.Type.valueOf(type),
                tableId = tableId,
                notes = notes,
            )
        } else {
            CreateOrderDto(
                type = CreateOrderDto.Type.valueOf(type),
                notes = notes,
            )
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

    /**
     * PATCH /orders/:id — type/table/notes meta update on an open order.
     * `notes` may be null to clear. Open orders only; stale `baseUpdatedAt`
     * returns 409 (surfaced to the caller).
     */
    fun updateOrderMeta(
        orderId: Long,
        baseUpdatedAt: Long,
        type: String,
        tableId: Long?,
        notes: String?,
    ): Call<OrderResponse> {
        val dto = if (tableId != null) {
            UpdateOrderMetaDto(
                baseUpdatedAt = baseUpdatedAt,
                type = UpdateOrderMetaDto.Type.valueOf(type),
                tableId = tableId,
                notes = notes,
            )
        } else {
            UpdateOrderMetaDto(
                baseUpdatedAt = baseUpdatedAt,
                type = UpdateOrderMetaDto.Type.valueOf(type),
                notes = notes,
            )
        }
        return ordersApi.ordersControllerUpdateOrderMeta(orderId, dto)
    }
}
