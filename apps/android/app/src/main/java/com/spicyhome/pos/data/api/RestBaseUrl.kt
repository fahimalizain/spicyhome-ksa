package com.spicyhome.pos.data.api

/** Map the operator-entered server origin to the REST base (always .../api). */
fun restBaseUrl(savedUrl: String): String {
    val trimmed = savedUrl.trim().trimEnd('/')
    return if (trimmed.endsWith("/api")) trimmed else "$trimmed/api"
}