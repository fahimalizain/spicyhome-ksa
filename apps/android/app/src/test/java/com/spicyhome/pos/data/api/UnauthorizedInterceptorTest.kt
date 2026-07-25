package com.spicyhome.pos.data.api

import com.google.common.truth.Truth.assertThat
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.util.concurrent.atomic.AtomicBoolean

class UnauthorizedInterceptorTest {

    private lateinit var server: MockWebServer
    private lateinit var wasCalled: AtomicBoolean

    @Before
    fun setUp() {
        server = MockWebServer()
        wasCalled = AtomicBoolean(false)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun createClient(onUnauthorized: () -> Unit): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(UnauthorizedInterceptor(onUnauthorized))
            .build()
    }

    @Test
    fun `401 on non-login path triggers callback`() {
        server.enqueue(MockResponse().setResponseCode(401))
        server.start()

        val client = createClient { wasCalled.set(true) }
        val request = okhttp3.Request.Builder().url(server.url("/api/orders")).build()
        val response = client.newCall(request).execute()

        assertThat(response.code).isEqualTo(401)
        assertThat(wasCalled.get()).isTrue()
    }

    @Test
    fun `401 on auth login path does NOT trigger callback`() {
        server.enqueue(MockResponse().setResponseCode(401))
        server.start()

        val client = createClient { wasCalled.set(true) }
        val request = okhttp3.Request.Builder().url(server.url("/auth/login")).build()
        val response = client.newCall(request).execute()

        assertThat(response.code).isEqualTo(401)
        assertThat(wasCalled.get()).isFalse()
    }

    @Test
    fun `200 does NOT trigger callback`() {
        server.enqueue(MockResponse().setResponseCode(200))
        server.start()

        val client = createClient { wasCalled.set(true) }
        val request = okhttp3.Request.Builder().url(server.url("/api/orders")).build()
        val response = client.newCall(request).execute()

        assertThat(response.code).isEqualTo(200)
        assertThat(wasCalled.get()).isFalse()
    }

    @Test
    fun `403 does NOT trigger callback`() {
        server.enqueue(MockResponse().setResponseCode(403))
        server.start()

        val client = createClient { wasCalled.set(true) }
        val request = okhttp3.Request.Builder().url(server.url("/api/orders")).build()
        val response = client.newCall(request).execute()

        assertThat(response.code).isEqualTo(403)
        assertThat(wasCalled.get()).isFalse()
    }

    @Test
    fun `500 does NOT trigger callback`() {
        server.enqueue(MockResponse().setResponseCode(500))
        server.start()

        val client = createClient { wasCalled.set(true) }
        val request = okhttp3.Request.Builder().url(server.url("/api/orders")).build()
        val response = client.newCall(request).execute()

        assertThat(response.code).isEqualTo(500)
        assertThat(wasCalled.get()).isFalse()
    }
}
