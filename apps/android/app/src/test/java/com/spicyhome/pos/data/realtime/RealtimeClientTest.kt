package com.spicyhome.pos.data.realtime

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class RealtimeClientTest {

    private lateinit var server: MockWebServer
    private lateinit var client: RealtimeClient

    @Before
    fun setUp() {
        server = MockWebServer()
        client = RealtimeClient()
    }

    @After
    fun tearDown() {
        client.disconnect()
        Thread.sleep(100)
        server.shutdown()
    }

    // ── Message Parsing ──────────────────────────────────────────────

    @Test
    fun `parseWsMessage returns event for valid message`() {
        val json = """{"type":"order.created","payload":{"orderId":42},"at":1620000000}"""
        val event = RealtimeClient.parseWsMessage(json)
        assertThat(event).isNotNull()
        assertThat(event!!.type).isEqualTo("order.created")
        assertThat(event.at).isEqualTo(1620000000L)
        assertThat(event.payload).contains("orderId")
    }

    @Test
    fun `parseWsMessage returns event with empty payload object`() {
        val json = """{"type":"order.updated","payload":{},"at":1620000001}"""
        val event = RealtimeClient.parseWsMessage(json)
        assertThat(event).isNotNull()
        assertThat(event!!.type).isEqualTo("order.updated")
        assertThat(event.payload).isEqualTo("{}")
    }

    @Test
    fun `parseWsMessage returns null for invalid json`() {
        assertThat(RealtimeClient.parseWsMessage("not json")).isNull()
        assertThat(RealtimeClient.parseWsMessage("")).isNull()
        assertThat(RealtimeClient.parseWsMessage("{")).isNull()
    }

    @Test
    fun `parseWsMessage ignores unknown fields`() {
        val json = """{"type":"order.paid","payload":{},"at":1,"extra":true}"""
        val event = RealtimeClient.parseWsMessage(json)
        assertThat(event).isNotNull()
        assertThat(event!!.type).isEqualTo("order.paid")
    }

    @Test
    fun `parseWsMessage parses nested payload correctly`() {
        val json = """{"type":"order.sent","payload":{"orderId":5,"status":"sent","items":[1,2]},"at":1700000000}"""
        val event = RealtimeClient.parseWsMessage(json)
        assertThat(event).isNotNull()
        assertThat(event!!.payload).isEqualTo("""{"orderId":5,"status":"sent","items":[1,2]}""")
    }

    // ── Connection & URL ─────────────────────────────────────────────

    @Test
    fun `connects with token in URL query`(): Unit = runBlocking {
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    webSocket.close(1000, null)
                }
            })
        )
        server.start()

        val baseUrl = server.url("").toString().trimEnd('/')
        client.connect(baseUrl, "my-jwt-token")

        val request = server.takeRequest(3, TimeUnit.SECONDS)
        assertThat(request).isNotNull()
        assertThat(request!!.path).startsWith("/ws?token=my-jwt-token")
    }

    @Test
    fun `constructs wss URL from https base URL`() {
        val httpsUrl = "https://example.com:8443"
        val wsUrl = httpsUrl
            .replace("http://", "ws://")
            .replace("https://", "wss://")
            .trimEnd('/') + "/ws?token=test"
        assertThat(wsUrl).isEqualTo("wss://example.com:8443/ws?token=test")
    }

    @Test
    fun `does not emit reconnect signal on first open`(): Unit = runBlocking {
        val opened = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    opened.countDown()
                    webSocket.close(1000, null)
                }
            })
        )
        server.start()

        val reconnects = Channel<Unit>(Channel.UNLIMITED)
        val job = launch { client.reconnected.collect { reconnects.send(it) } }
        delay(100)

        client.connect(server.url("").toString().trimEnd('/'), "token")
        assertThat(opened.await(3, TimeUnit.SECONDS)).isTrue()

        val received = withTimeoutOrNull(2000) { reconnects.receive() }
        assertThat(received).isNull()

        job.cancel()
    }

    @Test
    fun `emits reconnect signal on reconnect after drop`(): Unit = runBlocking {
        val firstOpen = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    firstOpen.countDown()
                    webSocket.close(1000, null)
                }
            })
        )

        val secondOpen = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    secondOpen.countDown()
                    webSocket.close(1000, null)
                }
            })
        )

        server.start()

        val reconnects = Channel<Unit>(Channel.UNLIMITED)
        val job = launch { client.reconnected.collect { reconnects.send(it) } }
        delay(100)

        client.connect(server.url("").toString().trimEnd('/'), "token")
        assertThat(firstOpen.await(3, TimeUnit.SECONDS)).isTrue()
        assertThat(secondOpen.await(10, TimeUnit.SECONDS)).isTrue()

        val signal = withTimeout(5000) { reconnects.receive() }
        assertThat(signal).isEqualTo(Unit)

        val extra = withTimeoutOrNull(1000) { reconnects.receive() }
        assertThat(extra).isNull()

        job.cancel()
    }

    // ── Event Emission ───────────────────────────────────────────────

    @Test
    fun `emits event on server message`(): Unit = runBlocking {
        val opened = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    opened.countDown()
                    webSocket.send("""{"type":"order.created","payload":{"id":1},"at":1}""")
                    Thread.sleep(100)
                    webSocket.close(1000, null)
                }
            })
        )
        server.start()

        val events = Channel<RealtimeEvent>(Channel.UNLIMITED)
        val job = launch { client.events.collect { events.send(it) } }
        delay(100)

        client.connect(server.url("").toString().trimEnd('/'), "token")

        assertThat(opened.await(3, TimeUnit.SECONDS)).isTrue()
        val event = withTimeout(5000) { events.receive() }
        assertThat(event.type).isEqualTo("order.created")
        assertThat(event.payload).contains("id")

        job.cancel()
    }

    // ── Reconnection ─────────────────────────────────────────────────

    @Test
    fun `reconnects after server closes normally`(): Unit = runBlocking {
        val firstOpen = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    firstOpen.countDown()
                    webSocket.close(1000, null)
                }
            })
        )

        val secondOpen = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    secondOpen.countDown()
                    webSocket.close(1000, null)
                }
            })
        )

        server.start()
        client.connect(server.url("").toString().trimEnd('/'), "token")

        assertThat(firstOpen.await(3, TimeUnit.SECONDS)).isTrue()
        assertThat(secondOpen.await(10, TimeUnit.SECONDS)).isTrue()
    }

    @Test
    fun `no reconnect after auth close code 4001`(): Unit = runBlocking {
        val opened = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    opened.countDown()
                    webSocket.close(4001, "Token missing")
                }
            })
        )
        server.start()

        client.connect(server.url("").toString().trimEnd('/'), "token")
        assertThat(opened.await(3, TimeUnit.SECONDS)).isTrue()

        val beforeRequests = server.requestCount
        delay(3000)
        assertThat(server.requestCount).isEqualTo(beforeRequests)
    }

    @Test
    fun `no reconnect after auth close code 4002`(): Unit = runBlocking {
        val opened = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    opened.countDown()
                    webSocket.close(4002, "Invalid token")
                }
            })
        )
        server.start()

        client.connect(server.url("").toString().trimEnd('/'), "token")
        assertThat(opened.await(3, TimeUnit.SECONDS)).isTrue()

        val beforeRequests = server.requestCount
        delay(3000)
        assertThat(server.requestCount).isEqualTo(beforeRequests)
    }

    @Test
    fun `no reconnect after explicit disconnect`(): Unit = runBlocking {
        val opened = CountDownLatch(1)
        val serverClosed = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    opened.countDown()
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(1000, null)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    serverClosed.countDown()
                }
            })
        )
        server.start()

        client.connect(server.url("").toString().trimEnd('/'), "token")
        assertThat(opened.await(3, TimeUnit.SECONDS)).isTrue()

        client.disconnect()
        assertThat(serverClosed.await(3, TimeUnit.SECONDS)).isTrue()

        val beforeRequests = server.requestCount
        delay(3000)
        assertThat(server.requestCount).isEqualTo(beforeRequests)
    }

    @Test
    fun `connect ignores duplicate call with same credentials`(): Unit = runBlocking {
        val opened = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    opened.countDown()
                    webSocket.close(1000, null)
                }
            })
        )
        server.start()

        val baseUrl = server.url("").toString().trimEnd('/')
        client.connect(baseUrl, "token")
        assertThat(opened.await(3, TimeUnit.SECONDS)).isTrue()

        val beforeRequests = server.requestCount
        client.connect(baseUrl, "token")
        delay(500)
        assertThat(server.requestCount).isEqualTo(beforeRequests)
    }

    @Test
    fun `reconnects with new credentials when token changes`(): Unit = runBlocking {
        val firstOpen = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    firstOpen.countDown()
                    webSocket.close(1000, null)
                }
            })
        )
        val secondOpen = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    secondOpen.countDown()
                    webSocket.close(1000, null)
                }
            })
        )
        server.start()

        val baseUrl = server.url("").toString().trimEnd('/')
        client.connect(baseUrl, "token1")
        assertThat(firstOpen.await(3, TimeUnit.SECONDS)).isTrue()

        client.connect(baseUrl, "token2")
        assertThat(secondOpen.await(10, TimeUnit.SECONDS)).isTrue()
    }

    @Test
    fun `resets retry count on successful reconnect`(): Unit = runBlocking {
        val firstOpen = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    firstOpen.countDown()
                    webSocket.close(1000, null)
                }
            })
        )
        val secondOpen = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    secondOpen.countDown()
                    webSocket.close(1000, null)
                }
            })
        )
        val thirdOpen = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    thirdOpen.countDown()
                    webSocket.close(1000, null)
                }
            })
        )

        server.start()
        val baseUrl = server.url("").toString().trimEnd('/')
        client.connect(baseUrl, "token")

        assertThat(firstOpen.await(3, TimeUnit.SECONDS)).isTrue()
        assertThat(secondOpen.await(8, TimeUnit.SECONDS)).isTrue()
        assertThat(thirdOpen.await(8, TimeUnit.SECONDS)).isTrue()
    }
}
