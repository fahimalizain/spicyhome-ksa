package com.spicyhome.pos.util

/**
 * Human label for order type in list/detail — the Android Kotlin twin of
 * `apps/pos/src/lib/order-type-label.ts` (canonical TypeScript implementation).
 *
 * **Keep the semantics in sync with the TS file** — mirror the cases in
 * `apps/pos/src/lib/order-type-label.test.ts` and
 * `apps/android/app/src/test/java/com/spicyhome/pos/util/OrderTypeLabelTest.kt`.
 *
 * - dine_in → "Dine-in"
 * - takeaway, no partner → "Takeaway"
 * - takeaway + partner, no ref → "{title}"
 * - takeaway + partner + ref → "{title} / {ref}"
 *
 * Only show " / {ref}" when the external ref is a non-empty string after trim.
 * Prefer the partner title; if the title is null/blank, treat as no partner
 * (show "Takeaway") — no fallback to the partner id. Ignore partner fields
 * when type is dine_in.
 */
object OrderTypeLabel {

    fun format(
        type: String,
        deliveryPartnerTitle: String? = null,
        deliveryExternalRef: String? = null,
    ): String {
        if (type != "takeaway") {
            return "Dine-in"
        }
        val title = deliveryPartnerTitle?.trim()
        if (title.isNullOrEmpty()) {
            return "Takeaway"
        }
        val ref = deliveryExternalRef?.trim()
        return if (ref.isNullOrEmpty()) title else "$title / $ref"
    }
}
