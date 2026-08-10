/**
 * bake/collect.ts — collect print jobs for a probe format.
 *
 * Every collector is read-only: only ever SELECTs. Never INSERT/UPDATE/DELETE.
 *
 * This slice implements **kitchen** fully, on top of the shared
 * print-documents helpers (`buildKitchenTicketBuffer`) — the same builder the
 * production printKitchenTickets path uses, so the baked buffers cannot drift
 * from real kitchen tickets. All other formats throw a "not implemented yet"
 * error and are added in later slices.
 */

import { and, eq } from 'drizzle-orm';
import { orderItems, orders, printers } from '@spicyhome/db';
import { OrderStatus, PrinterRole } from '@spicyhome/shared';
import { buildKitchenTicketBuffer, type PrintDocumentsDb } from '../print-documents';
import type {
  BakedPrintJob,
  BakedPrinterTarget,
  BakeCollectResult,
  BakeFilters,
  ProbeFormat,
} from './types';

/**
 * Hard filter failure: an explicit --order/--printer id that cannot be baked
 * (missing, wrong status, no items, inactive, wrong role) or a filter that is
 * invalid for the requested format. The CLI catches this, prints the message,
 * exits 1 and never writes the emit script.
 */
export class BakeFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BakeFilterError';
  }
}

export function collectPrintJobs(
  db: PrintDocumentsDb,
  format: ProbeFormat,
  filters: BakeFilters,
): BakeCollectResult {
  switch (format) {
    case 'kitchen':
      return collectKitchenJobs(db, filters);
    default:
      throw new Error(`format '${format}' is not implemented yet`);
  }
}

// ── Kitchen ──────────────────────────────────────────────────────────────────

type PrinterRow = typeof printers.$inferSelect;
type OrderRow = typeof orders.$inferSelect;

/**
 * Collect one baked kitchen ticket per (eligible open order with items x
 * eligible kitchen printer), building each buffer via
 * `buildKitchenTicketBuffer` (the same builder `printKitchenTickets` uses —
 * no reimplemented header/item joins here).
 *
 * Explicit `orderIds` / `printerIds` are validated hard: any id that is
 * missing, not open, item-less (orders), inactive, or not kitchen-role
 * (printers) throws a `BakeFilterError` naming the id and the reason. Without
 * explicit ids, open orders with zero items are skipped with a note.
 * `--limit` takes the first N eligible orders by order id ascending.
 */
function collectKitchenJobs(db: PrintDocumentsDb, filters: BakeFilters): BakeCollectResult {
  if (filters.refundIds && filters.refundIds.length > 0) {
    throw new BakeFilterError(
      `--refund is not valid for format 'kitchen' (kitchen bakes open orders only)`,
    );
  }
  if (filters.kickDrawer) {
    throw new BakeFilterError(
      `--kick-drawer is not valid for format 'kitchen' (no cash drawer on kitchen tickets)`,
    );
  }

  const notes: string[] = [];
  if (filters.all) {
    notes.push('--all ignored for kitchen: all eligible open orders are included by default');
  }

  const eligibleOrders = resolveEligibleOrders(db, filters);
  const targetPrinters = resolveTargetPrinters(db, filters);

  // Limit: after the order filter, take the first N eligible orders by order
  // id ascending (stable for both the default id-ascending scan and explicit
  // --order lists).
  let bakeOrders = eligibleOrders;
  if (filters.limit !== undefined && filters.limit > 0 && bakeOrders.length > filters.limit) {
    bakeOrders = [...bakeOrders].sort((a, b) => a.id - b.id).slice(0, filters.limit);
  }

  const jobs: BakedPrintJob[] = [];
  for (const order of bakeOrders) {
    const oiRows = db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).all();
    if (oiRows.length === 0) {
      notes.push(`Order ${order.id}: skipped (no items)`);
      continue;
    }

    // Label mirrors the helpers' document id resolution: prefer the ZATCA
    // document id, fall back to the internal reference.
    const label = order.documentId?.length ? order.documentId : `Order-${order.orderNo}`;

    for (const printer of targetPrinters) {
      // Raw printers row doubles as PrintDocumentPrinter (name/ip/port/config).
      const buffer = buildKitchenTicketBuffer(db, order.id, printer);
      jobs.push({
        format: 'kitchen',
        label,
        sourceId: order.id,
        printer: toBakedPrinterTarget(printer),
        buffer,
      });
    }
  }

  return { jobs, notes };
}

/** Eligible orders: explicit validated ids, or every open order (id ascending). */
function resolveEligibleOrders(db: PrintDocumentsDb, filters: BakeFilters): OrderRow[] {
  if (filters.orderIds && filters.orderIds.length > 0) {
    const selected: OrderRow[] = [];
    const seen = new Set<number>();
    for (const id of filters.orderIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const order = db.select().from(orders).where(eq(orders.id, id)).get();
      if (!order) throw new BakeFilterError(`Order ${id}: not found`);
      if (order.status !== OrderStatus.OPEN) {
        throw new BakeFilterError(`Order ${id}: not open (status '${order.status}')`);
      }
      const hasItems = db
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderId, id))
        .limit(1)
        .get();
      if (!hasItems) throw new BakeFilterError(`Order ${id}: has no items`);
      selected.push(order);
    }
    return selected;
  }
  return db
    .select()
    .from(orders)
    .where(eq(orders.status, OrderStatus.OPEN))
    .orderBy(orders.id)
    .all();
}

/** Eligible printers: explicit validated ids, or every active kitchen printer. */
function resolveTargetPrinters(db: PrintDocumentsDb, filters: BakeFilters): PrinterRow[] {
  if (filters.printerIds && filters.printerIds.length > 0) {
    const selected: PrinterRow[] = [];
    const seen = new Set<number>();
    for (const id of filters.printerIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const printer = db.select().from(printers).where(eq(printers.id, id)).get();
      if (!printer) throw new BakeFilterError(`Printer ${id}: not found`);
      if (printer.role !== PrinterRole.KITCHEN) {
        throw new BakeFilterError(`Printer ${id}: role '${printer.role}' is not 'kitchen'`);
      }
      if (printer.isActive !== 1) {
        throw new BakeFilterError(`Printer ${id}: inactive`);
      }
      selected.push(printer);
    }
    return selected;
  }
  return db
    .select()
    .from(printers)
    .where(and(eq(printers.role, PrinterRole.KITCHEN), eq(printers.isActive, 1)))
    .orderBy(printers.id)
    .all();
}

/** Map a printers row to the baked connection target. */
function toBakedPrinterTarget(printer: PrinterRow): BakedPrinterTarget {
  return {
    printerId: printer.id,
    printerName: printer.name,
    connectionType: printer.connectionType === 'windows' ? 'windows' : 'tcp',
    ip: printer.ip,
    port: printer.port,
    windowsPrinterName: printer.windowsPrinterName,
  };
}
