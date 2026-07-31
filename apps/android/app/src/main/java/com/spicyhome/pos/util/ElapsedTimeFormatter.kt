package com.spicyhome.pos.util

/**
 * Formats an elapsed duration in seconds as a compact, human-readable string
 * without zero-padding. Omitted higher units and zero trailing segments are
 * omitted:
 *
 * - 0        → `0s`
 * - 45       → `45s`
 * - 60       → `1m`
 * - 65       → `1m 5s`
 * - 3600     → `1h`
 * - 3605     → `1h 5s`
 * - 3660     → `1h 1m`
 * - 3665     → `1h 1m 5s`
 * - 7325     → `2h 2m 5s`
 *
 * Negative inputs are clamped to `0s`.
 * Must stay identical to the POS implementation in
 * `apps/pos/src/lib/format-elapsed.ts`.
 */
object ElapsedTimeFormatter {

    fun format(totalSecInput: Long): String {
        val totalSec = maxOf(0L, totalSecInput)
        val s = totalSec % 60
        val m = (totalSec / 60) % 60
        val h = totalSec / 3600

        return when {
            h > 0 && m == 0L && s == 0L -> "${h}h"
            h > 0 && m == 0L -> "${h}h ${s}s"
            h > 0 && s == 0L -> "${h}h ${m}m"
            h > 0 -> "${h}h ${m}m ${s}s"
            m > 0 && s == 0L -> "${m}m"
            m > 0 -> "${m}m ${s}s"
            else -> "${s}s"
        }
    }
}
