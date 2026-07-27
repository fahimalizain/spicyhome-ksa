package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.AddOrderItemDto
import com.spicyhome.client.models.AuditVerifyResponse
import com.spicyhome.client.models.CreateOrderDto
import com.spicyhome.client.models.CreateOrderResponse
import com.spicyhome.client.models.CreateRefundDto
import com.spicyhome.client.models.OrderEventResponse
import com.spicyhome.client.models.OrderRefundResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.client.models.PrintResponse
import com.spicyhome.client.models.RefundResponse
import com.spicyhome.client.models.ReprintOrderDto
import com.spicyhome.client.models.StatusResponse
import com.spicyhome.client.models.SuccessResponse
import com.spicyhome.client.models.UpdateOrderItemDto

interface OrdersApi {
    /**
     * POST orders/{id}/items
     * Add an item to an order
     * 
     * Responses:
     *  - 201: Item added
     *
     * @param id 
     * @param addOrderItemDto 
     * @return [Call]<[SuccessResponse]>
     */
    @POST("orders/{id}/items")
    fun ordersControllerAddItem(@Path("id") id: kotlin.Long, @Body addOrderItemDto: AddOrderItemDto): Call<SuccessResponse>

    /**
     * POST orders
     * Create a new order
     * 
     * Responses:
     *  - 201: Created order summary
     *
     * @param createOrderDto 
     * @return [Call]<[CreateOrderResponse]>
     */
    @POST("orders")
    fun ordersControllerCreateOrder(@Body createOrderDto: CreateOrderDto): Call<CreateOrderResponse>

    /**
     * GET orders/{id}
     * Get order by ID with items and audit log
     * 
     * Responses:
     *  - 200: Order with items and audit log
     *
     * @param id 
     * @return [Call]<[OrderResponse]>
     */
    @GET("orders/{id}")
    fun ordersControllerGetOrder(@Path("id") id: kotlin.Long): Call<OrderResponse>

    /**
     * GET orders/{id}/events
     * Get the complete event chain for an order
     * 
     * Responses:
     *  - 200: List of order events
     *
     * @param id 
     * @return [Call]<[kotlin.collections.List<OrderEventResponse>]>
     */
    @GET("orders/{id}/events")
    fun ordersControllerGetOrderEvents(@Path("id") id: kotlin.Long): Call<kotlin.collections.List<OrderEventResponse>>

    /**
     * GET orders/{id}/refunds
     * Get all refunds for an order
     * 
     * Responses:
     *  - 200: List of refunds with their items
     *
     * @param id 
     * @return [Call]<[kotlin.collections.List<OrderRefundResponse>]>
     */
    @GET("orders/{id}/refunds")
    fun ordersControllerGetOrderRefunds(@Path("id") id: kotlin.Long): Call<kotlin.collections.List<OrderRefundResponse>>

    /**
     * GET orders
     * List orders with optional filters
     * 
     * Responses:
     *  - 200: List of orders
     *
     * @param status 
     * @param date 
     * @return [Call]<[kotlin.collections.List<OrderSummaryResponse>]>
     */
    @GET("orders")
    fun ordersControllerListOrders(@Query("status") status: kotlin.String, @Query("date") date: kotlin.String): Call<kotlin.collections.List<OrderSummaryResponse>>

    /**
     * POST orders/{id}/pay
     * Mark order as paid (open → paid)
     * 
     * Responses:
     *  - 201: Order paid
     *
     * @param id 
     * @return [Call]<[StatusResponse]>
     */
    @POST("orders/{id}/pay")
    fun ordersControllerPayOrder(@Path("id") id: kotlin.Long): Call<StatusResponse>

    /**
     * POST orders/{id}/refund
     * Refund items on a paid order
     * 
     * Responses:
     *  - 201: Refund processed
     *
     * @param id 
     * @param createRefundDto 
     * @return [Call]<[RefundResponse]>
     */
    @POST("orders/{id}/refund")
    fun ordersControllerRefundOrder(@Path("id") id: kotlin.Long, @Body createRefundDto: CreateRefundDto): Call<RefundResponse>

    /**
     * DELETE orders/{orderId}/items/{itemId}
     * Remove an item from an order
     * 
     * Responses:
     *  - 200: Item removed
     *
     * @param orderId 
     * @param itemId 
     * @return [Call]<[SuccessResponse]>
     */
    @DELETE("orders/{orderId}/items/{itemId}")
    fun ordersControllerRemoveItem(@Path("orderId") orderId: kotlin.Long, @Path("itemId") itemId: kotlin.Long): Call<SuccessResponse>

    /**
     * POST orders/{id}/print
     * Reprint receipt or kitchen ticket for an order
     * 
     * Responses:
     *  - 201: Print result
     *
     * @param id 
     * @param reprintOrderDto 
     * @return [Call]<[PrintResponse]>
     */
    @POST("orders/{id}/print")
    fun ordersControllerReprintOrder(@Path("id") id: kotlin.Long, @Body reprintOrderDto: ReprintOrderDto): Call<PrintResponse>

    /**
     * PATCH orders/{orderId}/items/{itemId}
     * Update an order item (qty or notes)
     * 
     * Responses:
     *  - 200: Item updated
     *
     * @param orderId 
     * @param itemId 
     * @param updateOrderItemDto 
     * @return [Call]<[SuccessResponse]>
     */
    @PATCH("orders/{orderId}/items/{itemId}")
    fun ordersControllerUpdateItem(@Path("orderId") orderId: kotlin.Long, @Path("itemId") itemId: kotlin.Long, @Body updateOrderItemDto: UpdateOrderItemDto): Call<SuccessResponse>

    /**
     * GET orders/{id}/audit/verify
     * Verify audit log hash chain for an order
     * 
     * Responses:
     *  - 200: Audit chain verification result
     *
     * @param id 
     * @return [Call]<[AuditVerifyResponse]>
     */
    @GET("orders/{id}/audit/verify")
    fun ordersControllerVerifyAuditChain(@Path("id") id: kotlin.Long): Call<AuditVerifyResponse>

    /**
     * GET orders/{id}/events/verify
     * Verify the hash chain integrity for an order
     * 
     * Responses:
     *  - 200: Chain verification result
     *
     * @param id 
     * @return [Call]<[AuditVerifyResponse]>
     */
    @GET("orders/{id}/events/verify")
    fun ordersControllerVerifyOrderChain(@Path("id") id: kotlin.Long): Call<AuditVerifyResponse>

    /**
     * POST orders/{id}/void
     * Void an order (open → voided)
     * 
     * Responses:
     *  - 201: Order voided
     *
     * @param id 
     * @return [Call]<[StatusResponse]>
     */
    @POST("orders/{id}/void")
    fun ordersControllerVoidOrder(@Path("id") id: kotlin.Long): Call<StatusResponse>

}
