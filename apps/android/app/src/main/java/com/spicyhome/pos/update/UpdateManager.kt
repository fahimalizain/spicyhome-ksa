package com.spicyhome.pos.update

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File

/** UI state for the in-app update flow. */
sealed interface UpdateUiState {
    data object Idle : UpdateUiState
    data object Checking : UpdateUiState

    /**
     * No newer version (or no release asset). Only reached by a **force**
     * check, so the overlay can show a confirmation; auto-checks go straight
     * to [Idle] and stay silent.
     */
    data object UpToDate : UpdateUiState

    data class Available(val info: ReleaseInfo) : UpdateUiState
    data class Downloading(val info: ReleaseInfo, val progressPercent: Int) : UpdateUiState
    data class ReadyToInstall(val info: ReleaseInfo, val apkFile: File) : UpdateUiState

    /**
     * [info] is set when an update was already found (check/download failure),
     * so retry can resume the download instead of re-checking.
     */
    data class Error(
        val message: String,
        val retryable: Boolean,
        val info: ReleaseInfo? = null,
    ) : UpdateUiState
}

/**
 * Orchestrates the soft-prompt APK update flow:
 * check GitHub Releases (throttled), download with progress, prompt the
 * system package installer. Never blocks order-taking — every dialog state is
 * dismissible. Runs on [appScope]; network failures on auto-checks stay silent.
 */
class UpdateManager(
    private val currentVersion: String,
    private val releaseClient: ReleaseClient,
    private val downloader: ApkDownloader,
    private val installer: ApkInstaller,
    private val apkFile: File,
    private val appScope: CoroutineScope,
    private val now: () -> Long = System::currentTimeMillis,
    private val autoCheckIntervalMs: Long = AUTO_CHECK_INTERVAL_MS,
) {

    private val _uiState = MutableStateFlow<UpdateUiState>(UpdateUiState.Idle)
    val uiState: StateFlow<UpdateUiState> = _uiState

    private var lastCheckedAt: Long = 0L
    private var downloadJob: Job? = null
    private var downloadedFile: File? = null

    /** Checks for a newer release. Auto-checks are throttled; force bypasses the throttle. */
    fun checkForUpdate(force: Boolean = false) {
        val current = _uiState.value
        if (current is UpdateUiState.Downloading ||
            current is UpdateUiState.ReadyToInstall ||
            current is UpdateUiState.Checking
        ) {
            // Ignore concurrent checks while a flow is in flight.
            return
        }
        if (!force && now() - lastCheckedAt < autoCheckIntervalMs) return

        _uiState.value = UpdateUiState.Checking
        appScope.launch {
            try {
                val latest = releaseClient.fetchLatest()
                lastCheckedAt = now()
                _uiState.value = when {
                    latest == null ->
                        if (force) UpdateUiState.UpToDate else UpdateUiState.Idle
                    AppVersion.isNewerThan(currentVersion, latest.version) ->
                        UpdateUiState.Available(latest)
                    else ->
                        if (force) UpdateUiState.UpToDate else UpdateUiState.Idle
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (force) {
                    _uiState.value = UpdateUiState.Error(
                        message = e.message ?: "Could not check for updates",
                        retryable = true,
                    )
                } else {
                    // Silent fail on auto-checks — the app keeps working.
                    _uiState.value = UpdateUiState.Idle
                }
            }
        }
    }

    /** Starts downloading the APK for the currently Available update. */
    fun startDownload() {
        val state = _uiState.value as? UpdateUiState.Available ?: return
        startDownload(state.info)
    }

    private fun startDownload(info: ReleaseInfo) {
        if (_uiState.value is UpdateUiState.Downloading ||
            _uiState.value is UpdateUiState.ReadyToInstall
        ) {
            return
        }
        _uiState.value = UpdateUiState.Downloading(info, 0)

        val job = appScope.launch {
            try {
                val file = downloader.download(
                    url = info.downloadUrl,
                    dest = apkFile,
                    onProgress = { percent ->
                        _uiState.value = UpdateUiState.Downloading(info, percent)
                    },
                )
                downloadedFile = file
                _uiState.value = UpdateUiState.ReadyToInstall(info, file)
            } catch (e: CancellationException) {
                // User cancelled — fall back to Available so they can retry.
                if (_uiState.value is UpdateUiState.Downloading) {
                    _uiState.value = UpdateUiState.Available(info)
                }
                throw e
            } catch (e: Exception) {
                _uiState.value = UpdateUiState.Error(
                    message = e.message ?: "Download failed",
                    retryable = true,
                    info = info,
                )
            }
        }
        downloadJob = job
        job.invokeOnCompletion { if (downloadJob === job) downloadJob = null }
    }

    /** Cancels an in-flight download, returning to Available. */
    fun cancelDownload() {
        downloadJob?.cancel()
        downloadJob = null
        val state = _uiState.value
        if (state is UpdateUiState.Downloading) {
            _uiState.value = UpdateUiState.Available(state.info)
        }
    }

    /** Launches the system package installer for the downloaded APK. */
    fun install() {
        val state = _uiState.value as? UpdateUiState.ReadyToInstall ?: return
        when (val outcome = installer.install(state.apkFile)) {
            is ApkInstaller.Outcome.Launching -> {
                // Keep ReadyToInstall: if the user backs out of the system
                // package installer without installing, the in-app dialog is
                // still there so they can tap Install again. A successful
                // install restarts the app process anyway.
            }
            is ApkInstaller.Outcome.MissingPermission -> {
                _uiState.value = UpdateUiState.Error(
                    message = "Install permission is not granted. Enable \"Install unknown apps\" " +
                        "for SpicyHome in the system settings, then tap Retry.",
                    retryable = true,
                    info = state.info,
                )
            }
        }
    }

    /** Dismisses the current prompt. Re-check happens on the next interval or force. */
    fun dismiss() {
        downloadJob?.cancel()
        downloadJob = null
        lastCheckedAt = now()
        _uiState.value = UpdateUiState.Idle
    }

    /** Retries after an error: re-checks, resumes an interrupted download, or re-prompts install. */
    fun retry() {
        val state = _uiState.value as? UpdateUiState.Error ?: return
        if (!state.retryable) {
            dismiss()
            return
        }
        val info = state.info ?: run {
            checkForUpdate(force = true)
            return
        }
        val file = downloadedFile
        if (file != null && file.exists()) {
            // Download already succeeded (e.g. install permission error) — go straight to install.
            _uiState.value = UpdateUiState.ReadyToInstall(info, file)
        } else {
            startDownload(info)
        }
    }

    companion object {
        const val AUTO_CHECK_INTERVAL_MS = 30 * 60 * 1000L
    }
}
