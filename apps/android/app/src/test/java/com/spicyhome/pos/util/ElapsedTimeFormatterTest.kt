package com.spicyhome.pos.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ElapsedTimeFormatterTest {

    @Test
    fun `formats zero as 0s`() {
        assertThat(ElapsedTimeFormatter.format(0)).isEqualTo("0s")
    }

    @Test
    fun `formats sub-minute values in seconds`() {
        assertThat(ElapsedTimeFormatter.format(45)).isEqualTo("45s")
    }

    @Test
    fun `formats exactly one minute as 1m`() {
        assertThat(ElapsedTimeFormatter.format(60)).isEqualTo("1m")
    }

    @Test
    fun `omits zero seconds for whole minutes`() {
        assertThat(ElapsedTimeFormatter.format(120)).isEqualTo("2m")
        assertThat(ElapsedTimeFormatter.format(3660)).isEqualTo("1h 1m")
    }

    @Test
    fun `includes seconds after minutes`() {
        assertThat(ElapsedTimeFormatter.format(65)).isEqualTo("1m 5s")
    }

    @Test
    fun `formats exactly one hour as 1h`() {
        assertThat(ElapsedTimeFormatter.format(3600)).isEqualTo("1h")
    }

    @Test
    fun `omits zero minutes when hours and seconds present`() {
        assertThat(ElapsedTimeFormatter.format(3605)).isEqualTo("1h 5s")
    }

    @Test
    fun `formats hours minutes and seconds`() {
        assertThat(ElapsedTimeFormatter.format(3665)).isEqualTo("1h 1m 5s")
        assertThat(ElapsedTimeFormatter.format(7325)).isEqualTo("2h 2m 5s")
    }

    @Test
    fun `does not zero-pad`() {
        assertThat(ElapsedTimeFormatter.format(5)).isEqualTo("5s")
        assertThat(ElapsedTimeFormatter.format(65)).isEqualTo("1m 5s")
    }

    @Test
    fun `clamps negative input to 0s`() {
        assertThat(ElapsedTimeFormatter.format(-1)).isEqualTo("0s")
        assertThat(ElapsedTimeFormatter.format(-3600)).isEqualTo("0s")
    }
}
