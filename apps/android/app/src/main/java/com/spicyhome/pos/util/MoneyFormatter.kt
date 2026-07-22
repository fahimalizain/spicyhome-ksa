package com.spicyhome.pos.util

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat

object MoneyFormatter {

    private val format = DecimalFormat("#,##0.00")

    fun halalasToSar(halalas: BigDecimal): String {
        val sar = halalas.divide(BigDecimal(100), 2, RoundingMode.HALF_UP)
        return "${format.format(sar)} SAR"
    }

    fun halalasToSar(halalas: Long): String {
        return halalasToSar(BigDecimal.valueOf(halalas))
    }

    /**
     * Decompose VAT-inclusive price into excl. price + VAT amount.
     * Uses the standard KSA formula: excl = incl * 10000 / (10000 + vatRateBp)
     */
    fun decomposeVat(priceInclHalalas: Long, vatRateBp: Long): Pair<Long, Long> {
        val incl = BigDecimal.valueOf(priceInclHalalas)
        val rate = BigDecimal.valueOf(vatRateBp)
        val denominator = BigDecimal(10000).add(rate)
        val excl = incl.multiply(BigDecimal(10000)).divide(denominator, 0, RoundingMode.HALF_UP)
        val vat = incl.subtract(excl)
        return Pair(excl.toLong(), vat.toLong())
    }

    /**
     * Simple cart total: price * qty, then decompose VAT.
     */
    fun cartItemTotal(priceInclHalalas: Long, qty: Int, vatRateBp: Long): Triple<Long, Long, Long> {
        val lineTotal = priceInclHalalas * qty
        val (excl, vat) = decomposeVat(lineTotal, vatRateBp)
        return Triple(lineTotal, excl, vat)
    }
}
