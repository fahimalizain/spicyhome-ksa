/**
 * bake/collect.ts — collect print jobs for a probe format.
 *
 * Every collector is read-only: only ever SELECTs. Never INSERT/UPDATE/DELETE.
 *
 * All five formats are implemented on top of the shared print-documents
 * helpers (`buildKitchenTicketBuffer`, `buildOpenOrderReceiptBuffer`,
 * `buildSimplifiedInvoiceBuffer`, `buildCreditNoteBuffer`,
 * `buildTestTicketBuffer`) — the same builders the production print paths
 * use, so the baked buffers cannot drift from real documents.
 */

import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import {
  orderItems,
  orderRefunds,
  orders,
  printers,
  zatcaCreditNotes,
  zatcaInvoices,
} from '@spicyhome/db';
import { OrderStatus, PrinterRole } from '@spicyhome/shared';
import {
  buildCreditNoteBuffer,
  buildKitchenTicketBuffer,
  buildOpenOrderReceiptBuffer,
  buildSimplifiedInvoiceBuffer,
  buildTestTicketBuffer,
  PRINTABLE_QR_STATUSES,
  type PrintDocumentsDb,
} from '../print-documents';
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
    case 'open_order':
      return collectOpenOrderJobs(db, filters);
    case 'receipt':
      return collectReceiptJobs(db, filters);
    case 'credit_note':
      return collectCreditNoteJobs(db, filters);
    case 'test':
      return collectTestJobs(db, filters);
    default:
      // Unreachable: every ProbeFormat has a case above.
      throw new Error(`Unknown format: ${format}`);
  }
}

// ── Kitchen ──────────────────────────────────────────────────────────────────

type PrinterRow = typeof printers.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type RefundRow = typeof orderRefunds.$inferSelect;

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
  const bakeOrders = applyLimit(eligibleOrders, filters.limit);

  const jobs: BakedPrintJob[] = [];
  for (const order of bakeOrders) {
    const oiRows = db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).all();
    if (oiRows.length === 0) {
      notes.push(`Order ${order.id}: skipped (no items)`);
      continue;
    }

    const label = documentLabel(order);

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

// ── Open order receipt (non-ZATCA) ───────────────────────────────────────────

/**
 * Collect one baked open order receipt per (eligible open order with items x
 * eligible receipt printer), building each buffer via
 * `buildOpenOrderReceiptBuffer` (the same builder the printOpenOrderReceipt
 * path uses). Eligibility and explicit-id validation are identical to
 * kitchen: open orders with at least one item; item-less open orders are
 * skipped with a note in the default scan.
 *
 * `--kick-drawer` is rejected: open order receipts are deliberately not tax
 * invoices and never kick the drawer (the builder hard-codes kickDrawer
 * false). `--refund` is invalid here; `--all` is a soft no-op (every open
 * order is already included by default).
 */
function collectOpenOrderJobs(db: PrintDocumentsDb, filters: BakeFilters): BakeCollectResult {
  if (filters.refundIds && filters.refundIds.length > 0) {
    throw new BakeFilterError(
      `--refund is not valid for format 'open_order' (open order bakes open orders only)`,
    );
  }
  if (filters.kickDrawer) {
    throw new BakeFilterError(
      `--kick-drawer is not valid for format 'open_order' (open order receipts never kick the drawer)`,
    );
  }

  const notes: string[] = [];
  if (filters.all) {
    notes.push('--all ignored for open_order: all eligible open orders are included by default');
  }

  const eligibleOrders = resolveEligibleOrders(db, filters);
  const targetPrinters = resolveReceiptPrinters(db, filters, notes);
  const bakeOrders = applyLimit(eligibleOrders, filters.limit);

  const jobs: BakedPrintJob[] = [];
  for (const order of bakeOrders) {
    const oiRows = db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).all();
    if (oiRows.length === 0) {
      notes.push(`Order ${order.id}: skipped (no items)`);
      continue;
    }

    const label = documentLabel(order);

    for (const printer of targetPrinters) {
      const buffer = buildOpenOrderReceiptBuffer(db, order.id, printer);
      jobs.push({
        format: 'open_order',
        label,
        sourceId: order.id,
        printer: toBakedPrinterTarget(printer),
        buffer,
      });
    }
  }

  return { jobs, notes };
}

// ── Simplified tax invoice receipt ───────────────────────────────────────────

/**
 * Collect one baked simplified-invoice receipt per (eligible paid order with a
 * printable ZATCA invoice QR x eligible receipt printer), building each buffer
 * via `buildSimplifiedInvoiceBuffer` (the same builder `printReceipt` uses).
 *
 * Eligibility: `orders.status = 'paid'` AND at least one `zatca_invoices` row
 * in a printable QR status (`PRINTABLE_QR_STATUSES`) with a non-null qr_tlv —
 * mirroring the helper's printable lookup so bake eligibility and the printed
 * buffer cannot disagree.
 *
 * Default (no --all, no --order): the single most recent eligible order
 * (highest order id). `--all` widens to every eligible order (id ascending).
 * `--order` validates each id hard: missing, not paid, or without a printable
 * QR throws a `BakeFilterError`. `--limit` caps the selected set (first N by
 * order id ascending, same convention as kitchen). `--kick-drawer` is passed
 * into the builder; `--refund` is invalid here.
 */
function collectReceiptJobs(db: PrintDocumentsDb, filters: BakeFilters): BakeCollectResult {
  if (filters.refundIds && filters.refundIds.length > 0) {
    throw new BakeFilterError(
      `--refund is not valid for format 'receipt' (receipt bakes paid orders with a printable ZATCA invoice QR)`,
    );
  }

  const notes: string[] = [];
  const eligibleOrders = resolveEligibleReceiptOrders(db, filters);
  const targetPrinters = resolveReceiptPrinters(db, filters, notes);

  let bakeOrders = eligibleOrders;
  if (!filters.orderIds?.length && !filters.all) {
    // Default: the single most recent eligible order (highest order id).
    const mostRecent = [...bakeOrders].sort((a, b) => b.id - a.id)[0];
    bakeOrders = mostRecent ? [mostRecent] : [];
  }
  bakeOrders = applyLimit(bakeOrders, filters.limit);

  const jobs: BakedPrintJob[] = [];
  for (const order of bakeOrders) {
    const label = documentLabel(order);
    for (const printer of targetPrinters) {
      const buffer = buildSimplifiedInvoiceBuffer(db, order.id, printer, {
        kickDrawer: filters.kickDrawer === true,
      });
      jobs.push({
        format: 'receipt',
        label,
        sourceId: order.id,
        printer: toBakedPrinterTarget(printer),
        buffer,
      });
    }
  }

  return { jobs, notes };
}

/** Eligible receipt orders: explicit validated ids, or every paid order with a printable QR. */
function resolveEligibleReceiptOrders(db: PrintDocumentsDb, filters: BakeFilters): OrderRow[] {
  if (filters.orderIds && filters.orderIds.length > 0) {
    const selected: OrderRow[] = [];
    const seen = new Set<number>();
    for (const id of filters.orderIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const order = db.select().from(orders).where(eq(orders.id, id)).get();
      if (!order) throw new BakeFilterError(`Order ${id}: not found`);
      if (order.status !== OrderStatus.PAID) {
        throw new BakeFilterError(`Order ${id}: not paid (status '${order.status}')`);
      }
      if (!hasPrintableInvoiceQr(db, id)) {
        throw new BakeFilterError(`Order ${id}: no printable ZATCA invoice QR`);
      }
      selected.push(order);
    }
    return selected;
  }
  return db
    .select()
    .from(orders)
    .where(eq(orders.status, OrderStatus.PAID))
    .orderBy(orders.id)
    .all()
    .filter((o) => hasPrintableInvoiceQr(db, o.id));
}

// ── Credit note (refund receipt) ─────────────────────────────────────────────

/**
 * Collect one baked credit note per (eligible refund x eligible receipt
 * printer), building each buffer via `buildCreditNoteBuffer` (the same builder
 * `printRefundReceipt` uses).
 *
 * Eligibility: the refund has at least one `zatca_credit_notes` row in a
 * printable QR status with a non-null qr_tlv.
 *
 * Default (no --all/--refund/--order): the single most recent eligible refund
 * (highest refund id). `--all` widens to every eligible refund (id ascending).
 * `--refund` validates each refund id hard: missing or without a printable CN
 * QR throws a `BakeFilterError`. `--order` selects the eligible refunds of the
 * given orders (an order with zero eligible refunds hard-fails); when both
 * `--refund` and `--order` are given the sets are unioned and each explicitly
 * listed refund is validated. `--limit` caps the selected set (first N by
 * refund id ascending). `--kick-drawer` is passed into the builder.
 */
function collectCreditNoteJobs(db: PrintDocumentsDb, filters: BakeFilters): BakeCollectResult {
  const notes: string[] = [];
  const eligibleRefunds = resolveEligibleRefunds(db, filters);
  const targetPrinters = resolveReceiptPrinters(db, filters, notes);

  let bakeRefunds = eligibleRefunds;
  if (!filters.refundIds?.length && !filters.orderIds?.length && !filters.all) {
    // Default: the single most recent eligible refund (highest refund id).
    const mostRecent = [...bakeRefunds].sort((a, b) => b.id - a.id)[0];
    bakeRefunds = mostRecent ? [mostRecent] : [];
  }
  bakeRefunds = applyLimit(bakeRefunds, filters.limit);

  const jobs: BakedPrintJob[] = [];
  for (const refund of bakeRefunds) {
    // Label mirrors the helper's document id resolution: prefer the ZATCA
    // document id, fall back to the internal reference.
    const label = refund.documentId?.length ? refund.documentId : `Refund-${refund.id}`;

    for (const printer of targetPrinters) {
      const buffer = buildCreditNoteBuffer(db, refund.id, printer, {
        kickDrawer: filters.kickDrawer === true,
      });
      jobs.push({
        format: 'credit_note',
        label,
        sourceId: refund.id,
        printer: toBakedPrinterTarget(printer),
        buffer,
      });
    }
  }

  return { jobs, notes };
}

/**
 * Eligible refunds: explicit validated ids, explicit order ids (union), or
 * every refund with a printable ZATCA credit note QR (id ascending).
 */
function resolveEligibleRefunds(db: PrintDocumentsDb, filters: BakeFilters): RefundRow[] {
  const explicitRefundIds = filters.refundIds ?? [];
  const explicitOrderIds = filters.orderIds ?? [];

  if (explicitRefundIds.length > 0 || explicitOrderIds.length > 0) {
    const selected: RefundRow[] = [];
    const seen = new Set<number>();

    // Explicit refund ids: must exist and carry a printable CN QR.
    for (const id of explicitRefundIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const refund = db.select().from(orderRefunds).where(eq(orderRefunds.id, id)).get();
      if (!refund) throw new BakeFilterError(`Refund ${id}: not found`);
      if (!hasPrintableCreditNoteQr(db, id)) {
        throw new BakeFilterError(`Refund ${id}: no printable ZATCA credit note QR`);
      }
      selected.push(refund);
    }

    // Explicit order ids: the eligible refunds of those orders; a missing
    // order hard-fails with "not found" and an order with zero eligible
    // refunds hard-fails with the no-printable-QR message.
    for (const orderId of explicitOrderIds) {
      const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new BakeFilterError(`Order ${orderId}: not found`);
      const refunds = db
        .select()
        .from(orderRefunds)
        .where(eq(orderRefunds.orderId, orderId))
        .orderBy(orderRefunds.id)
        .all();
      const eligible = refunds.filter((r) => hasPrintableCreditNoteQr(db, r.id));
      if (eligible.length === 0) {
        throw new BakeFilterError(
          `Order ${orderId}: no refunds with a printable ZATCA credit note QR`,
        );
      }
      for (const refund of eligible) {
        if (seen.has(refund.id)) continue;
        seen.add(refund.id);
        selected.push(refund);
      }
    }
    return selected;
  }

  return db
    .select()
    .from(orderRefunds)
    .orderBy(orderRefunds.id)
    .all()
    .filter((r) => hasPrintableCreditNoteQr(db, r.id));
}

// ── Test ticket (printer diagnostic) ─────────────────────────────────────────

/**
 * Collect one baked diagnostic test ticket per eligible printer (any role),
 * building each buffer via `buildTestTicketBuffer` (the same builder
 * `printTestTicket` uses). Synthetic: no orders, no refunds — the buffer is
 * pure printer row (name/ip/port/config), no document lookups.
 *
 * Default: every active printer (receipt + kitchen, id ascending).
 * `--printer` restricts to the given ids and hard-fails on missing or
 * inactive printers; any role is acceptable. `--limit` caps the selected set
 * to the first N by printer id ascending. `--order` and `--refund` are
 * rejected — test tickets are synthetic. `--kick-drawer` is rejected — the
 * diagnostic ticket has its own content. `--all` is a soft no-op (all active
 * printers are already included by default).
 */
function collectTestJobs(db: PrintDocumentsDb, filters: BakeFilters): BakeCollectResult {
  if (filters.orderIds && filters.orderIds.length > 0) {
    throw new BakeFilterError(
      `--order is not valid for format 'test' (test tickets are synthetic — no orders)`,
    );
  }
  if (filters.refundIds && filters.refundIds.length > 0) {
    throw new BakeFilterError(
      `--refund is not valid for format 'test' (test tickets are synthetic — no refunds)`,
    );
  }
  if (filters.kickDrawer) {
    throw new BakeFilterError(
      `--kick-drawer is not valid for format 'test' (the diagnostic ticket has its own content)`,
    );
  }

  const notes: string[] = [];
  if (filters.all) {
    notes.push('--all ignored for test: all active printers are included by default');
  }

  const targetPrinters = resolveTestPrinters(db, filters, notes);
  const bakePrinters = applyLimit(targetPrinters, filters.limit);

  const jobs: BakedPrintJob[] = bakePrinters.map((printer) => ({
    format: 'test',
    label: 'test',
    sourceId: null,
    printer: toBakedPrinterTarget(printer),
    buffer: buildTestTicketBuffer(printer),
  }));

  return { jobs, notes };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/**
 * `--limit`: first N rows by ascending id. Stable for both the default
 * id-ascending scans and explicit id lists (same convention as kitchen).
 */
function applyLimit<T extends { id: number }>(rows: T[], limit: number | undefined): T[] {
  if (limit === undefined || limit <= 0 || rows.length <= limit) return rows;
  return [...rows].sort((a, b) => a.id - b.id).slice(0, limit);
}

/** Label mirrors the helpers' document id resolution: documentId or Order-<orderNo>. */
function documentLabel(order: OrderRow): string {
  return order.documentId?.length ? order.documentId : `Order-${order.orderNo}`;
}

/**
 * True when the order has at least one `zatca_invoices` row in a printable QR
 * status with a non-null qr_tlv — mirrors the helper's printable lookup so
 * bake eligibility and the printed buffer cannot disagree.
 */
function hasPrintableInvoiceQr(db: PrintDocumentsDb, orderId: number): boolean {
  const row = db
    .select({ id: zatcaInvoices.id })
    .from(zatcaInvoices)
    .where(
      and(
        eq(zatcaInvoices.orderId, orderId),
        inArray(zatcaInvoices.status, [...PRINTABLE_QR_STATUSES]),
        isNotNull(zatcaInvoices.qrTlv),
      ),
    )
    .limit(1)
    .get();
  return row !== undefined;
}

/** Same printable-QR existence check for `zatca_credit_notes` rows. */
function hasPrintableCreditNoteQr(db: PrintDocumentsDb, refundId: number): boolean {
  const row = db
    .select({ id: zatcaCreditNotes.id })
    .from(zatcaCreditNotes)
    .where(
      and(
        eq(zatcaCreditNotes.refundId, refundId),
        inArray(zatcaCreditNotes.status, [...PRINTABLE_QR_STATUSES]),
        isNotNull(zatcaCreditNotes.qrTlv),
      ),
    )
    .limit(1)
    .get();
  return row !== undefined;
}

/**
 * Eligible receipt-role printers: explicit validated ids, or every active
 * receipt printer (id ascending). With no explicit ids and no active receipt
 * printer the bake is empty and a note explains why.
 */
function resolveReceiptPrinters(
  db: PrintDocumentsDb,
  filters: BakeFilters,
  notes: string[],
): PrinterRow[] {
  const targets = resolveRolePrinters(db, filters, PrinterRole.RECEIPT);
  if (targets.length === 0 && !(filters.printerIds && filters.printerIds.length > 0)) {
    notes.push('no active receipt printers — no jobs to bake');
  }
  return targets;
}

/**
 * Eligible test printers: explicit validated ids (any role), or every active
 * printer (id ascending). With no explicit ids and no active printer the bake
 * is empty and a note explains why.
 */
function resolveTestPrinters(
  db: PrintDocumentsDb,
  filters: BakeFilters,
  notes: string[],
): PrinterRow[] {
  const targets = resolveRolePrinters(db, filters, null);
  if (targets.length === 0 && !(filters.printerIds && filters.printerIds.length > 0)) {
    notes.push('no active printers — no jobs to bake');
  }
  return targets;
}

/**
 * Eligible printers: explicit validated ids, or every active printer with the
 * given role (id ascending). Explicit ids are validated hard: missing,
 * inactive, or wrong-role printers throw a `BakeFilterError` naming the id and
 * the reason. `role = null` accepts any role (test tickets).
 */
function resolveRolePrinters(
  db: PrintDocumentsDb,
  filters: BakeFilters,
  role: PrinterRole | null,
): PrinterRow[] {
  if (filters.printerIds && filters.printerIds.length > 0) {
    const selected: PrinterRow[] = [];
    const seen = new Set<number>();
    for (const id of filters.printerIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const printer = db.select().from(printers).where(eq(printers.id, id)).get();
      if (!printer) throw new BakeFilterError(`Printer ${id}: not found`);
      if (role !== null && printer.role !== role) {
        throw new BakeFilterError(`Printer ${id}: role '${printer.role}' is not '${role}'`);
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
    .where(
      role === null
        ? eq(printers.isActive, 1)
        : and(eq(printers.role, role), eq(printers.isActive, 1)),
    )
    .orderBy(printers.id)
    .all();
}

/** Kitchen targets: every active kitchen printer (kitchen fan-out). */
function resolveTargetPrinters(db: PrintDocumentsDb, filters: BakeFilters): PrinterRow[] {
  return resolveRolePrinters(db, filters, PrinterRole.KITCHEN);
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
