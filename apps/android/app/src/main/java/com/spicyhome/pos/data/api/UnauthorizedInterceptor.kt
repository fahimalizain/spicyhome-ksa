package com.spicyhome.pos.data.api

import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

class UnauthorizedInterceptor(
    private val onUnauthorized: () -> Unit,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)
        if (response.code == 401 && !isLoginRequest(request)) {
            onUnauthorized()
        }
        return response
    }

    private fun isLoginRequest(request: Request): Boolean {
        val path = request.url.encodedPath
        return path.endsWith("/auth/login")
    }
}
