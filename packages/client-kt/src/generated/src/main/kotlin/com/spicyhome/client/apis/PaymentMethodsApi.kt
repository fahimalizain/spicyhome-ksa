package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CreatePaymentMethodDto
import com.spicyhome.client.models.PaymentMethodResponse
import com.spicyhome.client.models.UpdatePaymentMethodDto

interface PaymentMethodsApi {
    /**
     * POST payment-methods
     * Create a payment method
     * 
     * Responses:
     *  - 201: Created payment method
     *
     * @param createPaymentMethodDto 
     * @return [Call]<[PaymentMethodResponse]>
     */
    @POST("payment-methods")
    fun paymentMethodsControllerCreate(@Body createPaymentMethodDto: CreatePaymentMethodDto): Call<PaymentMethodResponse>

    /**
     * GET payment-methods
     * List all payment methods (including disabled)
     * 
     * Responses:
     *  - 200: List of payment methods
     *
     * @return [Call]<[kotlin.collections.List<PaymentMethodResponse>]>
     */
    @GET("payment-methods")
    fun paymentMethodsControllerList(): Call<kotlin.collections.List<PaymentMethodResponse>>

    /**
     * GET payment-methods/enabled
     * List enabled payment methods (no special permission required)
     * 
     * Responses:
     *  - 200: List of enabled payment methods
     *
     * @return [Call]<[kotlin.collections.List<PaymentMethodResponse>]>
     */
    @GET("payment-methods/enabled")
    fun paymentMethodsControllerListEnabled(): Call<kotlin.collections.List<PaymentMethodResponse>>

    /**
     * PATCH payment-methods/{id}
     * Update a payment method
     * 
     * Responses:
     *  - 200: Updated payment method
     *
     * @param id Payment method slug
     * @param updatePaymentMethodDto 
     * @return [Call]<[PaymentMethodResponse]>
     */
    @PATCH("payment-methods/{id}")
    fun paymentMethodsControllerUpdate(@Path("id") id: kotlin.String, @Body updatePaymentMethodDto: UpdatePaymentMethodDto): Call<PaymentMethodResponse>

}
