package com.spicyhome.pos.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Kotlin twin of the POS order-type label tests — mirrors the same acceptance
 * matrix (see `apps/pos/src/lib/order-type-label.test.ts`) so the two
 * implementations cannot silently diverge.
 */
class OrderTypeLabelTest {

    // ── Acceptance matrix (mirrors the POS example table) ───────────────

    @Test
    fun `dine_in without partner shows Dine-in`() {
        assertThat(OrderTypeLabel.format("dine_in")).isEqualTo("Dine-in")
    }

    @Test
    fun `dine_in ignores partner fields`() {
        assertThat(OrderTypeLabel.format("dine_in", "HungerStation", "HS-1"))
            .isEqualTo("Dine-in")
    }

    @Test
    fun `takeaway without partner shows Takeaway`() {
        assertThat(OrderTypeLabel.format("takeaway")).isEqualTo("Takeaway")
    }

    @Test
    fun `takeaway with empty title shows Takeaway`() {
        assertThat(OrderTypeLabel.format("takeaway", "", null)).isEqualTo("Takeaway")
    }

    @Test
    fun `takeaway with title and no ref shows title only`() {
        assertThat(OrderTypeLabel.format("takeaway", "HungerStation", null))
            .isEqualTo("HungerStation")
    }

    @Test
    fun `takeaway with title and empty ref shows title only`() {
        assertThat(OrderTypeLabel.format("takeaway", "HungerStation", ""))
            .isEqualTo("HungerStation")
    }

    @Test
    fun `takeaway with title and ref shows title slash ref`() {
        assertThat(OrderTypeLabel.format("takeaway", "HungerStation", "HS-883129"))
            .isEqualTo("HungerStation / HS-883129")
    }

    @Test
    fun `takeaway trims whitespace around ref`() {
        assertThat(OrderTypeLabel.format("takeaway", "HungerStation", "  HS-1  "))
            .isEqualTo("HungerStation / HS-1")
    }

    // ── Extra edge cases ────────────────────────────────────────────────

    @Test
    fun `takeaway with whitespace-only title shows Takeaway`() {
        assertThat(OrderTypeLabel.format("takeaway", "   ", "HS-1"))
            .isEqualTo("Takeaway")
    }

    @Test
    fun `takeaway with null title and ref shows Takeaway`() {
        assertThat(OrderTypeLabel.format("takeaway", null, null))
            .isEqualTo("Takeaway")
    }

    @Test
    fun `takeaway with title null and ref set shows Takeaway (no partner)`() {
        assertThat(OrderTypeLabel.format("takeaway", null, "HS-1"))
            .isEqualTo("Takeaway")
    }

    @Test
    fun `takeaway trims whitespace around title`() {
        assertThat(OrderTypeLabel.format("takeaway", "  HungerStation  ", null))
            .isEqualTo("HungerStation")
    }

    @Test
    fun `unknown non-takeaway type shows Dine-in`() {
        assertThat(OrderTypeLabel.format("delivery", "HungerStation", "HS-1"))
            .isEqualTo("Dine-in")
    }

    @Test
    fun `takeaway with whitespace-only ref shows title only`() {
        assertThat(OrderTypeLabel.format("takeaway", "HungerStation", "   "))
            .isEqualTo("HungerStation")
    }
}
