import { createHash } from 'crypto';
import { orderEvents } from '@spicyhome/db';
import { eq, desc, sql } from 'drizzle-orm';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderEventsService {
  private computeHash(
    orderId: number,
    eventIdx: number,
    userId: number,
    type: string,
    payload: string,
    prevHash: string,
    createdAt: number,
  ): string {
    const input = `${orderId}|${eventIdx}|${userId}|${type}|${payload}|${prevHash}|${createdAt}`;
    return createHash('sha256').update(input).digest('hex');
  }

  createEvent(
    tx: any,
    orderId: number,
    userId: number,
    type: string,
    payload: Record<string, unknown>,
    createdAt: number,
  ): { id: number; eventIdx: number; prevHash: string; hash: string } {
    // Get the max eventIdx for this order
    const lastEvent = tx
      .select({ eventIdx: orderEvents.eventIdx })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(desc(orderEvents.eventIdx))
      .limit(1)
      .get();
    const eventIdx = (lastEvent?.eventIdx ?? 0) + 1;

    // Get the previous event's hash
    const lastHash = tx
      .select({ hash: orderEvents.hash })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(desc(orderEvents.eventIdx))
      .limit(1)
      .get();
    const prevHash = lastHash?.hash ?? '';

    const payloadJson = JSON.stringify(payload);
    const hash = this.computeHash(
      orderId,
      eventIdx,
      userId,
      type,
      payloadJson,
      prevHash,
      createdAt,
    );

    const result = tx
      .insert(orderEvents)
      .values({
        orderId,
        eventIdx,
        userId,
        type,
        payload: payloadJson,
        prevHash,
        hash,
        createdAt,
      })
      .run();

    return { id: Number(result.lastInsertRowid), eventIdx, prevHash, hash };
  }

  getEvents(tx: any, orderId: number): any[] {
    return tx
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(orderEvents.eventIdx)
      .all();
  }

  verifyChain(_orderId: number, entries: any[]): { valid: boolean; brokenAt?: number } {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const expectedPrevHash = i === 0 ? '' : entries[i - 1].hash;
      if (entry.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAt: entry.eventIdx };
      }
      const expectedHash = this.computeHash(
        entry.orderId,
        entry.eventIdx,
        entry.userId,
        entry.type,
        entry.payload,
        entry.prevHash,
        entry.createdAt,
      );
      if (entry.hash !== expectedHash) {
        return { valid: false, brokenAt: entry.eventIdx };
      }
    }
    return { valid: true };
  }

  /**
   * Total kitchen-printed quantity for an order item, derived from the
   * immutable event ledger (ADR 0006).
   *
   * `orderItemId` is the global `order_items.id` PK, so filtering by payload
   * content is safe across orders.
   *
   * Two sources can carry printed quantity:
   * 1. Legacy item events (`item_added` / `item_updated`) carrying
   *    `kitchenPrintedQty` — historical orders printed under the old
   *    auto-print semantics (including printer-less claims), plus any
   *    residual rows. The new ADR 0006 send-to-kitchen path writes these
   *    with `kitchenPrintedQty: 0`.
   * 2. `kitchen_print_enqueued` events (explicit send-to-kitchen) — the sum
   *    of `items[].printedQty` for the matching `orderItemId`.
   *
   * Precedence: if ANY `kitchen_print_enqueued` event mentions this
   * `orderItemId`, the enqueued sum is authoritative and returned alone.
   * This is required because the pre-ADR auto-print path wrote BOTH an item
   * event with `kitchenPrintedQty: N` AND a `kitchen_print_enqueued` with
   * `printedQty: N` in the same transaction — summing both would
   * double-count historical orders. The enqueued sum is also correct for
   * the ADR 0006 path (item `kitchenPrintedQty` is always 0 there) and
   * accumulates correctly across multiple sends.
   *
   * Fallback: if no enqueued event mentions the item, the sum of
   * `kitchenPrintedQty` from `item_added` / `item_updated` is returned —
   * covering printer-less legacy claims and pure item-only histories.
   */
  getPrintedQty(tx: any, orderItemId: number): number {
    const rows = tx
      .select({ type: orderEvents.type, payload: orderEvents.payload })
      .from(orderEvents)
      .where(sql`${orderEvents.type} IN ('item_added', 'item_updated', 'kitchen_print_enqueued')`)
      .all() as Array<{ type: string; payload: string }>;

    return this.sumPrintedQtyByOrderItemId(rows, [orderItemId]).get(orderItemId) ?? 0;
  }

  /**
   * Batch variant of `getPrintedQty` for order-list enrichment: computes the
   * kitchen-printed quantity for MANY order items from a single batch of
   * already-fetched event rows (types restricted to `item_added` /
   * `item_updated` / `kitchen_print_enqueued`). Uses exactly the same
   * per-item precedence as `getPrintedQty`:
   *
   * - if ANY `kitchen_print_enqueued` event mentions the `orderItemId`, the
   *   sum of `items[].printedQty` across those events is authoritative;
   * - otherwise the sum of `kitchenPrintedQty` from item events (legacy).
   *
   * Returns a map keyed by `orderItemId` — every requested id is present,
   * defaulting to 0 when the item never went to the kitchen.
   */
  sumPrintedQtyByOrderItemId(
    events: ReadonlyArray<{ type: string; payload: string }>,
    orderItemIds: ReadonlyArray<number>,
  ): Map<number, number> {
    const idSet = new Set(orderItemIds);
    const fromItems = new Map<number, number>();
    const fromEnqueued = new Map<number, number>();
    const hasEnqueuedForItem = new Set<number>();

    const addTo = (map: Map<number, number>, id: number, qty: number): void => {
      map.set(id, (map.get(id) ?? 0) + qty);
    };

    for (const row of events) {
      let payload: any;
      try {
        payload = JSON.parse(row.payload);
      } catch {
        continue; // Ignore malformed JSON — treat as 0
      }
      if (row.type === 'kitchen_print_enqueued') {
        if (Array.isArray(payload.items)) {
          for (const item of payload.items) {
            if (
              item != null &&
              typeof item.orderItemId === 'number' &&
              idSet.has(item.orderItemId)
            ) {
              hasEnqueuedForItem.add(item.orderItemId);
              if (typeof item.printedQty === 'number') {
                addTo(fromEnqueued, item.orderItemId, item.printedQty);
              }
            }
          }
        }
      } else if (typeof payload.orderItemId === 'number' && idSet.has(payload.orderItemId)) {
        addTo(
          fromItems,
          payload.orderItemId,
          typeof payload.kitchenPrintedQty === 'number' ? payload.kitchenPrintedQty : 0,
        );
      }
    }

    const result = new Map<number, number>();
    for (const id of idSet) {
      result.set(
        id,
        hasEnqueuedForItem.has(id) ? (fromEnqueued.get(id) ?? 0) : (fromItems.get(id) ?? 0),
      );
    }
    return result;
  }
}
