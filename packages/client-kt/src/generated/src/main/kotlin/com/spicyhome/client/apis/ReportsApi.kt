package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json


interface ReportsApi {
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
    fun reportsControllerGetZReport(@Path("dayId") dayId: java.math.BigDecimal): Call<Unit>

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
    fun reportsControllerPrintZReport(@Path("dayId") dayId: java.math.BigDecimal): Call<Unit>

}
