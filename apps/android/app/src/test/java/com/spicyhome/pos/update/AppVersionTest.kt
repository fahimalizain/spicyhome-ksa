package com.spicyhome.pos.update

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppVersionTest {

    @Test
    fun `parses YYYYMM dot DD dot N`() {
        val version = AppVersion.parse("202607.23.0")
        assertThat(version).isNotNull()
        assertThat(version!!.yyyymm).isEqualTo(202607)
        assertThat(version.day).isEqualTo(23)
        assertThat(version.increment).isEqualTo(0)
    }

    @Test
    fun `parses leading v prefix`() {
        assertThat(AppVersion.parse("v202608.01.1"))
            .isEqualTo(AppVersion.parse("202608.01.1"))
    }

    @Test
    fun `parse tolerates surrounding whitespace`() {
        assertThat(AppVersion.parse(" 202608.01.1 ")).isEqualTo(AppVersion.parse("202608.01.1"))
    }

    @Test
    fun `parse rejects invalid strings`() {
        assertThat(AppVersion.parse("")).isNull()
        assertThat(AppVersion.parse("abc")).isNull()
        assertThat(AppVersion.parse("2026.07.23")).isNull()
        assertThat(AppVersion.parse("202607231")).isNull()
        assertThat(AppVersion.parse("202607.23")).isNull()
        assertThat(AppVersion.parse("202607.23.1.2")).isNull()
        assertThat(AppVersion.parse("202607.23.x")).isNull()
        assertThat(AppVersion.parse("202607.2.1")).isNull()
    }

    @Test
    fun `orders versions correctly`() {
        assertThat(AppVersion.parse("202607.23.0")!!)
            .isLessThan(AppVersion.parse("202607.23.1")!!)
        assertThat(AppVersion.parse("202607.23.1")!!)
            .isLessThan(AppVersion.parse("202608.01.0")!!)
        assertThat(AppVersion.parse("202607.23.9")!!)
            .isLessThan(AppVersion.parse("202608.01.0")!!)
        assertThat(AppVersion.parse("202608.01.0")!!)
            .isGreaterThan(AppVersion.parse("202607.23.9")!!)
    }

    @Test
    fun `orders acceptance examples`() {
        // 202607.23.0 < 202607.23.1 < 202608.01.0
        assertThat(
            AppVersion.parse("202607.23.0")!! < AppVersion.parse("202607.23.1")!! &&
                AppVersion.parse("202607.23.1")!! < AppVersion.parse("202608.01.0")!!
        ).isTrue()
    }

    @Test
    fun `equality compares all components`() {
        assertThat(AppVersion.parse("202608.01.0"))
            .isEqualTo(AppVersion.parse("202608.01.0"))
        assertThat(AppVersion.parse("202608.01.0"))
            .isNotEqualTo(AppVersion.parse("202608.02.0"))
        assertThat(AppVersion.parse("202608.01.0"))
            .isNotEqualTo(AppVersion.parse("202608.01.1"))
    }

    @Test
    fun `isNewerThan compares strings`() {
        assertThat(AppVersion.isNewerThan("202607.23.0", "202608.01.0")).isTrue()
        assertThat(AppVersion.isNewerThan("202607.23.0", "202607.23.1")).isTrue()
        assertThat(AppVersion.isNewerThan("202608.01.0", "202607.23.0")).isFalse()
        assertThat(AppVersion.isNewerThan("202608.01.0", "202608.01.0")).isFalse()
    }

    @Test
    fun `isNewerThan with unparseable input is false`() {
        assertThat(AppVersion.isNewerThan("garbage", "202608.01.0")).isFalse()
        assertThat(AppVersion.isNewerThan("202608.01.0", "garbage")).isFalse()
        assertThat(AppVersion.isNewerThan("", "")).isFalse()
    }

    @Test
    fun `toString renders canonical format`() {
        assertThat(AppVersion.parse("202608.01.1").toString()).isEqualTo("202608.01.1")
    }

    @Test
    fun `toVersionCode matches known release versions`() {
        assertThat(AppVersion.parse("202608.01.0")!!.toVersionCode()).isEqualTo(2026080100)
        assertThat(AppVersion.parse("202608.01.1")!!.toVersionCode()).isEqualTo(2026080101)
        assertThat(AppVersion.parse("202608.01.2")!!.toVersionCode()).isEqualTo(2026080102)
    }

    @Test
    fun `toVersionCode increases monotonically within a day`() {
        val codes = (0..98).map { AppVersion.parse("202608.01.$it")!!.toVersionCode() }
        for (i in 1 until codes.size) {
            assertThat(codes[i]).isGreaterThan(codes[i - 1])
        }
    }

    @Test
    fun `toVersionCode rolls over across day boundaries`() {
        assertThat(AppVersion.parse("202607.31.99")!!.toVersionCode())
            .isLessThan(AppVersion.parse("202608.01.0")!!.toVersionCode())
    }

    @Test
    fun `toVersionCode caps the same-day increment at 99`() {
        assertThat(AppVersion.parse("202608.01.100")!!.toVersionCode())
            .isEqualTo(AppVersion.parse("202608.01.99")!!.toVersionCode())
        assertThat(AppVersion.parse("202608.01.999")!!.toVersionCode())
            .isEqualTo(AppVersion.parse("202608.01.99")!!.toVersionCode())
    }

    @Test
    fun `versionCode ordering matches AppVersion compareTo for uncapped increments`() {
        val versions = (0..99).map { AppVersion.parse("202608.01.$it")!! }
        for (a in versions.indices) {
            for (b in versions.indices) {
                val byVersion = versions[a].compareTo(versions[b])
                val byCode = versions[a].toVersionCode().compareTo(versions[b].toVersionCode())
                assertThat(byCode).isEqualTo(byVersion)
            }
        }
    }
}
