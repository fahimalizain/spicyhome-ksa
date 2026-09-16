package com.spicyhome.pos.util

import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse

/**
 * Promotion-aware order totals (Promotions slice 9).
 *
 * The server stamps the inclusive [OrderResponse.discountHalalas] plus the
 * Promotion snapshot (id / names / percentBp) on every order. Clients never
 * recompute a percent off the bill: payable is always
 * `totalHalalas − discountHalalas`, and the percent is display-only.
 * All amounts are integer halalas.
 */
object OrderTotals {

    /** Guest-facing payable: gross total minus the stamped inclusive Discount. */
    fun payableHalalas(totalHalalas: Long, discountHalalas: Long): Long =
        totalHalalas - discountHalalas

    /**
     * Post-Allowance VAT for display: without a Discount the stored line-sum
     * VAT passes through untouched (mixed-rate safe); otherwise the payable
     * is re-decomposed at 15% (restaurant-normal, ADR 0009 §10).
     */
    fun postAllowanceVatHalalas(
        totalHalalas: Long,
        discountHalalas: Long,
        lineVatHalalas: Long,
    ): Long {
        if (discountHalalas <= 0L) return lineVatHalalas
        return MoneyFormatter.decomposeVat(totalHalalas - discountHalalas, 1500L).second
    }

    /** Whether a stamped Promotion should be shown (id present + Discount > 0). */
    fun hasPromotion(promotionId: Long?, discountHalalas: Long): Boolean =
        promotionId != null && discountHalalas > 0L

    /**
     * "National Day 10%" label. `promotionPercentBp` is basis points
     * (1000 = 10%) and is display-only — never applied to amounts.
     */
    fun promotionLabel(promotionName: String, promotionPercentBp: Long): String {
        val percentText = if (promotionPercentBp % 100L == 0L) {
            "${promotionPercentBp / 100L}"
        } else {
            "${promotionPercentBp / 100.0}"
        }
        return "$promotionName $percentText%"
    }
}

/** Guest-facing payable for a hydrated order. */
fun OrderResponse.payableHalalas(): Long =
    OrderTotals.payableHalalas(totalHalalas, discountHalalas)

/** Guest-facing payable for an order list row. */
fun OrderSummaryResponse.payableHalalas(): Long =
    OrderTotals.payableHalalas(totalHalalas, discountHalalas)
