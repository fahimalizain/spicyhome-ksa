package com.spicyhome.pos.data.repository

import com.spicyhome.client.apis.DayApi
import com.spicyhome.client.models.CurrentDayResponse
import retrofit2.Call

class DayRepository(private val dayApi: DayApi) {

    fun getCurrent(): Call<CurrentDayResponse> {
        return dayApi.businessDayControllerGetCurrent()
    }
}
