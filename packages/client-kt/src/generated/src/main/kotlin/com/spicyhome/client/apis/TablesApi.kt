package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CreateTableDto
import com.spicyhome.client.models.TableResponse
import com.spicyhome.client.models.UpdateTableDto

interface TablesApi {
    /**
     * POST tables
     * Create a table
     * 
     * Responses:
     *  - 201: Created table
     *
     * @param createTableDto 
     * @return [Call]<[TableResponse]>
     */
    @POST("tables")
    fun tablesControllerCreate(@Body createTableDto: CreateTableDto): Call<TableResponse>

    /**
     * GET tables/{id}
     * Get table by ID
     * 
     * Responses:
     *  - 200: Table details
     *
     * @param id 
     * @return [Call]<[TableResponse]>
     */
    @GET("tables/{id}")
    fun tablesControllerGet(@Path("id") id: java.math.BigDecimal): Call<TableResponse>

    /**
     * GET tables
     * List all tables
     * 
     * Responses:
     *  - 200: List of tables
     *
     * @return [Call]<[kotlin.collections.List<TableResponse>]>
     */
    @GET("tables")
    fun tablesControllerList(): Call<kotlin.collections.List<TableResponse>>

    /**
     * PUT tables/{id}
     * Update a table
     * 
     * Responses:
     *  - 200: Updated table
     *
     * @param id 
     * @param updateTableDto 
     * @return [Call]<[TableResponse]>
     */
    @PUT("tables/{id}")
    fun tablesControllerUpdate(@Path("id") id: java.math.BigDecimal, @Body updateTableDto: UpdateTableDto): Call<TableResponse>

}
