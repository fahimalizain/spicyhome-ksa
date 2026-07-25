package com.spicyhome.pos

import android.app.Application
import android.content.pm.PackageManager
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.SessionManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.data.api.SentryHttpBodyInterceptor
import com.spicyhome.pos.data.realtime.RealtimeClient
import io.sentry.SentryOptions
import io.sentry.TypeCheckHint
import io.sentry.android.core.SentryAndroid
import io.sentry.protocol.Request as SentryRequest
import io.sentry.protocol.Response as SentryResponse
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import okhttp3.Request
import okhttp3.Response
import okio.Buffer

class SpicyHomeApp : Application() {

    lateinit var preferencesManager: PreferencesManager
        private set

    lateinit var sessionManager: SessionManager
        private set

    lateinit var apiClientProvider: ApiClientProvider
        private set

    lateinit var realtimeClient: RealtimeClient
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()

        initSentry()

        preferencesManager = PreferencesManager(this)
        sessionManager = SessionManager(preferencesManager, appScope)
        apiClientProvider = ApiClientProvider(onUnauthorized = sessionManager::onUnauthorized)
        realtimeClient = RealtimeClient(onAuthFailure = sessionManager::onUnauthorized)

        appScope.launch {
            combine(
                preferencesManager.serverUrl,
                preferencesManager.authToken,
            ) { url, token -> url to token }
            .collect { (url, token) ->
                if (!url.isNullOrBlank() && !token.isNullOrBlank()) {
                    realtimeClient.connect(url, token)
                } else {
                    realtimeClient.disconnect()
                }
            }
        }
    }

    private fun initSentry() {
        val meta = try {
            packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA).metaData
        } catch (_: Exception) {
            null
        }
        val dsn = meta?.getString("io.sentry.dsn").orEmpty()
        if (dsn.isBlank()) return

        val environment = meta?.getString("io.sentry.environment") ?: "development"
        val release = meta?.getString("io.sentry.release")
        val debug = meta?.getBoolean("io.sentry.debug", false) ?: false

        SentryAndroid.init(this) { options ->
            options.dsn = dsn
            options.environment = environment
            if (!release.isNullOrBlank()) options.release = release
            options.isDebug = debug

            // Max detail — cost is not a concern for this deployment.
            options.isSendDefaultPii = true
            options.maxBreadcrumbs = 200
            options.isAttachStacktrace = true
            options.isAttachThreads = true
            options.maxRequestBodySize = SentryOptions.RequestSize.ALWAYS
            options.tracesSampleRate = 1.0
            options.profilesSampleRate = 1.0
            options.sampleRate = 1.0
            options.isEnableUserInteractionTracing = true
            options.isEnableUserInteractionBreadcrumbs = true
            options.sessionReplay.onErrorSampleRate = 1.0
            options.sessionReplay.sessionSampleRate = 1.0

            // Attach full HTTP bodies onto OkHttp client-error events.
            options.beforeSend =
                SentryOptions.BeforeSendCallback { event, hint ->
                    val okRequest = hint.getAs(TypeCheckHint.OKHTTP_REQUEST, Request::class.java)
                    val okResponse = hint.getAs(TypeCheckHint.OKHTTP_RESPONSE, Response::class.java)

                    if (okRequest != null) {
                        val sentryReq = event.request ?: SentryRequest()
                        if (sentryReq.data == null) {
                            readRequestBody(okRequest)?.let { sentryReq.data = it }
                        }
                        if (sentryReq.headers.isNullOrEmpty()) {
                            sentryReq.headers =
                                okRequest.headers.names().associateWith {
                                    okRequest.header(it).orEmpty()
                                }
                        }
                        if (sentryReq.method == null) sentryReq.method = okRequest.method
                        if (sentryReq.url == null) sentryReq.url = okRequest.url.toString()
                        event.request = sentryReq
                    }

                    if (okResponse != null) {
                        val sentryRes = event.contexts.response ?: SentryResponse()
                        if (sentryRes.data == null) {
                            peekResponseBody(okResponse)?.let { sentryRes.data = it }
                        }
                        if (sentryRes.headers.isNullOrEmpty()) {
                            sentryRes.headers =
                                okResponse.headers.names().associateWith {
                                    okResponse.header(it).orEmpty()
                                }
                        }
                        if (sentryRes.statusCode == null) {
                            sentryRes.statusCode = okResponse.code
                        }
                        event.contexts.setResponse(sentryRes)
                    }

                    event
                }
        }
    }

    private fun readRequestBody(request: Request): String? {
        val body = request.body ?: return null
        return try {
            val buffer = Buffer()
            body.writeTo(buffer)
            val charset = body.contentType()?.charset(Charsets.UTF_8) ?: Charsets.UTF_8
            truncate(buffer.readString(charset))
        } catch (_: Exception) {
            null
        }
    }

    private fun peekResponseBody(response: Response): String? {
        return try {
            truncate(response.peekBody(SentryHttpBodyInterceptor.MAX_BODY_CHARS.toLong()).string())
        } catch (_: Exception) {
            null
        }
    }

    private fun truncate(value: String): String {
        val max = SentryHttpBodyInterceptor.MAX_BODY_CHARS
        return if (value.length <= max) value else value.take(max) + "…[truncated]"
    }
}
