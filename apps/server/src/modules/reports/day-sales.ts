import { and, inArray, sql } from 'drizzle-orm';
import { itemCategories, items, orderEvents, orderItems } from '@spicyhome/db';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';
import { OrderEventsService } from '../orders/order-events.service';

export type DaySalesDb = BetterSQLite3Database<typeof schema>;

export interface DayCategorySales {
  categoryId: number | null;
  categoryName: string;
  itemCount: number;
  totalHalalas: number;
}

const printedQtyService = new OrderEventsService();

const KITCHEN_CANCEL_EVENT_SQL = sql`${orderEvents.type} IN (
  'item_added',
  'item_updated',
  'item_removed',
  'kitchen_print_enqueued',
  'item_price_overridden',
  'item_price_reset'
)`;

/**
 * Roll paid order items up to top-level `item_categories` (subcategories
 * collapse into their parent). Deleted/unlinked items land in Uncategorized.
 * Shared by GET /reports/x|z and the X/Z print buffers.
 */
export function loadDayCategorySales(db: DaySalesDb, paidOrderIds: number[]): DayCategorySales[] {
  if (paidOrderIds.length === 0) return [];

  const oiRows = db
    .select({
      itemId: orderItems.itemId,
      qty: orderItems.qty,
      totalHalalas: orderItems.totalHalalas,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, paidOrderIds))
    .all();
  if (oiRows.length === 0) return [];

  return aggregateByCategory(db, oiRows);
}

/**
 * Qty sent to kitchen then later reduced or removed, rolled up like
 * `loadDayCategorySales`. cancelledQty = printedQty − remainingQty (floor 0).
 * Removed lines are reconstructed from `order_events` (the `order_items` row
 * is gone). Amount is cancelledQty × last known unit price.
 */
export function loadDayKitchenCancelled(
  db: DaySalesDb,
  paidOrderIds: number[],
): DayCategorySales[] {
  if (paidOrderIds.length === 0) return [];

  const eventRows = db
    .select({
      type: orderEvents.type,
      payload: orderEvents.payload,
    })
    .from(orderEvents)
    .where(and(inArray(orderEvents.orderId, paidOrderIds), KITCHEN_CANCEL_EVENT_SQL))
    .orderBy(orderEvents.orderId, orderEvents.eventIdx)
    .all();
  if (eventRows.length === 0) return [];

  const meta = new Map<number, { itemId: number | null; unitPriceHalalas: number }>();

  const ensure = (orderItemId: number) => {
    let row = meta.get(orderItemId);
    if (!row) {
      row = { itemId: null, unitPriceHalalas: 0 };
      meta.set(orderItemId, row);
    }
    return row;
  };

  for (const ev of eventRows) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(ev.payload) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (ev.type === 'kitchen_print_enqueued') {
      const printedItems = payload.items;
      if (!Array.isArray(printedItems)) continue;
      for (const item of printedItems) {
        if (item != null && typeof item === 'object' && typeof item.orderItemId === 'number') {
          ensure(item.orderItemId);
        }
      }
      continue;
    }

    if (typeof payload.orderItemId !== 'number') continue;
    const row = ensure(payload.orderItemId);
    if (typeof payload.itemId === 'number') row.itemId = payload.itemId;
    if (typeof payload.unitPriceHalalas === 'number') {
      row.unitPriceHalalas = payload.unitPriceHalalas;
    } else if (typeof payload.toUnitPriceHalalas === 'number') {
      row.unitPriceHalalas = payload.toUnitPriceHalalas;
    } else if (
      ev.type === 'item_removed' &&
      row.unitPriceHalalas === 0 &&
      typeof payload.oldQty === 'number' &&
      payload.oldQty > 0 &&
      typeof payload.oldTotal === 'number'
    ) {
      row.unitPriceHalalas = Math.round(payload.oldTotal / payload.oldQty);
    }
  }

  const orderItemIds = [...meta.keys()];
  if (orderItemIds.length === 0) return [];

  const remainingRows = db
    .select({
      id: orderItems.id,
      itemId: orderItems.itemId,
      qty: orderItems.qty,
      unitPriceHalalas: orderItems.unitPriceHalalas,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, paidOrderIds))
    .all();
  const remainingById = new Map(remainingRows.map((r) => [r.id, r]));

  const printedByItem = printedQtyService.sumPrintedQtyByOrderItemId(
    eventRows.filter(
      (e) =>
        e.type === 'item_added' || e.type === 'item_updated' || e.type === 'kitchen_print_enqueued',
    ),
    orderItemIds,
  );

  const cancelled: Array<{ itemId: number | null; qty: number; totalHalalas: number }> = [];
  for (const orderItemId of orderItemIds) {
    const printedQty = printedByItem.get(orderItemId) ?? 0;
    const remaining = remainingById.get(orderItemId);
    const cancelledQty = printedQty - (remaining?.qty ?? 0);
    if (cancelledQty <= 0) continue;
    const line = meta.get(orderItemId)!;
    const unitPrice = remaining != null ? remaining.unitPriceHalalas : line.unitPriceHalalas;
    cancelled.push({
      itemId: remaining?.itemId ?? line.itemId,
      qty: cancelledQty,
      totalHalalas: cancelledQty * unitPrice,
    });
  }

  return aggregateByCategory(db, cancelled);
}

function aggregateByCategory(
  db: DaySalesDb,
  rows: Array<{ itemId: number | null; qty: number; totalHalalas: number }>,
): DayCategorySales[] {
  const itemIds = [...new Set(rows.map((r) => r.itemId).filter((id): id is number => id != null))];
  const itemRows =
    itemIds.length > 0
      ? db
          .select({ id: items.id, categoryId: items.categoryId })
          .from(items)
          .where(inArray(items.id, itemIds))
          .all()
      : [];
  const itemCatMap = new Map(itemRows.map((i) => [i.id, i.categoryId]));

  const allCategories = db
    .select({
      id: itemCategories.id,
      name: itemCategories.name,
      sortOrder: itemCategories.sortOrder,
    })
    .from(itemCategories)
    .all();
  const catMap = new Map(allCategories.map((c) => [c.id, c]));

  const agg = new Map<
    string,
    {
      categoryId: number | null;
      name: string;
      sortOrder: number;
      itemCount: number;
      totalHalalas: number;
    }
  >();
  for (const oi of rows) {
    const catId = oi.itemId != null ? (itemCatMap.get(oi.itemId) ?? null) : null;
    const cat = catId != null ? catMap.get(catId) : undefined;
    const key = cat ? String(cat.id) : 'null';
    if (!agg.has(key)) {
      agg.set(key, {
        categoryId: cat?.id ?? null,
        name: cat?.name ?? 'Uncategorized',
        sortOrder: cat?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        itemCount: 0,
        totalHalalas: 0,
      });
    }
    const row = agg.get(key)!;
    row.itemCount += oi.qty;
    row.totalHalalas += oi.totalHalalas;
  }

  return [...agg.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ categoryId, name, itemCount, totalHalalas }) => ({
      categoryId,
      categoryName: name,
      itemCount,
      totalHalalas,
    }));
}
