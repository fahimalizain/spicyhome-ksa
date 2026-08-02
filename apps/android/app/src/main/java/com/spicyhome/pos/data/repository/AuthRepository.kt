package com.spicyhome.pos.data.repository

import com.spicyhome.client.apis.AuthApi
import com.spicyhome.client.models.LoginDto
import com.spicyhome.client.models.LoginResponse
import com.spicyhome.client.models.MeResponse
import com.spicyhome.client.models.UserOptionResponse
import com.spicyhome.client.models.UsernamesResponse
import retrofit2.Call

class AuthRepository(private val authApi: AuthApi) {

    fun login(username: String, pin: String): Call<LoginResponse> {
        // ADR 0005: Android always logs in with clientType = android.
        return authApi.authControllerLogin(
            LoginDto(username = username, pin = pin, clientType = LoginDto.ClientType.android)
        )
    }

    fun getMe(): Call<MeResponse> {
        return authApi.authControllerGetMe()
    }

    /**
     * Minimal {id, username, name} list of active users for the Orders list
     * user filter. Authenticated, but no manage_users permission needed.
     */
    fun listActiveUsers(): Call<List<UserOptionResponse>> {
        return authApi.authControllerListActiveUsers()
    }

    fun listUsernames(): Call<UsernamesResponse> {
        // Only users with androidLogin=true are shown on the Android tablet login.
        return authApi.authControllerListUsernames(AuthApi.PlatformAuthControllerListUsernames.android)
    }
}
