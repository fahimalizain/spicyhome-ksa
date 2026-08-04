package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.CreateCategoryDto
import com.spicyhome.client.models.CreateItemDto
import com.spicyhome.client.models.CreateSubcategoryDto
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.SubcategoryResponse
import com.spicyhome.client.models.UpdateCategoryDto
import com.spicyhome.client.models.UpdateItemDto
import com.spicyhome.client.models.UpdateSubcategoryDto

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
     * POST menu/subcategories
     * Create a sub-category
     * 
     * Responses:
     *  - 201: Created sub-category
     *
     * @param createSubcategoryDto 
     * @return [Call]<[SubcategoryResponse]>
     */
    @POST("menu/subcategories")
    fun menuControllerCreateSubcategory(@Body createSubcategoryDto: CreateSubcategoryDto): Call<SubcategoryResponse>

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
    fun menuControllerGetCategory(@Path("id") id: kotlin.Long): Call<CategoryResponse>

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
    fun menuControllerGetItem(@Path("id") id: kotlin.Long): Call<ItemResponse>

    /**
     * GET menu/subcategories/{id}
     * Get sub-category by ID
     * 
     * Responses:
     *  - 200: Sub-category details
     *
     * @param id 
     * @return [Call]<[SubcategoryResponse]>
     */
    @GET("menu/subcategories/{id}")
    fun menuControllerGetSubcategory(@Path("id") id: kotlin.Long): Call<SubcategoryResponse>

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
     * List all items, optionally filtered by category or sub-category
     * 
     * Responses:
     *  - 200: List of items
     *
     * @param categoryId 
     * @param subcategoryId 
     * @return [Call]<[kotlin.collections.List<ItemResponse>]>
     */
    @GET("menu/items")
    fun menuControllerListItems(@Query("categoryId") categoryId: kotlin.String, @Query("subcategoryId") subcategoryId: kotlin.String): Call<kotlin.collections.List<ItemResponse>>

    /**
     * GET menu/subcategories
     * List all sub-categories, optionally filtered by category
     * 
     * Responses:
     *  - 200: List of sub-categories
     *
     * @param categoryId 
     * @return [Call]<[kotlin.collections.List<SubcategoryResponse>]>
     */
    @GET("menu/subcategories")
    fun menuControllerListSubcategories(@Query("categoryId") categoryId: kotlin.String): Call<kotlin.collections.List<SubcategoryResponse>>

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
    fun menuControllerUpdateCategory(@Path("id") id: kotlin.Long, @Body updateCategoryDto: UpdateCategoryDto): Call<CategoryResponse>

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
    fun menuControllerUpdateItem(@Path("id") id: kotlin.Long, @Body updateItemDto: UpdateItemDto): Call<ItemResponse>

    /**
     * PUT menu/subcategories/{id}
     * Update a sub-category
     * 
     * Responses:
     *  - 200: Updated sub-category
     *
     * @param id 
     * @param updateSubcategoryDto 
     * @return [Call]<[SubcategoryResponse]>
     */
    @PUT("menu/subcategories/{id}")
    fun menuControllerUpdateSubcategory(@Path("id") id: kotlin.Long, @Body updateSubcategoryDto: UpdateSubcategoryDto): Call<SubcategoryResponse>

}
