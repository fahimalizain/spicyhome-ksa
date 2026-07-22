package com.spicyhome.pos.data.api

import com.spicyhome.client.apis.AuthApi
import com.spicyhome.client.apis.MenuApi
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.apis.TablesApi
import com.spicyhome.client.apis.SettingsApi
import com.spicyhome.client.infrastructure.ApiClient
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class ApiClientProvider {

    private var currentClient: ApiClient? = null
    private var currentBaseUrl: String? = null

    fun getClient(baseUrl: String, bearerToken: String? = null): ApiClient {
        if (currentClient != null && currentBaseUrl == baseUrl && bearerToken == null) {
            return currentClient!!
        }

        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        val builder = ApiClient(
            baseUrl = baseUrl,
            okHttpClientBuilder = okHttpClient.newBuilder()
        )

        bearerToken?.let { token ->
            builder.setBearerToken(token)
        }

        currentClient = builder
        currentBaseUrl = baseUrl
        return builder
    }

    fun createAuthApi(baseUrl: String): AuthApi {
        return getClient(baseUrl).createService(AuthApi::class.java)
    }

    fun createAuthApi(baseUrl: String, bearerToken: String): AuthApi {
        return getClient(baseUrl, bearerToken).createService(AuthApi::class.java)
    }

    fun createMenuApi(baseUrl: String, bearerToken: String): MenuApi {
        return getClient(baseUrl, bearerToken).createService(MenuApi::class.java)
    }

    fun createOrdersApi(baseUrl: String, bearerToken: String): OrdersApi {
        return getClient(baseUrl, bearerToken).createService(OrdersApi::class.java)
    }

    fun createTablesApi(baseUrl: String, bearerToken: String): TablesApi {
        return getClient(baseUrl, bearerToken).createService(TablesApi::class.java)
    }

    fun createSettingsApi(baseUrl: String, bearerToken: String): SettingsApi {
        return getClient(baseUrl, bearerToken).createService(SettingsApi::class.java)
    }

    fun testConnectivity(baseUrl: String): Boolean {
        return try {
            val client = OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(5, TimeUnit.SECONDS)
                .build()
            val request = okhttp3.Request.Builder()
                .url(baseUrl)
                .head()
                .build()
            val response = client.newCall(request).execute()
            response.isSuccessful || response.code in 300..499
        } catch (e: Exception) {
            false
        }
    }
}
