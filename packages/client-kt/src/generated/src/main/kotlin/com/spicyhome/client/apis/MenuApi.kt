package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.CreateCategoryDto
import com.spicyhome.client.models.CreateItemDto
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.UpdateCategoryDto
import com.spicyhome.client.models.UpdateItemDto

interface MenuApi {
    /**
     * POST menu/categories
     * Create a category
     * 
     * Responses:
     *  - 201: Created category
     *
     * @param createCategoryDto 
     * @return [Call]<[CategoryResponse]>
     */
    @POST("menu/categories")
    fun menuControllerCreateCategory(@Body createCategoryDto: CreateCategoryDto): Call<CategoryResponse>

    /**
     * POST menu/items
     * Create an item
     * 
     * Responses:
     *  - 201: Created item
     *
     * @param createItemDto 
     * @return [Call]<[ItemResponse]>
     */
    @POST("menu/items")
    fun menuControllerCreateItem(@Body createItemDto: CreateItemDto): Call<ItemResponse>

    /**
     * GET menu/categories/{id}
     * Get category by ID
     * 
     * Responses:
     *  - 200: Category details
     *
     * @param id 
     * @return [Call]<[CategoryResponse]>
     */
    @GET("menu/categories/{id}")
    fun menuControllerGetCategory(@Path("id") id: java.math.BigDecimal): Call<CategoryResponse>

    /**
     * GET menu/items/{id}
     * Get item by ID
     * 
     * Responses:
     *  - 200: Item details
     *
     * @param id 
     * @return [Call]<[ItemResponse]>
     */
    @GET("menu/items/{id}")
    fun menuControllerGetItem(@Path("id") id: java.math.BigDecimal): Call<ItemResponse>

    /**
     * GET menu/categories
     * List all categories
     * 
     * Responses:
     *  - 200: List of categories
     *
     * @return [Call]<[kotlin.collections.List<CategoryResponse>]>
     */
    @GET("menu/categories")
    fun menuControllerListCategories(): Call<kotlin.collections.List<CategoryResponse>>

    /**
     * GET menu/items
     * List all items, optionally filtered by category
     * 
     * Responses:
     *  - 200: List of items
     *
     * @param categoryId 
     * @return [Call]<[kotlin.collections.List<ItemResponse>]>
     */
    @GET("menu/items")
    fun menuControllerListItems(@Query("categoryId") categoryId: kotlin.String): Call<kotlin.collections.List<ItemResponse>>

    /**
     * PUT menu/categories/{id}
     * Update a category
     * 
     * Responses:
     *  - 200: Updated category
     *
     * @param id 
     * @param updateCategoryDto 
     * @return [Call]<[CategoryResponse]>
     */
    @PUT("menu/categories/{id}")
    fun menuControllerUpdateCategory(@Path("id") id: java.math.BigDecimal, @Body updateCategoryDto: UpdateCategoryDto): Call<CategoryResponse>

    /**
     * PUT menu/items/{id}
     * Update an item
     * 
     * Responses:
     *  - 200: Updated item
     *
     * @param id 
     * @param updateItemDto 
     * @return [Call]<[ItemResponse]>
     */
    @PUT("menu/items/{id}")
    fun menuControllerUpdateItem(@Path("id") id: java.math.BigDecimal, @Body updateItemDto: UpdateItemDto): Call<ItemResponse>

}
