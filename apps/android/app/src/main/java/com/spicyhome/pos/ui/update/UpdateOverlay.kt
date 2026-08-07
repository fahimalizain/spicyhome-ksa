package com.spicyhome.pos.ui.update

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import com.spicyhome.pos.ui.theme.Accent
import com.spicyhome.pos.update.ReleaseInfo
import com.spicyhome.pos.update.UpdateUiState

/**
 * Non-blocking update overlay. Renders a dialog only for user-visible states;
 * Idle / Checking render nothing so navigation underneath is never blocked by
 * a silent background check. UpToDate only appears after a force check and
 * shows a brief confirmation.
 */
@Composable
fun UpdateOverlay(
    state: UpdateUiState,
    currentVersion: String,
    onUpdate: () -> Unit,
    onLater: () -> Unit,
    onCancelDownload: () -> Unit,
    onInstall: () -> Unit,
    onRetry: () -> Unit,
) {
    when (state) {
        is UpdateUiState.Available -> UpdateAvailableDialog(
            info = state.info,
            currentVersion = currentVersion,
            onUpdate = onUpdate,
            onLater = onLater,
        )

        is UpdateUiState.Downloading -> DownloadingDialog(
            info = state.info,
            progressPercent = state.progressPercent,
            onCancelDownload = onCancelDownload,
        )

        is UpdateUiState.ReadyToInstall -> ReadyToInstallDialog(
            info = state.info,
            onInstall = onInstall,
            onLater = onLater,
        )

        is UpdateUiState.Error -> ErrorDialog(
            state = state,
            onRetry = onRetry,
            onDismiss = onLater,
        )

        UpdateUiState.UpToDate -> UpToDateDialog(
            currentVersion = currentVersion,
            onDismiss = onLater,
        )

        UpdateUiState.Idle, UpdateUiState.Checking -> Unit
    }
}

@Composable
private fun UpdateAvailableDialog(
    info: ReleaseInfo,
    currentVersion: String,
    onUpdate: () -> Unit,
    onLater: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onLater,
        containerColor = MaterialTheme.colorScheme.surface,
        titleContentColor = MaterialTheme.colorScheme.onSurface,
        textContentColor = MaterialTheme.colorScheme.onSurface,
        title = { Text("Update available", fontSize = 20.sp) },
        text = {
            Column {
                Text(
                    text = "Version $currentVersion → ${info.version}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!info.body.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Release notes",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 240.dp)
                            .verticalScroll(rememberScrollState()),
                    ) {
                        Text(
                            text = info.body,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onUpdate,
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
            ) {
                Text("Update", fontSize = 16.sp)
            }
        },
        dismissButton = {
            TextButton(onClick = onLater) {
                Text("Later", fontSize = 16.sp)
            }
        },
    )
}

@Composable
private fun DownloadingDialog(
    info: ReleaseInfo,
    progressPercent: Int,
    onCancelDownload: () -> Unit,
) {
    AlertDialog(
        // During a download neither back press nor outside tap dismisses —
        // accidental dismissal would silently abort a large transfer.
        onDismissRequest = {},
        properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
        containerColor = MaterialTheme.colorScheme.surface,
        titleContentColor = MaterialTheme.colorScheme.onSurface,
        textContentColor = MaterialTheme.colorScheme.onSurface,
        title = { Text("Downloading update", fontSize = 20.sp) },
        text = {
            Column {
                Text(
                    text = "${info.version} · $progressPercent%",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(12.dp))
                LinearProgressIndicator(
                    progress = { progressPercent / 100f },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = Accent,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onCancelDownload) {
                Text("Cancel", fontSize = 16.sp)
            }
        },
    )
}

@Composable
private fun ReadyToInstallDialog(
    info: ReleaseInfo,
    onInstall: () -> Unit,
    onLater: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onLater,
        containerColor = MaterialTheme.colorScheme.surface,
        titleContentColor = MaterialTheme.colorScheme.onSurface,
        textContentColor = MaterialTheme.colorScheme.onSurface,
        title = { Text("Update ready", fontSize = 20.sp) },
        text = {
            Text(
                text = "Version ${info.version} has been downloaded. Install now to apply it.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        confirmButton = {
            Button(
                onClick = onInstall,
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
            ) {
                Text("Install", fontSize = 16.sp)
            }
        },
        dismissButton = {
            TextButton(onClick = onLater) {
                Text("Later", fontSize = 16.sp)
            }
        },
    )
}

@Composable
private fun UpToDateDialog(
    currentVersion: String,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        titleContentColor = MaterialTheme.colorScheme.onSurface,
        textContentColor = MaterialTheme.colorScheme.onSurface,
        title = { Text("You're up to date", fontSize = 20.sp) },
        text = {
            Text(
                text = "You're running version $currentVersion, the latest release.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
            ) {
                Text("OK", fontSize = 16.sp)
            }
        },
    )
}

@Composable
private fun ErrorDialog(
    state: UpdateUiState.Error,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        titleContentColor = MaterialTheme.colorScheme.onSurface,
        textContentColor = MaterialTheme.colorScheme.onSurface,
        title = { Text("Update failed", fontSize = 20.sp) },
        text = {
            Text(
                text = state.message,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        confirmButton = {
            if (state.retryable) {
                Button(
                    onClick = onRetry,
                    colors = ButtonDefaults.buttonColors(containerColor = Accent),
                ) {
                    Text("Retry", fontSize = 16.sp)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Dismiss", fontSize = 16.sp)
            }
        },
    )
}
