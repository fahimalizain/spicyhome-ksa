package com.spicyhome.pos.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OrderTotalsTest {

    @Test
    fun `payable is gross minus stamped Discount`() {
        assertThat(OrderTotals.payableHalalas(10000L, 1000L)).isEqualTo(9000L)
        assertThat(OrderTotals.payableHalalas(4600L, 0L)).isEqualTo(4600L)
        assertThat(OrderTotals.payableHalalas(0L, 0L)).isEqualTo(0L)
    }

    @Test
    fun `post-Allowance VAT re-decomposes payable at 15 percent`() {
        // decompose(9000 @ 15%) = round(9000 * 1500 / 11500) = 1174
        assertThat(OrderTotals.postAllowanceVatHalalas(10000L, 1000L, 1304L)).isEqualTo(1174L)
    }

    @Test
    fun `post-Allowance VAT passes line VAT through without a Discount`() {
        assertThat(OrderTotals.postAllowanceVatHalalas(4600L, 0L, 600L)).isEqualTo(600L)
    }

    @Test
    fun `hasPromotion needs an id and a positive Discount`() {
        assertThat(OrderTotals.hasPromotion(7L, 1000L)).isTrue()
        assertThat(OrderTotals.hasPromotion(null, 1000L)).isFalse()
        assertThat(OrderTotals.hasPromotion(7L, 0L)).isFalse()
        assertThat(OrderTotals.hasPromotion(null, 0L)).isFalse()
    }

    @Test
    fun `promotionLabel formats basis points as percent`() {
        assertThat(OrderTotals.promotionLabel("National Day", 1000L)).isEqualTo("National Day 10%")
        assertThat(OrderTotals.promotionLabel("National Day", 1250L)).isEqualTo("National Day 12.5%")
        assertThat(OrderTotals.promotionLabel("Opening", 10000L)).isEqualTo("Opening 100%")
    }
}
