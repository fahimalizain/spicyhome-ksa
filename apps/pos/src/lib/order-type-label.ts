/**
 * Human label for order type in list/detail.
 * - dine_in → "Dine-in"
 * - takeaway, no partner → "Takeaway"
 * - takeaway + partner, no ref → "{title}"
 * - takeaway + partner + ref → "{title} / {ref}"
 *
 * Only show " / {ref}" when deliveryExternalRef is a non-empty string after trim.
 * Prefer deliveryPartnerTitle; if title is null/empty but partner id is set, fall back is NOT required — treat as no partner (show "Takeaway").
 * Ignore partner fields when type is dine_in.
 */
export function formatOrderTypeLabel(order: {
  type: string;
  deliveryPartnerTitle?: string | null;
  deliveryExternalRef?: string | null;
}): string {
  if (order.type !== 'takeaway') {
    return 'Dine-in';
  }
  const title = order.deliveryPartnerTitle?.trim();
  if (!title) {
    return 'Takeaway';
  }
  const ref = order.deliveryExternalRef?.trim();
  return ref ? `${title} / ${ref}` : title;
}
