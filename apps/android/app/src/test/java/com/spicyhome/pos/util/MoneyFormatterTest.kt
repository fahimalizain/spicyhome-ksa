package com.spicyhome.pos.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.math.BigDecimal

class MoneyFormatterTest {

    @Test
    fun `halalasToSar formats correctly`() {
        assertThat(MoneyFormatter.halalasToSar(1500L)).contains("15.00")
        assertThat(MoneyFormatter.halalasToSar(1599L)).contains("15.99")
        assertThat(MoneyFormatter.halalasToSar(100L)).contains("1.00")
        assertThat(MoneyFormatter.halalasToSar(50L)).contains("0.50")
        assertThat(MoneyFormatter.halalasToSar(0L)).contains("0.00")
        assertThat(MoneyFormatter.halalasToSar(100000L)).contains("1,000.00")
    }

    @Test
    fun `halalasToSar with BigDecimal`() {
        assertThat(MoneyFormatter.halalasToSar(BigDecimal.valueOf(2500)))
            .contains("25.00")
    }

    @Test
    fun `decomposeVat 15 percent`() {
        val priceIncl = 11500L  // 115.00 SAR
        val vatRateBp = 1500L   // 15%

        val (excl, vat) = MoneyFormatter.decomposeVat(priceIncl, vatRateBp)

        // excl = 115 * 10000 / 11500 = 100.00 = 10000 halalas
        assertThat(excl).isEqualTo(10000L)
        // vat = 11500 - 10000 = 1500 halalas
        assertThat(vat).isEqualTo(1500L)
        // Round-trip: excl + vat = incl
        assertThat(excl + vat).isEqualTo(priceIncl)
    }

    @Test
    fun `decomposeVat round trip within 1 halala`() {
        val priceIncl = 100L  // 1.00 SAR
        val vatRateBp = 1500L // 15%

        val (excl, vat) = MoneyFormatter.decomposeVat(priceIncl, vatRateBp)
        val diff = priceIncl - (excl + vat)
        assertThat(diff).isIn(listOf(0L, 1L, -1L))
    }

    @Test
    fun `decomposeVat with random values`() {
        val testCases = listOf(
            Triple(115L, 1500L, Triple(100L, 15L, 0L)),
            Triple(230L, 1500L, Triple(200L, 30L, 0L)),
            Triple(575L, 1500L, Triple(500L, 75L, 0L)),
        )

        for ((incl, rate, _) in testCases) {
            val (excl, vat) = MoneyFormatter.decomposeVat(incl, rate)
            // Round-trip check
            assertThat(Math.abs(incl - (excl + vat))).isAtMost(1L)
        }
    }

    @Test
    fun `cartItemTotal computes correctly`() {
        val price = 1150L  // 11.50 SAR
        val qty = 3
        val rate = 1500L   // 15%

        val (total, excl, vat) = MoneyFormatter.cartItemTotal(price, qty, rate)

        // total = 1150 * 3 = 3450 halalas
        assertThat(total).isEqualTo(3450L)
        // vat of 3450 @ 15%: excl = 3450*10000/11500 = 3000
        assertThat(excl).isEqualTo(3000L)
        assertThat(vat).isEqualTo(450L)
        assertThat(excl + vat).isEqualTo(total)
    }

    @Test
    fun `cartItemTotal single item qty 1`() {
        val (total, _, _) = MoneyFormatter.cartItemTotal(1000L, 1, 1500L)
        assertThat(total).isEqualTo(1000L)
    }

    @Test
    fun `halalasToSar includes SAR suffix`() {
        assertThat(MoneyFormatter.halalasToSar(1000L)).endsWith("SAR")
    }
}
