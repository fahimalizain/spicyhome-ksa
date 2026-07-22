package com.spicyhome.pos.data.realtime

import com.squareup.moshi.JsonReader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.Buffer
import java.util.concurrent.TimeUnit

class RealtimeClient(
    httpClient: OkHttpClient = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build(),
) {
    private val client = httpClient

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _events = MutableSharedFlow<RealtimeEvent>(
        extraBufferCapacity = 64,
    )
    val events: SharedFlow<RealtimeEvent> = _events.asSharedFlow()

    private val _reconnected = MutableSharedFlow<Unit>(replay = 1, extraBufferCapacity = 0)
    val reconnected: SharedFlow<Unit> = _reconnected.asSharedFlow()

    @Volatile
    private var webSocket: WebSocket? = null

    @Volatile
    private var reconnectJob: Job? = null

    @Volatile
    private var connectionId = 0

    @Volatile
    private var retryCount = 0

    @Volatile
    private var wasEverConnected = false

    @Volatile
    private var currentBaseUrl: String? = null

    @Volatile
    private var currentToken: String? = null

    fun connect(baseUrl: String, token: String) {
        if (currentBaseUrl == baseUrl && currentToken == token && webSocket != null) {
            return
        }
        currentBaseUrl = baseUrl
        currentToken = token
        retryCount = 0
        reconnectJob?.cancel()
        doConnect(baseUrl, token)
    }

    fun disconnect() {
        connectionId++
        wasEverConnected = false
        currentBaseUrl = null
        currentToken = null
        reconnectJob?.cancel()
        reconnectJob = null
        webSocket?.close(NORMAL_CLOSE, "Disconnected")
        webSocket = null
    }

    private fun doConnect(baseUrl: String, token: String) {
        connectionId++
        val thisConnectionId = connectionId

        val wsUrl = baseUrl
            .replace("http://", "ws://")
            .replace("https://", "wss://")
            .trimEnd('/') + "/ws?token=$token"

        val request = Request.Builder().url(wsUrl).build()

        webSocket?.close(NORMAL_CLOSE, null)
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (thisConnectionId != this@RealtimeClient.connectionId) return
                retryCount = 0
                if (wasEverConnected) {
                    scope.launch { _reconnected.tryEmit(Unit) }
                } else {
                    wasEverConnected = true
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (thisConnectionId != this@RealtimeClient.connectionId) return
                val event = RealtimeClient.parseWsMessage(text) ?: return
                scope.launch { _events.tryEmit(event) }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(NORMAL_CLOSE, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (thisConnectionId != this@RealtimeClient.connectionId) return
                if (code == AUTH_MISSING || code == AUTH_INVALID) return
                scheduleReconnect(baseUrl, token, thisConnectionId)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (thisConnectionId != this@RealtimeClient.connectionId) return
                scheduleReconnect(baseUrl, token, thisConnectionId)
            }
        })
    }

    private fun scheduleReconnect(baseUrl: String, token: String, connId: Int) {
        if (connId != connectionId) return

        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            val delayMs = minOf(
                BASE_RETRY_MS * (1L shl retryCount.coerceAtMost(10)),
                MAX_RETRY_MS,
            )
            retryCount++
            delay(delayMs)
            if (connId == this@RealtimeClient.connectionId) {
                doConnect(baseUrl, token)
            }
        }
    }

    companion object {
        private const val AUTH_MISSING = 4001
        private const val AUTH_INVALID = 4002
        private const val NORMAL_CLOSE = 1000

        internal const val BASE_RETRY_MS = 1_000L
        internal const val MAX_RETRY_MS = 30_000L

        internal fun parseWsMessage(text: String): RealtimeEvent? {
            return try {
                val buffer = Buffer().writeUtf8(text)
                val reader = JsonReader.of(buffer)
                var type = ""
                var payload = ""
                var at = 0L
                reader.beginObject()
                while (reader.hasNext()) {
                    when (reader.nextName()) {
                        "type" -> type = reader.nextString()
                        "at" -> at = reader.nextLong()
                        "payload" -> payload = reader.nextSource().readUtf8()
                        else -> reader.skipValue()
                    }
                }
                reader.endObject()
                RealtimeEvent(type, payload, at)
            } catch (_: Exception) {
                null
            }
        }
    }
}
