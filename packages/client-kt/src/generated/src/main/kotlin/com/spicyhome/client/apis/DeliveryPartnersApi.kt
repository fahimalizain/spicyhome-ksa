package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CreateDeliveryPartnerDto
import com.spicyhome.client.models.DeliveryPartnerResponse
import com.spicyhome.client.models.UpdateDeliveryPartnerDto

interface DeliveryPartnersApi {
    /**
     * POST delivery-partners
     * Create a delivery partner (atomically creates its owned payment method)
     * 
     * Responses:
     *  - 201: Created delivery partner
     *
     * @param createDeliveryPartnerDto 
     * @return [Call]<[DeliveryPartnerResponse]>
     */
    @POST("delivery-partners")
    fun deliveryPartnersControllerCreate(@Body createDeliveryPartnerDto: CreateDeliveryPartnerDto): Call<DeliveryPartnerResponse>

    /**
     * GET delivery-partners
     * List all delivery partners (including disabled)
     * 
     * Responses:
     *  - 200: List of delivery partners
     *
     * @return [Call]<[kotlin.collections.List<DeliveryPartnerResponse>]>
     */
    @GET("delivery-partners")
    fun deliveryPartnersControllerList(): Call<kotlin.collections.List<DeliveryPartnerResponse>>

    /**
     * GET delivery-partners/enabled
     * List enabled delivery partners (no special permission required)
     * 
     * Responses:
     *  - 200: List of enabled delivery partners
     *
     * @return [Call]<[kotlin.collections.List<DeliveryPartnerResponse>]>
     */
    @GET("delivery-partners/enabled")
    fun deliveryPartnersControllerListEnabled(): Call<kotlin.collections.List<DeliveryPartnerResponse>>

    /**
     * PATCH delivery-partners/{id}
     * Update a delivery partner (title / enabled / sort_order; mirrors title + enabled to the owned payment method)
     * 
     * Responses:
     *  - 200: Updated delivery partner
     *
     * @param id Delivery partner slug
     * @param updateDeliveryPartnerDto 
     * @return [Call]<[DeliveryPartnerResponse]>
     */
    @PATCH("delivery-partners/{id}")
    fun deliveryPartnersControllerUpdate(@Path("id") id: kotlin.String, @Body updateDeliveryPartnerDto: UpdateDeliveryPartnerDto): Call<DeliveryPartnerResponse>

}
