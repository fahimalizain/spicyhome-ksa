/**
 * Kitchen-printed quantity derivation from the immutable order event ledger
 * (ADR 0006). Mirrors the server's `order-events.service.getPrintedQty`
 * precedence exactly, so the POS "Send to Kitchen" button visibility matches
 * what the server would print:
 *
 * - if ANY `kitchen_print_enqueued` event mentions the `orderItemId`, the
 *   sum of `items[].printedQty` across those events is authoritative;
 * - otherwise the sum of `kitchenPrintedQty` from `item_added` /
 *   `item_updated` events is used (legacy auto-print histories, including
 *   printer-less claims).
 *
 * The enqueued branch is authoritative because the pre-ADR auto-print path
 * wrote BOTH an item event with `kitchenPrintedQty: N` AND a
 * `kitchen_print_enqueued` with `printedQty: N` — summing both would
 * double-count historical orders.
 */

export interface KitchenEventLike {
  type: string;
  payload: string;
}

const PRINTED_EVENT_TYPES = new Set(['item_added', 'item_updated', 'kitchen_print_enqueued']);

function parsePayload(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Total kitchen-printed quantity for an order item, derived from events.
 * Returns 0 when the item never went to the kitchen.
 */
export function getPrintedQtyFromEvents(
  events: ReadonlyArray<KitchenEventLike>,
  orderItemId: number,
): number {
  let fromItems = 0;
  let fromEnqueued = 0;
  let hasEnqueuedForItem = false;

  for (const event of events) {
    if (!PRINTED_EVENT_TYPES.has(event.type)) continue;
    const payload = parsePayload(event.payload);
    if (!payload) continue;

    if (event.type === 'kitchen_print_enqueued') {
      const items = payload.items;
      if (!Array.isArray(items)) continue;
      const match = items.find((i) => i && typeof i === 'object' && i.orderItemId === orderItemId);
      if (match) {
        hasEnqueuedForItem = true;
        if (typeof match.printedQty === 'number') {
          fromEnqueued += match.printedQty;
        }
      }
    } else if (payload.orderItemId === orderItemId) {
      fromItems += typeof payload.kitchenPrintedQty === 'number' ? payload.kitchenPrintedQty : 0;
    }
  }

  // Enqueued events are authoritative for anything that went through the
  // kitchen-print queue (old or new path); item events alone only count when
  // the item never went through enqueue.
  return hasEnqueuedForItem ? fromEnqueued : fromItems;
}

/**
 * True when any cart item with a server `orderItemId` has a quantity above
 * its kitchen-printed quantity — i.e. `send-to-kitchen` would produce a
 * non-empty differential print. Items without an `orderItemId` (pre-create
 * staging or brand-new unsaved lines) never count as unsent deltas because
 * they cannot be printed before being saved.
 */
export function hasUnsentKitchenDeltas(
  items: ReadonlyArray<{ orderItemId?: number; qty: number }>,
  events: ReadonlyArray<KitchenEventLike>,
): boolean {
  return items.some(
    (item) =>
      item.orderItemId != null && item.qty > getPrintedQtyFromEvents(events, item.orderItemId),
  );
}
