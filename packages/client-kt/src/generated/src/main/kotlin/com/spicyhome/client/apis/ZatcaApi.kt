package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.ZatcaConfigDto

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
     * GET zatca/config
     * Get ZATCA seller configuration
     * 
     * Responses:
     *  - 200: ZATCA seller configuration
     *
     * @return [Call]<[ZatcaConfigDto]>
     */
    @GET("zatca/config")
    fun zatcaControllerGetConfig(): Call<ZatcaConfigDto>

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
     * @param limit  (optional)
     * @param offset  (optional)
     * @return [Call]<[Unit]>
     */
    @GET("zatca/invoices")
    fun zatcaControllerListInvoices(@Query("limit") limit: kotlin.Int? = null, @Query("offset") offset: kotlin.Int? = null): Call<Unit>

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

    /**
     * POST zatca/onboard/compliance-check
     * Run compliance check by submitting a signed invoice to ZATCA
     * 
     * Responses:
     *  - 201: 
     *
     * @return [Call]<[Unit]>
     */
    @POST("zatca/onboard/compliance-check")
    fun zatcaControllerRunComplianceCheck(): Call<Unit>

    /**
     * PUT zatca/config
     * Update ZATCA seller configuration
     * 
     * Responses:
     *  - 200: Updated configuration
     *
     * @param zatcaConfigDto 
     * @return [Call]<[ZatcaConfigDto]>
     */
    @PUT("zatca/config")
    fun zatcaControllerUpdateConfig(@Body zatcaConfigDto: ZatcaConfigDto): Call<ZatcaConfigDto>

}
