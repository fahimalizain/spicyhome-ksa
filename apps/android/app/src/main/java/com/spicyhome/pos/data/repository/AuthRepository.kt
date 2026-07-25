package com.spicyhome.pos.data.repository

import com.spicyhome.client.apis.AuthApi
import com.spicyhome.client.models.LoginDto
import com.spicyhome.client.models.LoginResponse
import com.spicyhome.client.models.MeResponse
import com.spicyhome.client.models.UsernamesResponse
import retrofit2.Call

class AuthRepository(private val authApi: AuthApi) {

    fun login(username: String, pin: String): Call<LoginResponse> {
        return authApi.authControllerLogin(LoginDto(username = username, pin = pin))
    }

    fun getMe(): Call<MeResponse> {
        return authApi.authControllerGetMe()
    }

    fun listUsernames(): Call<UsernamesResponse> {
        return authApi.authControllerListUsernames()
    }
}
