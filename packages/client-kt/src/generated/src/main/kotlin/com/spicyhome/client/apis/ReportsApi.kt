package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.ItemWiseSalesResponseDto
import com.spicyhome.client.models.SalesRegisterResponseDto

interface ReportsApi {
    /**
     * GET reports/item-wise
     * Item-wise sales (product mix) over a date range
     * 
     * Responses:
     *  - 200: One row per catalog item with sold, refunded and net quantities and amounts
     *
     * @param from Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive start of the window.
     * @param to Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive end of the window.
     * @param type Filter by parent order type: dine_in | takeaway. Omit → all types. (optional)
     * @param partner Filter by delivery partner slug on the parent order; &#39;none&#39; for walk-in orders. Omit → all partners. (optional)
     * @param category Filter by category id (numeric); &#39;none&#39; for Uncategorized rows only. Omit → all categories. (optional)
     * @return [Call]<[ItemWiseSalesResponseDto]>
     */
    @GET("reports/item-wise")
    fun reportsControllerGetItemWiseSales(@Query("from") from: kotlin.String, @Query("to") to: kotlin.String, @Query("type") type: kotlin.String? = null, @Query("partner") partner: kotlin.String? = null, @Query("category") category: kotlin.String? = null): Call<ItemWiseSalesResponseDto>

    /**
     * GET reports/sales
     * Daily sales totals over a date range
     * 
     * Responses:
     *  - 200: Daily sales totals
     *
     * @param from 
     * @param to 
     * @return [Call]<[Unit]>
     */
    @GET("reports/sales")
    fun reportsControllerGetSales(@Query("from") from: kotlin.String, @Query("to") to: kotlin.String): Call<Unit>

    /**
     * GET reports/sales-register
     * Sales register (day-book of invoices and refunds) over a date range
     * 
     * Responses:
     *  - 200: Sales register rows sorted by posting time, with signed footer totals
     *
     * @param from Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive start of the window.
     * @param to Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive end of the window.
     * @param type Filter by parent order type: dine_in | takeaway. Omit → all types. (optional)
     * @param partner Filter by delivery partner slug on the parent order; &#39;none&#39; for walk-in orders. Omit → all partners. (optional)
     * @param kind Filter by document kind: sale | refund. Omit → both. (optional)
     * @return [Call]<[SalesRegisterResponseDto]>
     */
    @GET("reports/sales-register")
    fun reportsControllerGetSalesRegister(@Query("from") from: kotlin.String, @Query("to") to: kotlin.String, @Query("type") type: kotlin.String? = null, @Query("partner") partner: kotlin.String? = null, @Query("kind") kind: kotlin.String? = null): Call<SalesRegisterResponseDto>

    /**
     * GET reports/vat
     * VAT summary over a date range (for VAT return)
     * 
     * Responses:
     *  - 200: VAT summary with grand total
     *
     * @param from 
     * @param to 
     * @return [Call]<[Unit]>
     */
    @GET("reports/vat")
    fun reportsControllerGetVat(@Query("from") from: kotlin.String, @Query("to") to: kotlin.String): Call<Unit>

    /**
     * GET reports/x
     * Live X-report for the current open day
     * 
     * Responses:
     *  - 200: X-report snapshot
     *
     * @return [Call]<[Unit]>
     */
    @GET("reports/x")
    fun reportsControllerGetXReport(): Call<Unit>

    /**
     * GET reports/z/{dayId}
     * Z-report for a closed day
     * 
     * Responses:
     *  - 200: Z-report detail
     *
     * @param dayId 
     * @return [Call]<[Unit]>
     */
    @GET("reports/z/{dayId}")
    fun reportsControllerGetZReport(@Path("dayId") dayId: kotlin.Long): Call<Unit>

    /**
     * POST reports/x/print
     * Print X-report on receipt printer
     * 
     * Responses:
     *  - 201: Print result
     *
     * @return [Call]<[Unit]>
     */
    @POST("reports/x/print")
    fun reportsControllerPrintXReport(): Call<Unit>

    /**
     * POST reports/z/{dayId}/print
     * Print Z-report on receipt printer
     * 
     * Responses:
     *  - 201: Print result
     *
     * @param dayId 
     * @return [Call]<[Unit]>
     */
    @POST("reports/z/{dayId}/print")
    fun reportsControllerPrintZReport(@Path("dayId") dayId: kotlin.Long): Call<Unit>

}
