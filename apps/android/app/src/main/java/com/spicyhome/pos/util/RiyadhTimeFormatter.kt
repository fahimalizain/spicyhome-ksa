package com.spicyhome.pos.util

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Formats a Unix-seconds timestamp as the Asia/Riyadh wall-clock time.
 *
 * Riyadh is UTC+3 with no DST (AGENTS.md "Timezone"; same fixed offset as
 * `ServiceDay.RIYADH_OFFSET`), so an explicit offset is exact and the result
 * does **not** depend on the device timezone.
 *
 * Pattern: `h:mm:ss a` with `Locale.US` (English), e.g. `12:00:00 AM`,
 * `3:45:30 PM`. Stable and locale-independent by construction — the POS list
 * uses the host-browser `toLocaleTimeString()` which is locale-dependent;
 * this pins one readable English format for the Android twin.
 */
object RiyadhTimeFormatter {

    /** Asia/Riyadh fixed offset: UTC+3, no DST (same as `ServiceDay`). */
    private val RIYADH_OFFSET: ZoneOffset = ZoneOffset.ofHours(3)

    /** `h:mm:ss a` in Locale.US: e.g. `12:00:00 AM`, `3:45:30 PM`. */
    private val FORMATTER: DateTimeFormatter =
        DateTimeFormatter.ofPattern("h:mm:ss a", Locale.US)

    /**
     * Format a Unix-epoch timestamp (seconds) as the Asia/Riyadh wall-clock
     * time.
     *
     * @param unixSeconds Unix epoch seconds (e.g. `OrderSummaryResponse.createdAt`).
     */
    fun format(unixSeconds: Long): String =
        Instant.ofEpochSecond(unixSeconds).atOffset(RIYADH_OFFSET).format(FORMATTER)
}
