package com.spicyhome.pos.update

import com.squareup.moshi.Json
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Metadata about the latest Android APK release, if one is available. */
data class ReleaseInfo(
    /** Version derived from the asset name (preferred) or the release tag. */
    val version: String,
    val downloadUrl: String,
    val assetSizeBytes: Long,
    val releaseName: String,
    val body: String?,
)

/** Fetches the latest release metadata from a GitHub Releases source. */
interface ReleaseClient {
    /**
     * Returns the latest Android APK release, or null when no applicable APK
     * asset exists. Network/API errors are thrown as [IOException] so callers
     * can decide how to surface them.
     */
    suspend fun fetchLatest(): ReleaseInfo?
}

/**
 * Fetches the latest release from the public GitHub API (no token).
 * Mirrors the Win7 updater approach (see ADR 0003): public API only, asset
 * prefix matching, version derived from the asset name.
 */
class GitHubReleaseClient(
    private val client: OkHttpClient = defaultClient(),
    private val baseUrl: String = GITHUB_API_BASE_URL,
    private val repo: String = GITHUB_REPO,
) : ReleaseClient {

    private val releaseAdapter: JsonAdapter<GithubRelease> =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()
            .adapter(GithubRelease::class.java)

    override suspend fun fetchLatest(): ReleaseInfo? = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/repos/$repo/releases/latest")
            .header("User-Agent", USER_AGENT)
            .header("Accept", "application/vnd.github+json")
            .build()

        val response = client.newCall(request).execute()
        response.use { resp ->
            if (resp.code == 404) {
                // No releases yet — nothing to update to.
                return@use null
            }
            if (!resp.isSuccessful) {
                throw IOException("GitHub API request failed (HTTP ${resp.code})")
            }
            val json = resp.body?.string() ?: throw IOException("GitHub API returned an empty body")

            val release = try {
                releaseAdapter.fromJson(json)
            } catch (e: JsonDataException) {
                null
            } catch (e: IOException) {
                null
            } ?: return@use null

            val asset = release.assets
                ?.firstOrNull { candidate ->
                    val name = candidate.name ?: return@firstOrNull false
                    name.startsWith(APK_ASSET_PREFIX) && name.endsWith(".apk")
                }
                ?: return@use null

            val assetName = asset.name ?: return@use null
            val downloadUrl = asset.browserDownloadUrl ?: return@use null
            val version = versionFromAsset(assetName, release.tagName) ?: return@use null

            ReleaseInfo(
                version = version,
                downloadUrl = downloadUrl,
                assetSizeBytes = asset.size ?: 0L,
                releaseName = release.name ?: release.tagName ?: assetName,
                body = release.body,
            )
        }
    }

    /**
     * Extracts the version from an asset name like
     * `spicyhome-pos-android-v202608.01.1.apk` → `202608.01.1`.
     * Falls back to the release tag (which may carry a leading `v`).
     * The result is normalized to the canonical `YYYYMM.DD.N` form.
     */
    private fun versionFromAsset(assetName: String, tagName: String?): String? {
        val fromAsset = assetName.removePrefix(APK_ASSET_PREFIX).removeSuffix(".apk")
        AppVersion.parse(fromAsset)?.let { return it.toString() }
        if (tagName != null) {
            AppVersion.parse(tagName)?.let { return it.toString() }
        }
        return null
    }

    private data class GithubRelease(
        @Json(name = "tag_name") val tagName: String? = null,
        @Json(name = "name") val name: String? = null,
        @Json(name = "body") val body: String? = null,
        @Json(name = "assets") val assets: List<GithubAsset>? = null,
    )

    private data class GithubAsset(
        @Json(name = "name") val name: String? = null,
        @Json(name = "size") val size: Long? = null,
        @Json(name = "browser_download_url") val browserDownloadUrl: String? = null,
    )

    companion object {
        const val GITHUB_API_BASE_URL = "https://api.github.com"
        const val GITHUB_REPO = "fahimalizain/spicyhome-ksa"
        const val USER_AGENT = "SpicyHome-Android-Updater"
        const val APK_ASSET_PREFIX = "spicyhome-pos-android-v"

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
    }
}
