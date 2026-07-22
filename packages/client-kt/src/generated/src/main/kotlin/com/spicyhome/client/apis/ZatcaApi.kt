package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json


interface ZatcaApi {
    /**
     * POST zatca/onboard/csr
     * Generate keypair and CSR for ZATCA onboarding
     * 
     * Responses:
     *  - 201: 
     *
     * @return [Call]<[Unit]>
     */
    @POST("zatca/onboard/csr")
    fun zatcaControllerGenerateCSR(): Call<Unit>

    /**
     * GET zatca/invoices/{id}
     * Get invoice detail including XML
     * 
     * Responses:
     *  - 200: 
     *
     * @param id 
     * @return [Call]<[Unit]>
     */
    @GET("zatca/invoices/{id}")
    fun zatcaControllerGetInvoice(@Path("id") id: kotlin.String): Call<Unit>

    /**
     * GET zatca/status
     * Get ZATCA onboarding and status
     * 
     * Responses:
     *  - 200: 
     *
     * @return [Call]<[Unit]>
     */
    @GET("zatca/status")
    fun zatcaControllerGetStatus(): Call<Unit>

    /**
     * GET zatca/invoices
     * List ZATCA invoices
     * 
     * Responses:
     *  - 200: 
     *
     * @param limit 
     * @param offset 
     * @return [Call]<[Unit]>
     */
    @GET("zatca/invoices")
    fun zatcaControllerListInvoices(@Query("limit") limit: java.math.BigDecimal, @Query("offset") offset: java.math.BigDecimal): Call<Unit>

    /**
     * POST zatca/onboard/compliance
     * Submit CSR with OTP to ZATCA compliance CSID endpoint
     * 
     * Responses:
     *  - 201: 
     *
     * @return [Call]<[Unit]>
     */
    @POST("zatca/onboard/compliance")
    fun zatcaControllerOnboardCompliance(): Call<Unit>

    /**
     * POST zatca/onboard/production
     * Exchange compliance CSID for production CSID
     * 
     * Responses:
     *  - 201: 
     *
     * @return [Call]<[Unit]>
     */
    @POST("zatca/onboard/production")
    fun zatcaControllerOnboardProduction(): Call<Unit>

    /**
     * POST zatca/reporting/retry
     * Retry reporting for all pending or a specific invoice
     * 
     * Responses:
     *  - 201: 
     *
     * @return [Call]<[Unit]>
     */
    @POST("zatca/reporting/retry")
    fun zatcaControllerRetryReporting(): Call<Unit>

}
