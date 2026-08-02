package com.spicyhome.pos.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset

/**
 * Kotlin twin of `packages/shared/src/service-day.test.ts` — mirrors the same
 * boundary cases so the two implementations cannot silently diverge.
 */
class ServiceDayTest {

    /**
     * Build a Unix-ms value for a given Asia/Riyadh local date-time.
     *
     * Riyadh is UTC+3 with no DST, so `local time - 3h` gives the correct
     * Unix epoch in ms (same as the TS `riyadhMs` helper).
     */
    private fun riyadhMs(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0, second: Int = 0): Long =
        LocalDateTime.of(year, month, day, hour, minute, second).toEpochSecond(ZoneOffset.ofHours(3)) * 1000

    /** Build a Unix-ms value for a given UTC date-time. */
    private fun utcMs(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0, second: Int = 0): Long =
        LocalDateTime.of(year, month, day, hour, minute, second).toEpochSecond(ZoneOffset.UTC) * 1000

    // ── getServiceDayString ──────────────────────────────────────────────
    // Acceptance matrix:
    // | now (Asia/Riyadh) | getServiceDayString   |
    // |-------------------|-----------------------|
    // | Mon 10:00         | Monday's date         |
    // | Tue 03:00         | Monday's date         |
    // | Tue 04:59:59      | Monday's date         |
    // | Tue 05:00:00      | Tuesday's date        |
    // | Tue 05:00:01      | Tuesday's date        |

    @Test
    fun `getServiceDayString Mon 10_00 returns Monday date`() {
        // Monday = 2026-07-27
        val ms = riyadhMs(2026, 7, 27, 10, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-07-27")
    }

    @Test
    fun `getServiceDayString Tue 03_00 returns Monday date (previous service day)`() {
        val ms = riyadhMs(2026, 7, 28, 3, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-07-27")
    }

    @Test
    fun `getServiceDayString Tue 04_59_59 returns Monday date (previous service day)`() {
        val ms = riyadhMs(2026, 7, 28, 4, 59, 59)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-07-27")
    }

    @Test
    fun `getServiceDayString Tue 05_00_00 returns Tuesday date (new service day)`() {
        val ms = riyadhMs(2026, 7, 28, 5, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-07-28")
    }

    @Test
    fun `getServiceDayString Tue 05_00_01 returns Tuesday date`() {
        val ms = riyadhMs(2026, 7, 28, 5, 0, 1)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-07-28")
    }

    // ── Boundary cases ──────────────────────────────────────────────────

    @Test
    fun `getServiceDayString noon returns same calendar date`() {
        val ms = riyadhMs(2026, 1, 15, 12, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-01-15")
    }

    @Test
    fun `getServiceDayString 23_59_59 returns same calendar date`() {
        val ms = riyadhMs(2026, 1, 15, 23, 59, 59)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-01-15")
    }

    @Test
    fun `getServiceDayString 00_00_00 returns previous calendar date`() {
        val ms = riyadhMs(2026, 1, 16, 0, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-01-15")
    }

    @Test
    fun `getServiceDayString 04_00_00 returns previous calendar date`() {
        val ms = riyadhMs(2026, 1, 16, 4, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-01-15")
    }

    // ── Month/year boundaries ───────────────────────────────────────────

    @Test
    fun `getServiceDayString 2025-12-31 23_00 returns 2025-12-31`() {
        val ms = riyadhMs(2025, 12, 31, 23, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2025-12-31")
    }

    @Test
    fun `getServiceDayString 2026-01-01 03_00 returns 2025-12-31 (previous service day)`() {
        val ms = riyadhMs(2026, 1, 1, 3, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2025-12-31")
    }

    @Test
    fun `getServiceDayString 2026-01-01 05_00 returns 2026-01-01`() {
        val ms = riyadhMs(2026, 1, 1, 5, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-01-01")
    }

    // ── Host TZ independence (fixed UTC instants) ───────────────────────

    @Test
    fun `getServiceDayString correct label for fixed UTC instant`() {
        // 2026-07-28 02:00 UTC = 2026-07-28 05:00 Asia/Riyadh
        val ms = utcMs(2026, 7, 28, 2, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-07-28")
    }

    @Test
    fun `getServiceDayString previous service day for UTC instant just before 05_00 Riyadh`() {
        // 2026-07-28 01:59:59 UTC = 2026-07-28 04:59:59 Asia/Riyadh
        val ms = utcMs(2026, 7, 28, 1, 59, 59)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-07-27")
    }

    // ── getNextServiceDayBoundaryUnix ───────────────────────────────────
    // Acceptance matrix:
    // | now (Asia/Riyadh) | next boundary exp    |
    // |-------------------|----------------------|
    // | Mon 10:00         | Tue 05:00            |
    // | Tue 03:00         | Tue 05:00            |
    // | Tue 04:59:59      | Tue 05:00            |
    // | Tue 05:00:00      | Wed 05:00            |
    // | Tue 05:00:01      | Wed 05:00            |

    @Test
    fun `getNextServiceDayBoundaryUnix Mon 10_00 returns Tue 05_00 Riyadh`() {
        val ms = riyadhMs(2026, 7, 27, 10, 0, 0)
        // Tue 05:00 Riyadh = 2026-07-28 02:00 UTC
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 7, 28, 2, 0, 0) / 1000)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix Tue 03_00 returns Tue 05_00 Riyadh (boundary is today)`() {
        val ms = riyadhMs(2026, 7, 28, 3, 0, 0)
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 7, 28, 2, 0, 0) / 1000)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix Tue 04_59_59 returns Tue 05_00 Riyadh`() {
        val ms = riyadhMs(2026, 7, 28, 4, 59, 59)
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 7, 28, 2, 0, 0) / 1000)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix Tue 05_00_00 returns Wed 05_00 Riyadh (boundary is tomorrow)`() {
        val ms = riyadhMs(2026, 7, 28, 5, 0, 0)
        // Wed 05:00 Riyadh = 2026-07-29 02:00 UTC
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 7, 29, 2, 0, 0) / 1000)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix Tue 05_00_01 returns Wed 05_00 Riyadh`() {
        val ms = riyadhMs(2026, 7, 28, 5, 0, 1)
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 7, 29, 2, 0, 0) / 1000)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix returns Unix seconds (not milliseconds)`() {
        val exp = ServiceDay.getNextServiceDayBoundaryUnix(riyadhMs(2026, 1, 15, 12, 0, 0))
        // Roughly 1.7e9 for year 2026 in seconds.
        assertThat(exp).isGreaterThan(1_700_000_000L)
        assertThat(exp).isLessThan(5_000_000_000L)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix boundary is always in the future relative to nowMs`() {
        val ms = riyadhMs(2026, 1, 15, 5, 0, 1)
        val exp = ServiceDay.getNextServiceDayBoundaryUnix(ms)
        assertThat(exp).isGreaterThan(ms / 1000)
    }

    // ── Month/year boundary for next service day ────────────────────────

    @Test
    fun `getNextServiceDayBoundaryUnix 2025-12-31 23_00 returns 2026-01-01 05_00 Riyadh`() {
        val ms = riyadhMs(2025, 12, 31, 23, 0, 0)
        // 2026-01-01 05:00 Riyadh = 2026-01-01 02:00 UTC
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 1, 1, 2, 0, 0) / 1000)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix 2026-01-01 03_00 returns 2026-01-01 05_00 Riyadh (same day)`() {
        val ms = riyadhMs(2026, 1, 1, 3, 0, 0)
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 1, 1, 2, 0, 0) / 1000)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix 2026-01-01 05_00 returns 2026-01-02 05_00 Riyadh`() {
        val ms = riyadhMs(2026, 1, 1, 5, 0, 0)
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 1, 2, 2, 0, 0) / 1000)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix 2026-02-28 10_00 returns 2026-03-01 05_00 Riyadh (month boundary)`() {
        val ms = riyadhMs(2026, 2, 28, 10, 0, 0)
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 3, 1, 2, 0, 0) / 1000)
    }

    // ── Host TZ independence ────────────────────────────────────────────

    @Test
    fun `getNextServiceDayBoundaryUnix correct boundary from fixed UTC instant`() {
        // 2026-07-28 01:30 UTC = 2026-07-28 04:30 Riyadh; 04:30 < 05:00 → today at 05:00.
        val ms = utcMs(2026, 7, 28, 1, 30, 0)
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 7, 28, 2, 0, 0) / 1000)
    }

    @Test
    fun `getNextServiceDayBoundaryUnix next-day boundary from UTC instant after 05_00 Riyadh`() {
        // 2026-07-28 03:00 UTC = 2026-07-28 06:00 Riyadh; 06:00 >= 05:00 → tomorrow at 05:00.
        val ms = utcMs(2026, 7, 28, 3, 0, 0)
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(ms)).isEqualTo(utcMs(2026, 7, 29, 2, 0, 0) / 1000)
    }

    // ── getServiceDayBoundsUnix ─────────────────────────────────────────

    @Test
    fun `getServiceDayBoundsUnix returns half-open bounds spanning exactly one service day (86400 s)`() {
        val bounds = ServiceDay.getServiceDayBoundsUnix("2026-07-27")
        assertThat(bounds).isNotNull()
        assertThat(bounds!!.endUnix - bounds.startUnix).isEqualTo(86400L)
    }

    @Test
    fun `getServiceDayBoundsUnix starts at D 05_00 Riyadh and ends at D+1 05_00 Riyadh`() {
        val bounds = ServiceDay.getServiceDayBoundsUnix("2026-07-27")
        assertThat(bounds).isNotNull()
        // Riyadh 2026-07-27 05:00 = UTC 2026-07-27 02:00
        assertThat(bounds!!.startUnix).isEqualTo(utcMs(2026, 7, 27, 2, 0, 0) / 1000)
        // Riyadh 2026-07-28 05:00 = UTC 2026-07-28 02:00
        assertThat(bounds.endUnix).isEqualTo(utcMs(2026, 7, 28, 2, 0, 0) / 1000)
    }

    @Test
    fun `getServiceDayBoundsUnix bounds contain instants inside and exclude neighbors (half-open)`() {
        val bounds = ServiceDay.getServiceDayBoundsUnix("2026-07-27")!!
        // 2026-07-27 04:59:59 Riyadh — just before start, outside.
        assertThat(riyadhMs(2026, 7, 27, 4, 59, 59) / 1000).isLessThan(bounds.startUnix)
        // 2026-07-27 05:00:00 Riyadh — start is inclusive.
        assertThat(riyadhMs(2026, 7, 27, 5, 0, 0) / 1000).isEqualTo(bounds.startUnix)
        // 2026-07-27 12:00:00 Riyadh — inside.
        val noon = riyadhMs(2026, 7, 27, 12, 0, 0) / 1000
        assertThat(noon).isAtLeast(bounds.startUnix)
        assertThat(noon).isLessThan(bounds.endUnix)
        // 2026-07-28 04:59:59 Riyadh — last second inside (just before end).
        assertThat(riyadhMs(2026, 7, 28, 4, 59, 59) / 1000).isLessThan(bounds.endUnix)
        // 2026-07-28 05:00:00 Riyadh — end is exclusive (next service day).
        assertThat(riyadhMs(2026, 7, 28, 5, 0, 0) / 1000).isEqualTo(bounds.endUnix)
    }

    @Test
    fun `getServiceDayBoundsUnix consistent with getServiceDayString for mid-window instant`() {
        // 2026-07-27 23:59:59 Riyadh — mid-window of service day 2026-07-27.
        val nowMs = riyadhMs(2026, 7, 27, 23, 59, 59)
        val bounds = ServiceDay.getServiceDayBoundsUnix("2026-07-27")!!
        assertThat(ServiceDay.getServiceDayString(nowMs)).isEqualTo("2026-07-27")
        assertThat(nowMs / 1000).isAtLeast(bounds.startUnix)
        assertThat(nowMs / 1000).isLessThan(bounds.endUnix)
    }

    @Test
    fun `getServiceDayBoundsUnix consistent with getServiceDayString for pre-05_00 instant`() {
        // 2026-07-28 03:00 Riyadh belongs to service day 2026-07-27.
        val nowMs = riyadhMs(2026, 7, 28, 3, 0, 0)
        val bounds = ServiceDay.getServiceDayBoundsUnix("2026-07-27")!!
        assertThat(ServiceDay.getServiceDayString(nowMs)).isEqualTo("2026-07-27")
        assertThat(nowMs / 1000).isAtLeast(bounds.startUnix)
        assertThat(nowMs / 1000).isLessThan(bounds.endUnix)
    }

    @Test
    fun `getServiceDayBoundsUnix at the next boundary instant D excludes it and D+1 includes it`() {
        val boundarySec = ServiceDay.getServiceDayBoundsUnix("2026-07-27")!!.endUnix
        val boundaryMs = boundarySec * 1000 // 2026-07-28 05:00 Riyadh
        assertThat(ServiceDay.getServiceDayString(boundaryMs)).isEqualTo("2026-07-28")
        assertThat(boundarySec).isEqualTo(ServiceDay.getServiceDayBoundsUnix("2026-07-28")!!.startUnix)
    }

    @Test
    fun `getServiceDayBoundsUnix consistent with getNextServiceDayBoundaryUnix inside D`() {
        val nowMs = riyadhMs(2026, 7, 27, 12, 0, 0)
        val bounds = ServiceDay.getServiceDayBoundsUnix("2026-07-27")!!
        assertThat(ServiceDay.getServiceDayString(nowMs)).isEqualTo("2026-07-27")
        assertThat(ServiceDay.getNextServiceDayBoundaryUnix(nowMs)).isEqualTo(bounds.endUnix)
    }

    @Test
    fun `getServiceDayBoundsUnix handles month and year rollover (2025-12-31)`() {
        val bounds = ServiceDay.getServiceDayBoundsUnix("2025-12-31")!!
        // Riyadh 2025-12-31 05:00 = UTC 2025-12-31 02:00
        assertThat(bounds.startUnix).isEqualTo(utcMs(2025, 12, 31, 2, 0, 0) / 1000)
        // Riyadh 2026-01-01 05:00 = UTC 2026-01-01 02:00
        assertThat(bounds.endUnix).isEqualTo(utcMs(2026, 1, 1, 2, 0, 0) / 1000)
    }

    @Test
    fun `getServiceDayBoundsUnix adjacent service days chain seamlessly across year boundary`() {
        val lastOfYear = ServiceDay.getServiceDayBoundsUnix("2025-12-31")!!
        val firstOfYear = ServiceDay.getServiceDayBoundsUnix("2026-01-01")!!
        assertThat(lastOfYear.endUnix).isEqualTo(firstOfYear.startUnix)
        assertThat(firstOfYear.endUnix).isEqualTo(utcMs(2026, 1, 2, 2, 0, 0) / 1000)
    }

    @Test
    fun `getServiceDayBoundsUnix accepts leap day 2024-02-29 and rejects 2023-02-29`() {
        assertThat(ServiceDay.getServiceDayBoundsUnix("2024-02-29")).isNotNull()
        assertThat(ServiceDay.getServiceDayBoundsUnix("2023-02-29")).isNull()
    }

    @Test
    fun `getServiceDayBoundsUnix leap day 2024-02-29 ends at 2024-03-01 05_00 Riyadh`() {
        val bounds = ServiceDay.getServiceDayBoundsUnix("2024-02-29")!!
        assertThat(bounds.startUnix).isEqualTo(utcMs(2024, 2, 29, 2, 0, 0) / 1000)
        assertThat(bounds.endUnix).isEqualTo(utcMs(2024, 3, 1, 2, 0, 0) / 1000)
    }

    @Test
    fun `getServiceDayBoundsUnix rejects malformed date strings`() {
        val bad = listOf(
            "2026-13-01", // month out of range
            "2026-02-30", // day out of range
            "2026-1-1", // no zero padding
            "2026/01/01", // wrong separator
            "026-01-01", // wrong year width
            "2026-01-01 ", // trailing space
            "abc",
            "",
            "2026-01-01T00:00:00",
        )
        for (s in bad) {
            assertThat(ServiceDay.getServiceDayBoundsUnix(s)).isNull()
        }
    }

    // ── Integration ─────────────────────────────────────────────────────

    @Test
    fun `getServiceDayString and getNextServiceDayBoundaryUnix are consistent`() {
        // For any moment after 05:00, the next boundary should be (serviceDay + 1 day) at 05:00.
        val ms = riyadhMs(2026, 7, 28, 10, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-07-28")

        val boundary = ServiceDay.getNextServiceDayBoundaryUnix(ms)
        val boundaryUtc = Instant.ofEpochSecond(boundary).atOffset(ZoneOffset.UTC)
        // Boundary in UTC: Riyadh 05:00 = UTC 02:00.
        assertThat(boundaryUtc.hour).isEqualTo(2)
        assertThat(boundaryUtc.minute).isEqualTo(0)
        // Should be 2026-07-29 in UTC (next day's 02:00 UTC).
        assertThat(boundaryUtc.toLocalDate().toString()).isEqualTo("2026-07-29")
    }

    @Test
    fun `for pre-05_00 next boundary is same calendar date at 05_00`() {
        val ms = riyadhMs(2026, 7, 28, 3, 0, 0)
        assertThat(ServiceDay.getServiceDayString(ms)).isEqualTo("2026-07-27") // previous service day

        val boundary = ServiceDay.getNextServiceDayBoundaryUnix(ms)
        val boundaryUtc = Instant.ofEpochSecond(boundary).atOffset(ZoneOffset.UTC)
        // Should be 2026-07-28 05:00 Riyadh = 02:00 UTC.
        assertThat(boundaryUtc.hour).isEqualTo(2)
        assertThat(boundaryUtc.toLocalDate().toString()).isEqualTo("2026-07-28")
    }
}
