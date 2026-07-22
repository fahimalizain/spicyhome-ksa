package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.SetSettingDto
import com.spicyhome.client.models.SettingResponse

interface SettingsApi {
    /**
     * GET settings
     * Get all settings
     * 
     * Responses:
     *  - 200: Key-value settings
     *
     * @return [Call]<[kotlin.collections.List<SettingResponse>]>
     */
    @GET("settings")
    fun settingsControllerGetAll(): Call<kotlin.collections.List<SettingResponse>>

    /**
     * PUT settings
     * Set a setting value
     * 
     * Responses:
     *  - 200: Setting updated
     *
     * @param setSettingDto 
     * @return [Call]<[SettingResponse]>
     */
    @PUT("settings")
    fun settingsControllerSet(@Body setSettingDto: SetSettingDto): Call<SettingResponse>

}
