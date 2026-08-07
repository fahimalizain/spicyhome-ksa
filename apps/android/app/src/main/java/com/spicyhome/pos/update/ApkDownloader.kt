package com.spicyhome.pos.update

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Downloads an APK to a local file, reporting progress in percent (0..100). */
interface ApkDownloader {
    /**
     * Downloads [url] to [dest], overwriting any previous file.
     * Progress (0..100) is reported via [onProgress]; when the server does not
     * send Content-Length the callback is not invoked.
     * Cancellation deletes the partial file and surfaces as [CancellationException].
     */
    suspend fun download(url: String, dest: File, onProgress: (Int) -> Unit): File
}

/** OkHttp-based [ApkDownloader] with generous timeouts for large APK files. */
class OkHttpApkDownloader(
    private val client: OkHttpClient = defaultClient(),
) : ApkDownloader {

    override suspend fun download(url: String, dest: File, onProgress: (Int) -> Unit): File {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", GitHubReleaseClient.USER_AGENT)
            .get()
            .build()
        return download(request, dest, onProgress)
    }

    private suspend fun download(request: Request, dest: File, onProgress: (Int) -> Unit): File =
        suspendCancellableCoroutine { continuation ->
            val call = client.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }

            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    // When the continuation was cancelled, call.cancel() produced
                    // this failure — the cancellation is already in flight.
                    if (!continuation.isCancelled) {
                        continuation.resumeWithException(e)
                    }
                }

                override fun onResponse(call: Call, response: Response) {
                    try {
                        if (continuation.isCancelled) {
                            response.close()
                            return
                        }
                        if (!response.isSuccessful) {
                            throw IOException("Download failed (HTTP ${response.code})")
                        }
                        val body = response.body ?: throw IOException("Empty response body")
                        val contentLength = body.contentLength()
                        dest.parentFile?.mkdirs()

                        val source = body.source()
                        dest.outputStream().use { output ->
                            val buffer = ByteArray(BUFFER_SIZE)
                            var received = 0L
                            while (true) {
                                val read = source.read(buffer, 0, buffer.size)
                                if (read == -1) break
                                output.write(buffer, 0, read)
                                received += read
                                if (contentLength > 0) {
                                    val percent =
                                        ((received * 100) / contentLength).toInt().coerceIn(0, 100)
                                    onProgress(percent)
                                }
                            }
                            if (contentLength > 0 && received != contentLength) {
                                throw IOException(
                                    "Incomplete download: expected $contentLength bytes, received $received"
                                )
                            }
                        }

                        if (continuation.isCancelled) {
                            // Cancelled while writing — never present a partial file as ready.
                            runCatching { dest.delete() }
                        } else {
                            continuation.resume(dest)
                        }
                    } catch (e: Exception) {
                        runCatching { dest.delete() }
                        if (!continuation.isCancelled) {
                            continuation.resumeWithException(e)
                        }
                    } finally {
                        response.close()
                    }
                }
            })
        }

    companion object {
        private const val BUFFER_SIZE = 64 * 1024

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()
    }
}
