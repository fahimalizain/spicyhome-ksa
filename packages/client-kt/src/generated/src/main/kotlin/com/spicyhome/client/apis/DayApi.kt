package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CloseDayDto
import com.spicyhome.client.models.CloseDayResponse
import com.spicyhome.client.models.DayOpeningResponse
import com.spicyhome.client.models.OpenDayDto

interface DayApi {
    /**
     * POST day/close
     * Close the current open business day
     * 
     * Responses:
     *  - 201: Business day closed with frozen totals
     *  - 404: No open business day to close
     *  - 409: Open/sent orders exist — cannot close
     *
     * @param closeDayDto 
     * @return [Call]<[CloseDayResponse]>
     */
    @POST("day/close")
    fun businessDayControllerCloseDay(@Body closeDayDto: CloseDayDto): Call<CloseDayResponse>

    /**
     * GET day/current
     * Get current open day with live X-report totals
     * 
     * Responses:
     *  - 200: Current open day or null
     *
     * @return [Call]<[Unit]>
     */
    @GET("day/current")
    fun businessDayControllerGetCurrent(): Call<Unit>

    /**
     * GET day/{id}
     * Get a business day by ID
     * 
     * Responses:
     *  - 200: Business day
     *  - 404: Business day not found
     *
     * @param id 
     * @return [Call]<[DayOpeningResponse]>
     */
    @GET("day/{id}")
    fun businessDayControllerGetDay(@Path("id") id: java.math.BigDecimal): Call<DayOpeningResponse>

    /**
     * GET day
     * List past business days (paged)
     * 
     * Responses:
     *  - 200: Paged list of business days
     *
     * @param page  (optional)
     * @param limit  (optional)
     * @return [Call]<[Unit]>
     */
    @GET("day")
    fun businessDayControllerList(@Query("page") page: java.math.BigDecimal? = null, @Query("limit") limit: java.math.BigDecimal? = null): Call<Unit>

    /**
     * POST day/open
     * Open a new business day
     * 
     * Responses:
     *  - 201: Business day opened
     *  - 409: A business day is already open
     *
     * @param openDayDto 
     * @return [Call]<[DayOpeningResponse]>
     */
    @POST("day/open")
    fun businessDayControllerOpenDay(@Body openDayDto: OpenDayDto): Call<DayOpeningResponse>

}
