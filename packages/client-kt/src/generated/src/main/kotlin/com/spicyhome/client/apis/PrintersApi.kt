package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CreatePrinterDto
import com.spicyhome.client.models.PrinterResponse
import com.spicyhome.client.models.PrinterStatusResponse
import com.spicyhome.client.models.SuccessResponse
import com.spicyhome.client.models.UpdatePrinterDto

interface PrintersApi {
    /**
     * GET printers/{id}/status
     * Check printer TCP reachability
     * 
     * Responses:
     *  - 200: Printer reachability status
     *
     * @param id 
     * @return [Call]<[PrinterStatusResponse]>
     */
    @GET("printers/{id}/status")
    fun printersControllerCheckStatus(@Path("id") id: java.math.BigDecimal): Call<PrinterStatusResponse>

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
     * POST printers/{id}/test
     * Print a test ticket
     * 
     * Responses:
     *  - 200: Test ticket sent
     *
     * @param id 
     * @return [Call]<[SuccessResponse]>
     */
    @POST("printers/{id}/test")
    fun printersControllerTestPrint(@Path("id") id: java.math.BigDecimal): Call<SuccessResponse>

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
