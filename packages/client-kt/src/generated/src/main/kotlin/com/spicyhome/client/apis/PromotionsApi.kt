package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CreatePromotionDto
import com.spicyhome.client.models.PromotionResponse
import com.spicyhome.client.models.UpdatePromotionDto

interface PromotionsApi {
    /**
     * POST promotions
     * Create a promotion (enabled date ranges must not overlap)
     * 
     * Responses:
     *  - 201: Created promotion
     *
     * @param createPromotionDto 
     * @return [Call]<[PromotionResponse]>
     */
    @POST("promotions")
    fun promotionsControllerCreate(@Body createPromotionDto: CreatePromotionDto): Call<PromotionResponse>

    /**
     * GET promotions
     * List all promotions (including disabled)
     * 
     * Responses:
     *  - 200: List of promotions
     *
     * @return [Call]<[kotlin.collections.List<PromotionResponse>]>
     */
    @GET("promotions")
    fun promotionsControllerList(): Call<kotlin.collections.List<PromotionResponse>>

    /**
     * PATCH promotions/{id}
     * Update a promotion (name / nameAr / percentBp / dates / enabled; soft-disable only)
     * 
     * Responses:
     *  - 200: Updated promotion
     *
     * @param id Promotion id
     * @param updatePromotionDto 
     * @return [Call]<[PromotionResponse]>
     */
    @PATCH("promotions/{id}")
    fun promotionsControllerUpdate(@Path("id") id: kotlin.Int, @Body updatePromotionDto: UpdatePromotionDto): Call<PromotionResponse>

}
