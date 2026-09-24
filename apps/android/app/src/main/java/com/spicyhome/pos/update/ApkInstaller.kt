package com.spicyhome.pos.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

/** Launches the system package installer for a downloaded APK. */
interface ApkInstaller {

    sealed interface Outcome {
        /** Installer intent launched; the user is now in the system flow. */
        data object Launching : Outcome

        /** Install-from-unknown-sources not granted; settings deep-link was opened. */
        data object MissingPermission : Outcome
    }

    fun install(apkFile: File): Outcome
}

/** FileProvider-backed installer for API 26+. No device-owner silent install. */
class SystemApkInstaller(private val context: Context) : ApkInstaller {

    override fun install(apkFile: File): ApkInstaller.Outcome {
        if (!context.packageManager.canRequestPackageInstalls()) {
            openUnknownSourcesSettings()
            return ApkInstaller.Outcome.MissingPermission
        }

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
        return ApkInstaller.Outcome.Launching
    }

    private fun openUnknownSourcesSettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
    }
}
