package com.spicyhome.pos.data.api

import com.spicyhome.client.apis.AuthApi
import com.spicyhome.client.apis.MenuApi
import com.spicyhome.client.apis.OrdersApi
import com.spicyhome.client.apis.TablesApi

/**
 * Test fake for ApiClientProvider. Uses fake API implementations instead
 * of real Retrofit clients.
 */
class FakeApiClientProvider(
    var authApi: AuthApi,
    var menuApi: MenuApi,
    var ordersApi: OrdersApi,
    var tablesApi: TablesApi,
) {
    fun createAuthApi(baseUrl: String): AuthApi = authApi
    fun createAuthApi(baseUrl: String, bearerToken: String): AuthApi = authApi
    fun createMenuApi(baseUrl: String, bearerToken: String): MenuApi = menuApi
    fun createOrdersApi(baseUrl: String, bearerToken: String): OrdersApi = ordersApi
    fun createTablesApi(baseUrl: String, bearerToken: String): TablesApi = tablesApi
    fun testConnectivity(baseUrl: String): Boolean = true
}
