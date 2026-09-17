package com.spicyhome.pos.update

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class UpdateManagerTest {

    private val info = ReleaseInfo(
        version = "202608.01.0",
        downloadUrl = "https://example.com/spicyhome-pos-android-v202608.01.0.apk",
        assetSizeBytes = 1_000_000L,
        releaseName = "SpicyHome POS 202608.01.0",
        body = "Fixed a bug",
    )

    // A real file on disk — UpdateManager.retry() checks apkFile.exists().
    private lateinit var apkFile: File

    @Before
    fun setUp() {
        apkFile = File.createTempFile("update-test", ".apk")
    }

    @After
    fun tearDown() {
        apkFile.delete()
    }

    /**
     * Hand-written downloader double: records the progress callback, counts
     * calls, and either returns [result], throws [error], or stays in-flight.
     */
    private class FakeDownloader : ApkDownloader {
        var onProgress: ((Int) -> Unit)? = null
        var result: File? = null
        var error: Throwable? = null
        var downloadCalls = 0

        override suspend fun download(url: String, dest: File, onProgress: (Int) -> Unit): File {
            downloadCalls++
            this.onProgress = onProgress
            error?.let { throw it }
            result?.let { return it }
            awaitCancellation()
        }
    }

    private fun createManager(
        currentVersion: String = "202607.23.0",
        releaseClient: ReleaseClient = mockk(),
        downloader: ApkDownloader = mockk(),
        installer: ApkInstaller = mockk(),
        scope: CoroutineScope,
        now: () -> Long = { 10_000_000L },
        autoCheckIntervalMs: Long = UpdateManager.AUTO_CHECK_INTERVAL_MS,
    ): UpdateManager {
        return UpdateManager(
            currentVersion = currentVersion,
            releaseClient = releaseClient,
            downloader = downloader,
            installer = installer,
            apkFile = apkFile,
            appScope = scope,
            now = now,
            autoCheckIntervalMs = autoCheckIntervalMs,
        )
    }

    @Test
    fun `newer version transitions to Available`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val manager = createManager(releaseClient = client, scope = backgroundScope)

        manager.checkForUpdate(force = true)
        runCurrent()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Available(info))
    }

    @Test
    fun `same version is UpToDate`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val manager = createManager(
            currentVersion = "202608.01.0",
            releaseClient = client,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.UpToDate)
    }

    @Test
    fun `older remote version is UpToDate`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val manager = createManager(
            currentVersion = "202608.01.1",
            releaseClient = client,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.UpToDate)
    }

    @Test
    fun `no release asset is UpToDate`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns null
        val manager = createManager(releaseClient = client, scope = backgroundScope)

        manager.checkForUpdate(force = true)
        runCurrent()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.UpToDate)
    }

    @Test
    fun `auto check with no newer version stays silent on Idle`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val manager = createManager(
            currentVersion = "202608.01.0",
            releaseClient = client,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = false)
        runCurrent()

        // Auto-checks must not show the "up to date" dialog — only Idle.
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Idle)
    }

    @Test
    fun `auto check with no release asset stays silent on Idle`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns null
        val manager = createManager(releaseClient = client, scope = backgroundScope)

        manager.checkForUpdate(force = false)
        runCurrent()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Idle)
    }

    @Test
    fun `auto check within throttle interval is skipped`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        var currentTime = 10_000_000L
        val manager = createManager(
            releaseClient = client,
            scope = backgroundScope,
            now = { currentTime },
        )

        manager.checkForUpdate(force = false)
        runCurrent()
        coVerify(exactly = 1) { client.fetchLatest() }

        // Same time — inside the 30 min window.
        manager.checkForUpdate(force = false)
        runCurrent()
        coVerify(exactly = 1) { client.fetchLatest() }

        currentTime += UpdateManager.AUTO_CHECK_INTERVAL_MS
        manager.checkForUpdate(force = false)
        runCurrent()
        coVerify(exactly = 2) { client.fetchLatest() }
    }

    @Test
    fun `force check bypasses throttle`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        var currentTime = 10_000_000L
        val manager = createManager(
            releaseClient = client,
            scope = backgroundScope,
            now = { currentTime },
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.checkForUpdate(force = true)
        runCurrent()

        coVerify(exactly = 2) { client.fetchLatest() }
    }

    @Test
    fun `auto check failure stays silent on Idle`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } throws IOException("boom")
        val manager = createManager(releaseClient = client, scope = backgroundScope)

        manager.checkForUpdate(force = false)
        runCurrent()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Idle)
    }

    @Test
    fun `forced check failure shows retryable Error`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } throws IOException("boom")
        val manager = createManager(releaseClient = client, scope = backgroundScope)

        manager.checkForUpdate(force = true)
        runCurrent()

        val state = manager.uiState.value
        assertThat(state).isInstanceOf(UpdateUiState.Error::class.java)
        assertThat((state as UpdateUiState.Error).retryable).isTrue()
        assertThat(state.info).isNull()
    }

    @Test
    fun `download progress updates Downloading state`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val downloader = FakeDownloader() // stays in-flight until cancelled
        val manager = createManager(
            releaseClient = client,
            downloader = downloader,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.startDownload()
        runCurrent()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Downloading(info, 0))

        downloader.onProgress!!(25)
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Downloading(info, 25))

        downloader.onProgress!!(60)
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Downloading(info, 60))

        downloader.onProgress!!(100)
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Downloading(info, 100))

        manager.cancelDownload()
    }

    @Test
    fun `download completion reaches ReadyToInstall`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val downloader = FakeDownloader()
        downloader.result = apkFile
        val manager = createManager(
            releaseClient = client,
            downloader = downloader,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.startDownload()
        runCurrent()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.ReadyToInstall(info, apkFile))
    }

    @Test
    fun `cancelDownload returns to Available`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val downloader = FakeDownloader() // stays in-flight
        val manager = createManager(
            releaseClient = client,
            downloader = downloader,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.startDownload()
        runCurrent()
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Downloading(info, 0))

        manager.cancelDownload()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Available(info))
    }

    @Test
    fun `download failure shows retryable Error with info`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val downloader = FakeDownloader()
        downloader.error = IOException("Download failed (HTTP 502)")
        val manager = createManager(
            releaseClient = client,
            downloader = downloader,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.startDownload()
        runCurrent()

        assertThat(manager.uiState.value)
            .isEqualTo(UpdateUiState.Error("Download failed (HTTP 502)", retryable = true, info = info))
    }

    @Test
    fun `retry after download failure re-downloads`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val downloader = FakeDownloader()
        downloader.error = IOException("boom")
        val manager = createManager(
            releaseClient = client,
            downloader = downloader,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.startDownload()
        runCurrent()
        assertThat(manager.uiState.value).isInstanceOf(UpdateUiState.Error::class.java)

        manager.retry()
        runCurrent()

        assertThat(downloader.downloadCalls).isEqualTo(2)
        assertThat(manager.uiState.value).isInstanceOf(UpdateUiState.Error::class.java)
    }

    @Test
    fun `install leaves ReadyToInstall when installer launches`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val downloader = FakeDownloader()
        downloader.result = apkFile
        val installer = mockk<ApkInstaller>()
        every { installer.install(apkFile) } returns ApkInstaller.Outcome.Launching
        val manager = createManager(
            releaseClient = client,
            downloader = downloader,
            installer = installer,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.startDownload()
        runCurrent()
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.ReadyToInstall(info, apkFile))

        manager.install()

        // If the user backs out of the system installer, the dialog must stay
        // so they can tap Install again (a successful install restarts the app).
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.ReadyToInstall(info, apkFile))
    }

    @Test
    fun `install without permission shows guidance Error`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val downloader = FakeDownloader()
        downloader.result = apkFile
        val installer = mockk<ApkInstaller>()
        every { installer.install(apkFile) } returns ApkInstaller.Outcome.MissingPermission
        val manager = createManager(
            releaseClient = client,
            downloader = downloader,
            installer = installer,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.startDownload()
        runCurrent()
        manager.install()

        val state = manager.uiState.value
        assertThat(state).isInstanceOf(UpdateUiState.Error::class.java)
        assertThat((state as UpdateUiState.Error).message).contains("Install permission")
        assertThat(state.retryable).isTrue()
        assertThat(state.info).isEqualTo(info)
    }

    @Test
    fun `retry after permission error goes straight to ReadyToInstall`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val downloader = FakeDownloader()
        downloader.result = apkFile
        val installer = mockk<ApkInstaller>()
        every { installer.install(apkFile) } returns ApkInstaller.Outcome.MissingPermission
        val manager = createManager(
            releaseClient = client,
            downloader = downloader,
            installer = installer,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.startDownload()
        runCurrent()
        manager.install()

        manager.retry()

        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.ReadyToInstall(info, apkFile))
        // No re-download — the APK file was already downloaded.
        assertThat(downloader.downloadCalls).isEqualTo(1)
    }

    @Test
    fun `dismiss returns to Idle and throttles the next auto check`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        var currentTime = 10_000_000L
        val manager = createManager(
            releaseClient = client,
            scope = backgroundScope,
            now = { currentTime },
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Available(info))

        manager.dismiss()
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Idle)

        // Dismissal updated lastCheckedAt — the next auto check is throttled.
        manager.checkForUpdate(force = false)
        runCurrent()
        coVerify(exactly = 1) { client.fetchLatest() }
    }

    @Test
    fun `check while downloading is ignored`() = runTest {
        val client = mockk<ReleaseClient>()
        coEvery { client.fetchLatest() } returns info
        val downloader = FakeDownloader() // stays in-flight
        val manager = createManager(
            releaseClient = client,
            downloader = downloader,
            scope = backgroundScope,
        )

        manager.checkForUpdate(force = true)
        runCurrent()
        manager.startDownload()
        runCurrent()
        coVerify(exactly = 1) { client.fetchLatest() }

        manager.checkForUpdate(force = true)
        runCurrent()

        coVerify(exactly = 1) { client.fetchLatest() }
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Downloading(info, 0))
    }

    @Test
    fun `startDownload without Available is a no-op`() = runTest {
        val downloader = FakeDownloader()
        val manager = createManager(downloader = downloader, scope = backgroundScope)

        manager.startDownload()
        runCurrent()

        assertThat(downloader.downloadCalls).isEqualTo(0)
        assertThat(manager.uiState.value).isEqualTo(UpdateUiState.Idle)
    }
}
