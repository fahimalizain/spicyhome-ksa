package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CreatePrinterDto
import com.spicyhome.client.models.PrinterResponse
import com.spicyhome.client.models.UpdatePrinterDto

interface PrintersApi {
    /**
     * POST printers
     * Create a printer
     * 
     * Responses:
     *  - 201: Created printer
     *
     * @param createPrinterDto 
     * @return [Call]<[PrinterResponse]>
     */
    @POST("printers")
    fun printersControllerCreate(@Body createPrinterDto: CreatePrinterDto): Call<PrinterResponse>

    /**
     * GET printers/{id}
     * Get printer by ID
     * 
     * Responses:
     *  - 200: Printer details
     *
     * @param id 
     * @return [Call]<[PrinterResponse]>
     */
    @GET("printers/{id}")
    fun printersControllerGet(@Path("id") id: java.math.BigDecimal): Call<PrinterResponse>

    /**
     * GET printers
     * List all printers
     * 
     * Responses:
     *  - 200: List of printers
     *
     * @return [Call]<[kotlin.collections.List<PrinterResponse>]>
     */
    @GET("printers")
    fun printersControllerList(): Call<kotlin.collections.List<PrinterResponse>>

    /**
     * PUT printers/{id}
     * Update a printer
     * 
     * Responses:
     *  - 200: Updated printer
     *
     * @param id 
     * @param updatePrinterDto 
     * @return [Call]<[PrinterResponse]>
     */
    @PUT("printers/{id}")
    fun printersControllerUpdate(@Path("id") id: java.math.BigDecimal, @Body updatePrinterDto: UpdatePrinterDto): Call<PrinterResponse>

}
