package com.spicyhome.pos.data.api

import io.sentry.Breadcrumb
import io.sentry.Sentry
import io.sentry.SentryLevel
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer

/**
 * Captures full HTTP request/response bodies into Sentry breadcrumbs.
 * Official SentryOkHttp only records body *sizes*, not content.
 *
 * Also rewrites the request body to a replayable buffer so beforeSend can
 * re-read it when attaching bodies onto HTTP client error events.
 */
class SentryHttpBodyInterceptor(
    private val maxBodyChars: Int = MAX_BODY_CHARS,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val (request, requestBody) = bufferRequest(chain.request())
        val response = chain.proceed(request)
        val (replayable, responseBody) = bufferResponse(response)

        Sentry.addBreadcrumb(
            Breadcrumb.http(request.url.toString(), request.method).apply {
                level = when {
                    response.code >= 500 -> SentryLevel.ERROR
                    response.code >= 400 -> SentryLevel.WARNING
                    else -> SentryLevel.INFO
                }
                setData("status_code", response.code)
                setData("request_headers", headersToMap(request))
                setData("response_headers", headersToMap(response))
                if (requestBody != null) {
                    setData("request_body", requestBody)
                    setData("request_body_size", requestBody.length.toLong())
                }
                if (responseBody != null) {
                    setData("response_body", responseBody)
                    setData("response_body_size", responseBody.length.toLong())
                }
            },
        )

        return replayable
    }

    private fun bufferRequest(request: Request): Pair<Request, String?> {
        val body = request.body ?: return request to null
        return try {
            val buffer = Buffer()
            body.writeTo(buffer)
            val charset = body.contentType()?.charset(Charsets.UTF_8) ?: Charsets.UTF_8
            val truncated = truncate(buffer.clone().readString(charset))
            val newBody = buffer.readByteString().toRequestBody(body.contentType())
            request.newBuilder().method(request.method, newBody).build() to truncated
        } catch (_: Exception) {
            request to null
        }
    }

    private fun bufferResponse(response: Response): Pair<Response, String?> {
        val body = response.body ?: return response to null
        return try {
            val mediaType = body.contentType()
            val bytes = body.bytes()
            val charset = mediaType?.charset(Charsets.UTF_8) ?: Charsets.UTF_8
            val truncated = truncate(String(bytes, charset))
            response.newBuilder()
                .body(bytes.toResponseBody(mediaType))
                .build() to truncated
        } catch (_: Exception) {
            response to null
        }
    }

    private fun headersToMap(request: Request): Map<String, String> =
        request.headers.names().associateWith { name -> request.header(name).orEmpty() }

    private fun headersToMap(response: Response): Map<String, String> =
        response.headers.names().associateWith { name -> response.header(name).orEmpty() }

    private fun truncate(value: String): String =
        if (value.length <= maxBodyChars) value else value.take(maxBodyChars) + "…[truncated]"

    companion object {
        const val MAX_BODY_CHARS = 100_000
    }
}
