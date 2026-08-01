package com.spicyhome.pos.update

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException

class GitHubReleaseClientTest {

    private lateinit var server: MockWebServer
    private lateinit var client: GitHubReleaseClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = GitHubReleaseClient(
            client = OkHttpClient.Builder().build(),
            baseUrl = server.url("/").toString().trimEnd('/'),
            repo = "fahimalizain/spicyhome-ksa",
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun enqueueJson(body: String, code: Int = 200) {
        server.enqueue(
            MockResponse()
                .setResponseCode(code)
                .setHeader("Content-Type", "application/json")
                .setBody(body)
        )
    }

    @Test
    fun `picks android APK asset and ignores win7 zip`() = runBlocking {
        enqueueJson(releaseFixture())

        val info = client.fetchLatest()

        assertThat(info).isNotNull()
        assertThat(info!!.version).isEqualTo("202608.01.1")
        assertThat(info.downloadUrl)
            .isEqualTo("https://github.com/fahimalizain/spicyhome-ksa/releases/download/v202608.01.1/spicyhome-pos-android-v202608.01.1.apk")
        assertThat(info.assetSizeBytes).isEqualTo(12345678L)
        assertThat(info.releaseName).isEqualTo("SpicyHome POS 202608.01.1")
        assertThat(info.body).contains("What's changed")

        val recorded = server.takeRequest()
        assertThat(recorded.path).isEqualTo("/repos/fahimalizain/spicyhome-ksa/releases/latest")
        assertThat(recorded.getHeader("User-Agent")).isEqualTo("SpicyHome-Android-Updater")
        assertThat(recorded.getHeader("Accept")).isEqualTo("application/vnd.github+json")
    }

    @Test
    fun `prefers asset name version over tag name`() = runBlocking {
        // Asset name says 202608.01.1 while the tag says 202607.23.0 — asset wins.
        enqueueJson(releaseFixture(tagName = "v202607.23.0"))

        val info = client.fetchLatest()

        assertThat(info).isNotNull()
        assertThat(info!!.version).isEqualTo("202608.01.1")
    }

    @Test
    fun `falls back to tag version when asset name is unparseable`() = runBlocking {
        enqueueJson(releaseFixture(assetName = "spicyhome-pos-android-vlatest.apk"))

        val info = client.fetchLatest()

        assertThat(info).isNotNull()
        assertThat(info!!.version).isEqualTo("202608.01.1")
    }

    @Test
    fun `returns null when only win7 zip asset exists`() = runBlocking {
        enqueueJson(
            """
            {
              "tag_name": "v202608.01.1",
              "name": "SpicyHome POS 202608.01.1",
              "assets": [
                {
                  "name": "spicyhome-pos-win7-v202608.01.1.zip",
                  "size": 98765432,
                  "browser_download_url": "https://github.com/fahimalizain/spicyhome-ksa/releases/download/v202608.01.1/spicyhome-pos-win7-v202608.01.1.zip"
                }
              ]
            }
            """.trimIndent()
        )

        assertThat(client.fetchLatest()).isNull()
    }

    @Test
    fun `returns null when release has no assets`() = runBlocking {
        enqueueJson("""{"tag_name": "v202608.01.1", "name": "SpicyHome POS", "assets": []}""")

        assertThat(client.fetchLatest()).isNull()
    }

    @Test
    fun `returns null on malformed JSON`() = runBlocking {
        enqueueJson("this is not json")

        assertThat(client.fetchLatest()).isNull()
    }

    @Test
    fun `returns null on 404 (no releases yet)`() = runBlocking {
        enqueueJson("""{"message": "Not Found"}""", code = 404)

        assertThat(client.fetchLatest()).isNull()
    }

    @Test
    fun `throws on rate limit or server errors`() {
        enqueueJson("""{"message": "API rate limit exceeded"}""", code = 403)

        var thrown: Exception? = null
        try {
            runBlocking { client.fetchLatest() }
        } catch (e: Exception) {
            thrown = e
        }

        assertThat(thrown).isInstanceOf(IOException::class.java)
    }

    private fun releaseFixture(
        tagName: String = "v202608.01.1",
        assetName: String = "spicyhome-pos-android-v202608.01.1.apk",
    ): String {
        return """
            {
              "url": "https://api.github.com/repos/fahimalizain/spicyhome-ksa/releases/12",
              "html_url": "https://github.com/fahimalizain/spicyhome-ksa/releases/tag/$tagName",
              "tag_name": "$tagName",
              "target_commitish": "main",
              "name": "SpicyHome POS 202608.01.1",
              "draft": false,
              "prerelease": false,
              "created_at": "2026-08-01T10:00:00Z",
              "published_at": "2026-08-01T10:05:00Z",
              "body": "## What's changed\n- Fixed a bug",
              "assets": [
                {
                  "url": "https://api.github.com/repos/fahimalizain/spicyhome-ksa/releases/assets/101",
                  "id": 101,
                  "name": "spicyhome-pos-win7-v202608.01.1.zip",
                  "size": 98765432,
                  "browser_download_url": "https://github.com/fahimalizain/spicyhome-ksa/releases/download/v202608.01.1/spicyhome-pos-win7-v202608.01.1.zip"
                },
                {
                  "url": "https://api.github.com/repos/fahimalizain/spicyhome-ksa/releases/assets/102",
                  "id": 102,
                  "name": "$assetName",
                  "size": 12345678,
                  "browser_download_url": "https://github.com/fahimalizain/spicyhome-ksa/releases/download/$tagName/$assetName"
                }
              ]
            }
        """.trimIndent()
    }
}
