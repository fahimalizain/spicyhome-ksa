package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.AddOrderPaymentDto
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
import com.spicyhome.client.models.SubmitOrderDto
import com.spicyhome.client.models.SyncOrderItemsDto
import com.spicyhome.client.models.UpdateOrderItemUnitPriceDto
import com.spicyhome.client.models.UpdateOrderMetaDto
import com.spicyhome.client.models.UpdateOrderPartnerDto
import com.spicyhome.client.models.ZatcaInvoiceReissueDto
import com.spicyhome.client.models.ZatcaInvoiceStatusResponse
import com.spicyhome.client.models.ZatcaReissueResultDto

interface OrdersApi {
    /**
     * POST orders/{id}/payments
     * Append one payment line to an open order (status stays open)
     * 
     * Responses:
     *  - 201: Order with the appended payment line
     *
     * @param id 
     * @param addOrderPaymentDto 
     * @return [Call]<[OrderResponse]>
     */
    @POST("orders/{id}/payments")
    fun ordersControllerAddOrderPayment(@Path("id") id: kotlin.Long, @Body addOrderPaymentDto: AddOrderPaymentDto): Call<OrderResponse>

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
     * Get order by ID with items and events
     * 
     * Responses:
     *  - 200: Order with items and events
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
     * GET orders/{id}/refunds/{refundId}/zatca-credit-note
     * Get ZATCA credit note status for a refund (clearance polling)
     * 
     * Responses:
     *  - 200: ZATCA credit note status with clearance attempts
     *
     * @param id 
     * @param refundId 
     * @return [Call]<[ZatcaInvoiceStatusResponse]>
     */
    @GET("orders/{id}/refunds/{refundId}/zatca-credit-note")
    fun ordersControllerGetZatcaCreditNoteStatus(@Path("id") id: kotlin.Long, @Path("refundId") refundId: kotlin.Long): Call<ZatcaInvoiceStatusResponse>

    /**
     * GET orders/{id}/zatca-invoice
     * Get ZATCA invoice status for an order (clearance polling)
     * 
     * Responses:
     *  - 200: ZATCA invoice status with clearance attempts
     *
     * @param id 
     * @return [Call]<[ZatcaInvoiceStatusResponse]>
     */
    @GET("orders/{id}/zatca-invoice")
    fun ordersControllerGetZatcaInvoiceStatus(@Path("id") id: kotlin.Long): Call<ZatcaInvoiceStatusResponse>

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
     * POST orders/{id}/refunds/{refundId}/zatca-credit-note/reissue
     * Reissue a credit note after rejection (new attempt)
     * 
     * Responses:
     *  - 201: Reissue result
     *
     * @param id 
     * @param refundId 
     * @return [Call]<[ZatcaReissueResultDto]>
     */
    @POST("orders/{id}/refunds/{refundId}/zatca-credit-note/reissue")
    fun ordersControllerReissueZatcaCreditNote(@Path("id") id: kotlin.Long, @Path("refundId") refundId: kotlin.Long): Call<ZatcaReissueResultDto>

    /**
     * POST orders/{id}/zatca-invoice/reissue
     * Reissue a standard invoice after rejection (new attempt)
     * 
     * Responses:
     *  - 201: Reissue result
     *
     * @param id 
     * @param zatcaInvoiceReissueDto 
     * @return [Call]<[ZatcaReissueResultDto]>
     */
    @POST("orders/{id}/zatca-invoice/reissue")
    fun ordersControllerReissueZatcaInvoice(@Path("id") id: kotlin.Long, @Body zatcaInvoiceReissueDto: ZatcaInvoiceReissueDto): Call<ZatcaReissueResultDto>

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
     * POST orders/{id}/refunds/{refundId}/print
     * Reprint a specific refund receipt
     * 
     * Responses:
     *  - 201: Print result
     *
     * @param id 
     * @param refundId 
     * @return [Call]<[PrintResponse]>
     */
    @POST("orders/{id}/refunds/{refundId}/print")
    fun ordersControllerReprintRefundReceipt(@Path("id") id: kotlin.Long, @Path("refundId") refundId: kotlin.Long): Call<PrintResponse>

    /**
     * POST orders/{id}/zatca-invoice/retry-clearance
     * Retry ZATCA clearance for an invoice in error status
     * 
     * Responses:
     *  - 201: Clearance result
     *
     * @param id 
     * @return [Call]<[ZatcaReissueResultDto]>
     */
    @POST("orders/{id}/zatca-invoice/retry-clearance")
    fun ordersControllerRetryZatcaClearance(@Path("id") id: kotlin.Long): Call<ZatcaReissueResultDto>

    /**
     * POST orders/{id}/refunds/{refundId}/zatca-credit-note/retry-clearance
     * Retry ZATCA clearance for a credit note in error status
     * 
     * Responses:
     *  - 201: Clearance result
     *
     * @param id 
     * @param refundId 
     * @return [Call]<[ZatcaReissueResultDto]>
     */
    @POST("orders/{id}/refunds/{refundId}/zatca-credit-note/retry-clearance")
    fun ordersControllerRetryZatcaCreditNoteClearance(@Path("id") id: kotlin.Long, @Path("refundId") refundId: kotlin.Long): Call<ZatcaReissueResultDto>

    /**
     * POST orders/{id}/send-to-kitchen
     * Send unsent item quantities to the kitchen (explicit differential print; 200 no-op when nothing unsent)
     * 
     * Responses:
     *  - 200: Order with items and events
     *
     * @param id 
     * @return [Call]<[OrderResponse]>
     */
    @POST("orders/{id}/send-to-kitchen")
    fun ordersControllerSendToKitchen(@Path("id") id: kotlin.Long): Call<OrderResponse>

    /**
     * POST orders/{id}/submit
     * Submit an open order: finalize payment (open → paid) with ZATCA invoice + receipt
     * 
     * Responses:
     *  - 201: Order paid
     *
     * @param id 
     * @param submitOrderDto 
     * @return [Call]<[StatusResponse]>
     */
    @POST("orders/{id}/submit")
    fun ordersControllerSubmitOrder(@Path("id") id: kotlin.Long, @Body submitOrderDto: SubmitOrderDto): Call<StatusResponse>

    /**
     * PUT orders/{orderId}/items/sync
     * Bulk sync cart items (add, update, remove) for an open order
     * 
     * Responses:
     *  - 200: Order with items and events
     *
     * @param orderId 
     * @param syncOrderItemsDto 
     * @return [Call]<[OrderResponse]>
     */
    @PUT("orders/{orderId}/items/sync")
    fun ordersControllerSyncItems(@Path("orderId") orderId: kotlin.Long, @Body syncOrderItemsDto: SyncOrderItemsDto): Call<OrderResponse>

    /**
     * PATCH orders/{id}/items/{orderItemId}/unit-price
     * Override one order line unit price on a delivery-partner order (app-menu price, floored at the live catalog price) — ADR 0007
     * 
     * Responses:
     *  - 200: Updated order with items and events
     *
     * @param id 
     * @param orderItemId order_items.id — the LINE id, not the catalog item id
     * @param updateOrderItemUnitPriceDto 
     * @return [Call]<[OrderResponse]>
     */
    @PATCH("orders/{id}/items/{orderItemId}/unit-price")
    fun ordersControllerUpdateOrderItemUnitPrice(@Path("id") id: kotlin.Long, @Path("orderItemId") orderItemId: kotlin.Long, @Body updateOrderItemUnitPriceDto: UpdateOrderItemUnitPriceDto): Call<OrderResponse>

    /**
     * PATCH orders/{id}
     * Update open order type and/or table
     * 
     * Responses:
     *  - 200: Updated order with items and events
     *
     * @param id 
     * @param updateOrderMetaDto 
     * @return [Call]<[OrderResponse]>
     */
    @PATCH("orders/{id}")
    fun ordersControllerUpdateOrderMeta(@Path("id") id: kotlin.Long, @Body updateOrderMetaDto: UpdateOrderMetaDto): Call<OrderResponse>

    /**
     * PATCH orders/{id}/partner
     * Set, change or clear the delivery partner (+ external ref) on an open order (ADR 0007)
     * 
     * Responses:
     *  - 200: Updated order with items and events
     *
     * @param id 
     * @param updateOrderPartnerDto 
     * @return [Call]<[OrderResponse]>
     */
    @PATCH("orders/{id}/partner")
    fun ordersControllerUpdateOrderPartner(@Path("id") id: kotlin.Long, @Body updateOrderPartnerDto: UpdateOrderPartnerDto): Call<OrderResponse>

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
