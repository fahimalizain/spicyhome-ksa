package com.spicyhome.pos.util

import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Service-day helpers for Asia/Riyadh timezone — the Android Kotlin twin of
 * `packages/shared/src/service-day.ts` (canonical TypeScript implementation).
 *
 * **Keep the formulas in sync with the TS file** — change both sides
 * together, and mirror the boundary cases in `packages/shared/src/service-day.test.ts`
 * and `apps/android/app/src/test/java/com/spicyhome/pos/util/ServiceDayTest.kt`.
 *
 * A **service day** at SpicyHome runs from 05:00 to (next day) 05:00 in
 * Asia/Riyadh (+03:00, no DST). Used for JWT access-token expiry and, per
 * ADR 0008 (docs/adr/0008-service-day-business-day.md), for the business
 * day: `day_openings.business_date`, the orders-list `?date=` filter, and
 * `daily_order_seq` reset all run on this window.
 *
 * - Window: [D 05:00, (D+1) 05:00)  (half-open).
 * - Label D: YYYY-MM-DD = start date of the window.
 * - Times before 05:00 belong to the **previous** service day.
 *
 * These helpers use an explicit UTC+3 offset — they do **not** depend on the
 * device timezone (Riyadh has no DST, so a fixed offset is exact).
 */
object ServiceDay {

    /** Asia/Riyadh fixed offset: UTC+3, no DST. */
    private val RIYADH_OFFSET: ZoneOffset = ZoneOffset.ofHours(3)

    /** Service day starts at 05:00 Asia/Riyadh. */
    private const val SERVICE_DAY_HOUR = 5

    private const val DAY_SECONDS = 24 * 60 * 60L

    /** YYYY-MM-DD with zero-padded month/day (mirrors the TS DATE_RE). */
    private val DATE_RE = Regex("""^(\d{4})-(\d{2})-(\d{2})$""")

    /**
     * Return the service-day label (YYYY-MM-DD) for [nowMs].
     *
     * Times before 05:00 Asia/Riyadh belong to the **previous** calendar day.
     *
     * @param nowMs Unix milliseconds (e.g. `System.currentTimeMillis()`).
     */
    fun getServiceDayString(nowMs: Long): String {
        val now = Instant.ofEpochMilli(nowMs).atOffset(RIYADH_OFFSET)
        val date = if (now.hour < SERVICE_DAY_HOUR) now.toLocalDate().minusDays(1) else now.toLocalDate()
        // LocalDate.toString() is ISO-8601 YYYY-MM-DD.
        return date.toString()
    }

    /**
     * Return the Unix timestamp (seconds) of the **next** 05:00 Asia/Riyadh
     * service-day boundary.
     *
     * At exactly 05:00:00 the boundary is **tomorrow** 05:00 (half-open:
     * the current instant starts the new service day, so the next boundary
     * is +24h).
     *
     * @param nowMs Unix milliseconds (e.g. `System.currentTimeMillis()`).
     * @return Unix **seconds** suitable for JWT `exp`.
     */
    fun getNextServiceDayBoundaryUnix(nowMs: Long): Long {
        val now = Instant.ofEpochMilli(nowMs).atOffset(RIYADH_OFFSET)
        val boundaryDate =
            if (now.hour < SERVICE_DAY_HOUR) now.toLocalDate() else now.toLocalDate().plusDays(1)
        return boundaryDate.atTime(SERVICE_DAY_HOUR, 0).toEpochSecond(RIYADH_OFFSET)
    }

    /**
     * Return the half-open `[startUnix, endUnix)` bounds — Unix **seconds** —
     * of the service day labeled [dateStr] (`YYYY-MM-DD` = D). Window =
     * `[D 05:00, (D+1) 05:00)` Asia/Riyadh. All instants in the service day
     * satisfy `startUnix <= t < endUnix`.
     *
     * Returns `null` when [dateStr] is not a valid `YYYY-MM-DD` (servers
     * should map that to a 400).
     *
     * @param dateStr Service-day label `YYYY-MM-DD` (the window's start date).
     */
    fun getServiceDayBoundsUnix(dateStr: String): ServiceDayBounds? {
        val m = DATE_RE.matchEntire(dateStr) ?: return null
        val date = try {
            LocalDate.of(m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.groupValues[3].toInt())
        } catch (e: DateTimeException) {
            // Out-of-range month/day (e.g. 2026-13-01, 2026-02-30).
            return null
        }
        val startUnix = date.atTime(SERVICE_DAY_HOUR, 0).toEpochSecond(RIYADH_OFFSET)
        return ServiceDayBounds(startUnix = startUnix, endUnix = startUnix + DAY_SECONDS)
    }
}

/**
 * Half-open bounds of one service day, in Unix **seconds**: every instant
 * `t` inside the day satisfies `startUnix <= t < endUnix`.
 */
data class ServiceDayBounds(
    val startUnix: Long,
    val endUnix: Long,
)
