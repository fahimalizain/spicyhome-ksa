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
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.PrintResponse
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
    fun ordersControllerAddItem(@Path("id") id: java.math.BigDecimal, @Body addOrderItemDto: AddOrderItemDto): Call<SuccessResponse>

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
    fun ordersControllerGetOrder(@Path("id") id: java.math.BigDecimal): Call<OrderResponse>

    /**
     * GET orders
     * List orders with optional filters
     * 
     * Responses:
     *  - 200: List of orders
     *
     * @param status 
     * @param date 
     * @return [Call]<[kotlin.collections.List<OrderResponse>]>
     */
    @GET("orders")
    fun ordersControllerListOrders(@Query("status") status: kotlin.String, @Query("date") date: kotlin.String): Call<kotlin.collections.List<OrderResponse>>

    /**
     * POST orders/{id}/pay
     * Mark order as paid (sent → paid)
     * 
     * Responses:
     *  - 201: Order paid
     *
     * @param id 
     * @return [Call]<[StatusResponse]>
     */
    @POST("orders/{id}/pay")
    fun ordersControllerPayOrder(@Path("id") id: java.math.BigDecimal): Call<StatusResponse>

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
    fun ordersControllerRemoveItem(@Path("orderId") orderId: java.math.BigDecimal, @Path("itemId") itemId: java.math.BigDecimal): Call<SuccessResponse>

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
    fun ordersControllerReprintOrder(@Path("id") id: java.math.BigDecimal, @Body reprintOrderDto: ReprintOrderDto): Call<PrintResponse>

    /**
     * POST orders/{id}/send
     * Send order to kitchen (open → sent)
     * 
     * Responses:
     *  - 201: Order sent
     *
     * @param id 
     * @return [Call]<[StatusResponse]>
     */
    @POST("orders/{id}/send")
    fun ordersControllerSendOrder(@Path("id") id: java.math.BigDecimal): Call<StatusResponse>

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
    fun ordersControllerUpdateItem(@Path("orderId") orderId: java.math.BigDecimal, @Path("itemId") itemId: java.math.BigDecimal, @Body updateOrderItemDto: UpdateOrderItemDto): Call<SuccessResponse>

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
    fun ordersControllerVerifyAuditChain(@Path("id") id: java.math.BigDecimal): Call<AuditVerifyResponse>

    /**
     * POST orders/{id}/void
     * Void an order (open|sent → voided)
     * 
     * Responses:
     *  - 201: Order voided
     *
     * @param id 
     * @return [Call]<[StatusResponse]>
     */
    @POST("orders/{id}/void")
    fun ordersControllerVoidOrder(@Path("id") id: java.math.BigDecimal): Call<StatusResponse>

}
