package com.spicyhome.pos.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneOffset

/**
 * Pins the `RiyadhTimeFormatter` output (`h:mm:ss a`, Locale.US, Asia/Riyadh
 * wall clock) against known Unix-second instants, built via `Instant` +
 * fixed offset the same way `ServiceDayTest` does.
 */
class RiyadhTimeFormatterTest {

    /** Unix seconds for a given Asia/Riyadh local date-time (UTC+3, no DST). */
    private fun riyadhSec(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0, second: Int = 0): Long =
        LocalDateTime.of(year, month, day, hour, minute, second).toEpochSecond(ZoneOffset.ofHours(3))

    /** Unix seconds for a given UTC date-time. */
    private fun utcSec(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0, second: Int = 0): Long =
        LocalDateTime.of(year, month, day, hour, minute, second).toEpochSecond(ZoneOffset.UTC)

    @Test
    fun `midnight in Riyadh formats as 12_00_00 AM`() {
        assertThat(RiyadhTimeFormatter.format(riyadhSec(2026, 7, 27, 0, 0, 0))).isEqualTo("12:00:00 AM")
    }

    @Test
    fun `midday in Riyadh formats as 12_00_00 PM`() {
        assertThat(RiyadhTimeFormatter.format(riyadhSec(2026, 7, 27, 12, 0, 0))).isEqualTo("12:00:00 PM")
    }

    @Test
    fun `afternoon in Riyadh formats with PM and no leading zero on the hour`() {
        assertThat(RiyadhTimeFormatter.format(riyadhSec(2026, 7, 27, 15, 45, 30))).isEqualTo("3:45:30 PM")
    }

    @Test
    fun `morning in Riyadh zero-pads minutes and seconds`() {
        assertThat(RiyadhTimeFormatter.format(riyadhSec(2026, 7, 27, 9, 5, 0))).isEqualTo("9:05:00 AM")
    }

    @Test
    fun `last second of the day formats as 11_59_59 PM`() {
        assertThat(RiyadhTimeFormatter.format(riyadhSec(2026, 7, 27, 23, 59, 59))).isEqualTo("11:59:59 PM")
    }

    @Test
    fun `applies the fixed UTC plus 3 offset independent of host timezone`() {
        // 2026-07-27 21:00 UTC = 2026-07-28 00:00 Asia/Riyadh.
        assertThat(RiyadhTimeFormatter.format(utcSec(2026, 7, 27, 21, 0, 0))).isEqualTo("12:00:00 AM")
    }
}
