/**
 * print-documents.ts — pure "load from DB + build ESC/POS buffer" helpers.
 *
 * Extracted from PrintJobService so the production print paths and the
 * bake-print-probe share ONE implementation (no layout/data drift).
 *
 * Pure module: no NestJS, no PrintersService, no transport/send. Every helper
 * takes a drizzle DB handle and a minimal printer shape, loads the rows it
 * needs directly from the schema, and returns a ready-to-send ESC/POS buffer.
 * All monetary values are integer halalas; timestamps are Unix epoch seconds;
 * wall-clock Asia/Riyadh formatting lives inside the builders.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  deliveryPartners,
  items,
  orderItems,
  orderPayments,
  orderRefunds,
  orderRefundItems,
  orders,
  settings,
  tables,
  users,
  zatcaCreditNotes,
  zatcaInvoices,
} from '@spicyhome/db';
import { safeParsePrinterConfig } from '@spicyhome/shared';
import { KitchenTicketBuilder, KitchenTicketItem } from './kitchen-ticket-builder';
import { ReceiptBuilder, ReceiptItem } from './receipt-builder';
import { TestTicketBuilder } from './test-ticket-builder';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

export type PrintDocumentsDb = BetterSQLite3Database<typeof schema>;

/**
 * ZATCA statuses for which a signed QR payload is available.
 * - simplified: signed (fresh), reported (reporting success), failed (reporting failure; QR still valid)
 * - standard:   cleared (clearance success)
 *
 * Must NOT use QR from: pending, rejected, error (standard in-flight/failure).
 */
export const PRINTABLE_QR_STATUSES = ['cleared', 'signed', 'reported', 'failed'] as const;

/**
 * Minimal printer shape needed to build buffers.
 * `config` may be the raw JSON string (DB row) or already-parsed PrinterConfig
 * (PrintersService.mapPrinterRow). Always run through safeParsePrinterConfig.
 */
export interface PrintDocumentPrinter {
  id?: number;
  name: string;
  ip: string;
  port: number;
  config: unknown; // string | PrinterConfig
}

type OrderRow = typeof orders.$inferSelect;

// Builders are stateless between builds (width is fixed in the constructor),
// so a single module-level instance per builder is safe and matches the
// previous PrintJobService behavior of reusing one instance.
const receiptBuilder = new ReceiptBuilder();
const kitchenTicketBuilder = new KitchenTicketBuilder();

// ── Simplified tax invoice ───────────────────────────────────────────────────

/**
 * Build the ZATCA simplified-invoice receipt buffer for an order (the
 * `printReceipt` path). Reads the seller block from the `settings` table
 * directly (same keys as the ZATCA XML) and falls back to a printable
 * `zatca_invoices` row for the QR when `opts.qrTlvPayload` is not provided.
 * Throws `Error` when the order does not exist.
 */
export function buildSimplifiedInvoiceBuffer(
  db: PrintDocumentsDb,
  orderId: number,
  printer: PrintDocumentPrinter,
  opts?: { kickDrawer?: boolean; qrTlvPayload?: string },
): Buffer {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new Error(`Order ${orderId} not found`);

  const oiRows = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();

  // Seller block — same settings keys as the ZATCA XML.
  const sellerName = getSetting(db, 'seller_name', 'SpicyHome');
  const vatNumber = getSetting(db, 'vat_number', '');
  const sellerStreet = getSetting(db, 'seller_street', '');
  const sellerBuilding = getSetting(db, 'seller_building', '');
  const sellerCity = getSetting(db, 'seller_city', 'Riyadh');
  const sellerPostal = getSetting(db, 'seller_postal', '');
  const sellerCountry = getSetting(db, 'seller_country', 'SA');
  // Arabic seller fields (settings keys shared with ZATCA) — wired through for
  // the upcoming receipt layout; not printed yet.
  const sellerNameAr = getSetting(db, 'seller_name_ar', '');
  const sellerStreetAr = getSetting(db, 'seller_street_ar', '');
  const sellerCityAr = getSetting(db, 'seller_city_ar', '');

  // Load QR from a printable zatca_invoices row if not provided by caller.
  // Printable statuses:
  //   simplified: signed | reported | failed (signing already done; QR is valid)
  //   standard:   cleared (clearance success)
  // Must NOT use QR from: pending, rejected, error (standard in-flight/failure).
  let qrTlvPayload = opts?.qrTlvPayload ?? undefined;
  if (!qrTlvPayload) {
    const printable = db
      .select()
      .from(zatcaInvoices)
      .where(
        and(
          eq(zatcaInvoices.orderId, orderId),
          inArray(zatcaInvoices.status, [...PRINTABLE_QR_STATUSES]),
        ),
      )
      .orderBy(desc(zatcaInvoices.id))
      .get();
    if (printable?.qrTlv) {
      qrTlvPayload = printable.qrTlv;
    }
  }

  return receiptBuilder.build({
    documentKind: 'simplified_invoice',
    // Prefer the ZATCA IRN; fall back to the internal reference as last resort.
    documentId: order.documentId?.length ? order.documentId : `Order-${order.orderNo}`,
    createdAt: order.createdAt,
    sellerName,
    vatNumber,
    sellerStreet,
    sellerBuilding,
    sellerCity,
    sellerPostal,
    sellerCountry,
    sellerNameAr,
    sellerStreetAr,
    sellerCityAr,
    orderType: order.type as 'dine_in' | 'takeaway',
    tableName: resolveTableName(db, order),
    deliveryPartnerTitle: getDeliveryPartnerTitle(db, order),
    deliveryExternalRef: order.deliveryExternalRef ?? undefined,
    items: buildReceiptItemsFromOrderItems(db, oiRows),
    subtotalHalalas: order.subtotalHalalas,
    vatHalalas: order.vatHalalas,
    totalHalalas: order.totalHalalas,
    vatRateBp: sharedVatRateBp(oiRows.map((oi) => oi.vatRateBp)),
    arabic: safeParsePrinterConfig(printer.config).arabic,
    kickDrawer: opts?.kickDrawer ?? false,
    qrTlvPayload,
  });
}

// ── Open order receipt (non-ZATCA) ───────────────────────────────────────────

/**
 * Build a non-ZATCA open order receipt buffer (guest pays at the table with a
 * portable ATM-POS). Title is "OPEN ORDER RECEIPT" — deliberately NOT a tax
 * invoice: no QR, no VAT registration number, no seller address, no drawer
 * kick. The display name comes from the `restaurant_name` setting (not the
 * ZATCA `seller_name`). Throws `Error` when the order does not exist.
 */
export function buildOpenOrderReceiptBuffer(
  db: PrintDocumentsDb,
  orderId: number,
  printer: PrintDocumentPrinter,
): Buffer {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new Error(`Order ${orderId} not found`);

  const oiRows = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();

  // Restaurant display name — NOT the ZATCA legal seller name.
  const restaurantName = getSetting(db, 'restaurant_name', 'SpicyHome');

  // Net payments already recorded on the order (ADR 0006 — payment before
  // food). The ledger is signed: correction lines are negative, so the
  // reduce gives the true net paid amount.
  const paymentRows = db
    .select({ amountHalalas: orderPayments.amountHalalas })
    .from(orderPayments)
    .where(eq(orderPayments.orderId, orderId))
    .all();
  const paidHalalas = paymentRows.reduce((s, r) => s + r.amountHalalas, 0);

  return receiptBuilder.build({
    documentKind: 'open_order',
    // Not printed for open_order — kept in the type for ZATCA documents.
    documentId: order.documentId?.length ? order.documentId : `Order-${order.orderNo}`,
    createdAt: order.createdAt,
    sellerName: restaurantName,
    vatNumber: '',
    orderType: order.type as 'dine_in' | 'takeaway',
    tableName: resolveTableName(db, order),
    deliveryPartnerTitle: getDeliveryPartnerTitle(db, order),
    deliveryExternalRef: order.deliveryExternalRef ?? undefined,
    items: buildReceiptItemsFromOrderItems(db, oiRows),
    subtotalHalalas: order.subtotalHalalas,
    vatHalalas: order.vatHalalas,
    totalHalalas: order.totalHalalas,
    paidHalalas,
    vatRateBp: sharedVatRateBp(oiRows.map((oi) => oi.vatRateBp)),
    arabic: safeParsePrinterConfig(printer.config).arabic,
    kickDrawer: false,
    // No QR — open order receipts are not tax invoices.
  });
}

// ── Credit note (refund receipt) ─────────────────────────────────────────────

/**
 * Build a credit note receipt buffer for a specific refund record (the
 * `printRefundReceipt` path). Reads the seller block from the `settings`
 * table directly and falls back to a printable `zatca_credit_notes` row for
 * the QR when `opts.qrTlvPayload` is not provided. Throws `Error` when the
 * refund (or its order) does not exist.
 */
export function buildCreditNoteBuffer(
  db: PrintDocumentsDb,
  refundId: number,
  printer: PrintDocumentPrinter,
  opts?: { kickDrawer?: boolean; qrTlvPayload?: string },
): Buffer {
  const refund = db.select().from(orderRefunds).where(eq(orderRefunds.id, refundId)).get();
  if (!refund) throw new Error(`Refund ${refundId} not found`);

  const rifRows = db
    .select()
    .from(orderRefundItems)
    .where(eq(orderRefundItems.refundId, refundId))
    .all();

  const order = db.select().from(orders).where(eq(orders.id, refund.orderId)).get();
  if (!order) throw new Error(`Order ${refund.orderId} not found`);

  // Seller block — same settings keys as the ZATCA XML.
  const sellerName = getSetting(db, 'seller_name', 'SpicyHome');
  const vatNumber = getSetting(db, 'vat_number', '');
  const sellerStreet = getSetting(db, 'seller_street', '');
  const sellerBuilding = getSetting(db, 'seller_building', '');
  const sellerCity = getSetting(db, 'seller_city', 'Riyadh');
  const sellerPostal = getSetting(db, 'seller_postal', '');
  const sellerCountry = getSetting(db, 'seller_country', 'SA');
  // Arabic seller fields (settings keys shared with ZATCA) — wired through for
  // the upcoming receipt layout; not printed yet.
  const sellerNameAr = getSetting(db, 'seller_name_ar', '');
  const sellerStreetAr = getSetting(db, 'seller_street_ar', '');
  const sellerCityAr = getSetting(db, 'seller_city_ar', '');

  // Arabic name fallback: refund rows predating the snapshot fall back to
  // the snapshotted order_items.item_name_ar via order_item_id.
  const missingOrderItemIds = rifRows
    .filter((ri) => !ri.itemNameAr && ri.orderItemId != null)
    .map((ri) => ri.orderItemId as number);
  const oiNameArFallback = new Map<number, string | null>();
  if (missingOrderItemIds.length > 0) {
    const oiRows = db
      .select({ id: orderItems.id, itemNameAr: orderItems.itemNameAr })
      .from(orderItems)
      .where(inArray(orderItems.id, missingOrderItemIds))
      .all();
    for (const oi of oiRows) oiNameArFallback.set(oi.id, oi.itemNameAr);
  }

  const receiptItems: ReceiptItem[] = rifRows.map((ri) => ({
    qty: ri.qty,
    name: ri.itemName,
    nameAr:
      ri.itemNameAr ??
      (ri.orderItemId != null ? (oiNameArFallback.get(ri.orderItemId) ?? null) : null),
    unitPriceHalalas: ri.unitPriceHalalas,
    totalHalalas: ri.totalHalalas,
    vatRateBp: ri.vatRateBp,
  }));

  // Load QR from a printable zatca_credit_notes row if not provided by caller.
  // Printable statuses (same as invoices):
  //   simplified: signed | reported | failed (signing already done; QR is valid)
  //   standard:   cleared (clearance success)
  // Must NOT use QR from: pending, rejected, error (standard in-flight/failure).
  let qrTlvPayload = opts?.qrTlvPayload ?? undefined;
  if (!qrTlvPayload) {
    const printableCn = db
      .select()
      .from(zatcaCreditNotes)
      .where(
        and(
          eq(zatcaCreditNotes.refundId, refundId),
          inArray(zatcaCreditNotes.status, [...PRINTABLE_QR_STATUSES]),
        ),
      )
      .orderBy(desc(zatcaCreditNotes.id))
      .get();
    if (printableCn?.qrTlv) {
      qrTlvPayload = printableCn.qrTlv;
    }
  }

  return receiptBuilder.build({
    documentKind: 'credit_note',
    documentId: refund.documentId?.length ? refund.documentId : `Refund-${refund.id}`,
    originalDocumentId: order.documentId?.length ? order.documentId : undefined,
    reason: refund.reason ?? undefined,
    createdAt: refund.createdAt,
    sellerName,
    vatNumber,
    sellerStreet,
    sellerBuilding,
    sellerCity,
    sellerPostal,
    sellerCountry,
    sellerNameAr,
    sellerStreetAr,
    sellerCityAr,
    orderType: order.type as 'dine_in' | 'takeaway',
    tableName: resolveTableName(db, order),
    deliveryPartnerTitle: getDeliveryPartnerTitle(db, order),
    deliveryExternalRef: order.deliveryExternalRef ?? undefined,
    items: receiptItems,
    subtotalHalalas: refund.subtotalHalalas,
    vatHalalas: refund.vatHalalas,
    totalHalalas: refund.totalHalalas,
    vatRateBp: sharedVatRateBp(rifRows.map((ri) => ri.vatRateBp)),
    arabic: safeParsePrinterConfig(printer.config).arabic,
    kickDrawer: opts?.kickDrawer ?? false,
    qrTlvPayload,
  });
}

// ── Kitchen tickets ──────────────────────────────────────────────────────────

/**
 * Build a full kitchen ticket buffer for an order (all items, or filtered by
 * `opts.orderItemIds`) for ONE printer. Includes createdByName, tableName,
 * delivery partner, order notes, totals, and items with notes/prices — the
 * exact same content as the printKitchenTickets reprint path. Throws `Error`
 * when the order does not exist; returns a buffer even when the item list is
 * empty (the caller decides whether to print).
 */
export function buildKitchenTicketBuffer(
  db: PrintDocumentsDb,
  orderId: number,
  printer: PrintDocumentPrinter,
  opts?: { orderItemIds?: number[] },
): Buffer {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new Error(`Order ${orderId} not found`);

  let oiRows = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
  if (opts?.orderItemIds && opts.orderItemIds.length > 0) {
    const idSet = new Set(opts.orderItemIds);
    oiRows = oiRows.filter((oi) => idSet.has(oi.id));
  }

  const ticketItems: KitchenTicketItem[] = oiRows.map((oi) => ({
    qty: oi.qty,
    name: oi.itemName,
    notes: oi.notes,
    unitPriceHalalas: oi.unitPriceHalalas,
    totalHalalas: oi.totalHalalas,
  }));

  // Prefer the ZATCA document id; fall back to the internal reference as
  // last resort (same pattern as receipts).
  const documentId = order.documentId?.length ? order.documentId : `Order-${order.orderNo}`;

  return kitchenTicketBuilder.build({
    documentId,
    // Build per printer so each ticket's header names its own station.
    printerName: printer.name,
    createdAt: order.createdAt,
    orderType: order.type as 'dine_in' | 'takeaway',
    tableName: resolveTableName(db, order),
    deliveryPartnerTitle: getDeliveryPartnerTitle(db, order),
    deliveryExternalRef: order.deliveryExternalRef ?? undefined,
    orderNotes: order.notes,
    createdByName: resolveCreatedByName(db, order),
    totalHalalas: order.totalHalalas,
    items: ticketItems,
  });
}

/**
 * Build a kitchen delta ticket buffer (specific items with specific printed
 * quantities) for ONE printer — the printKitchenDeltas send-to-kitchen path.
 * Notes and unit prices are loaded fresh from `order_items` for each delta.
 * Throws `Error` when the order does not exist.
 */
export function buildKitchenDeltaTicketBuffer(
  db: PrintDocumentsDb,
  orderId: number,
  printer: PrintDocumentPrinter,
  deltas: Array<{ orderItemId: number; printedQty: number; itemName: string }>,
): Buffer {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new Error(`Order ${orderId} not found`);

  // Load notes + unit price for each delta's order item.
  const oiById = new Map<number, { notes: string | null; unitPriceHalalas: number }>();
  for (const d of deltas) {
    if (oiById.has(d.orderItemId)) continue;
    const oi = db.select().from(orderItems).where(eq(orderItems.id, d.orderItemId)).get();
    oiById.set(d.orderItemId, {
      notes: oi?.notes ?? null,
      unitPriceHalalas: oi?.unitPriceHalalas ?? 0,
    });
  }

  const ticketItems: KitchenTicketItem[] = deltas.map((d) => {
    const oi = oiById.get(d.orderItemId);
    const unit = oi?.unitPriceHalalas ?? 0;
    return {
      qty: d.printedQty,
      name: d.itemName,
      notes: oi?.notes ?? null,
      unitPriceHalalas: unit,
      totalHalalas: unit * d.printedQty,
    };
  });

  // Prefer the ZATCA document id; fall back to the internal reference as
  // last resort (same pattern as receipts).
  const documentId = order.documentId?.length ? order.documentId : `Order-${order.orderNo}`;

  return kitchenTicketBuilder.build({
    documentId,
    // Build per printer so each ticket's header names its own station.
    printerName: printer.name,
    createdAt: order.createdAt,
    orderType: order.type as 'dine_in' | 'takeaway',
    tableName: resolveTableName(db, order),
    deliveryPartnerTitle: getDeliveryPartnerTitle(db, order),
    deliveryExternalRef: order.deliveryExternalRef ?? undefined,
    orderNotes: order.notes,
    createdByName: resolveCreatedByName(db, order),
    totalHalalas: order.totalHalalas,
    items: ticketItems,
  });
}

// ── Test ticket ──────────────────────────────────────────────────────────────

/**
 * Build a printer diagnostic test ticket buffer — no DB access. Passes the
 * printer's name/ip/port and parsed config into TestTicketBuilder.
 */
export function buildTestTicketBuffer(
  printer: PrintDocumentPrinter,
  opts?: { printedAt?: number },
): Buffer {
  return new TestTicketBuilder().build({
    printerName: printer.name,
    ip: printer.ip,
    port: printer.port,
    printedAt: opts?.printedAt,
    config: safeParsePrinterConfig(printer.config),
  });
}

// ── Shared private helpers ───────────────────────────────────────────────────

/** Read a single `settings` row (settings.key → value) with a fallback. */
function getSetting(db: PrintDocumentsDb, key: string, defaultValue = ''): string {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? defaultValue;
}

/**
 * Batch-load items.name_ar for order items without a name_ar snapshot.
 * Returns a map of itemId → Arabic name (null when the menu item has none).
 */
function loadItemNameArFallback(
  db: PrintDocumentsDb,
  itemIds: number[],
): Map<number, string | null> {
  const result = new Map<number, string | null>();
  if (itemIds.length === 0) return result;
  const rows = db
    .select({ id: items.id, nameAr: items.nameAr })
    .from(items)
    .where(inArray(items.id, itemIds))
    .all();
  for (const row of rows) result.set(row.id, row.nameAr);
  return result;
}

/**
 * Map order_items rows to receipt item lines with the Arabic name fallback
 * for historical rows that predate the snapshot (batch-loads items.name_ar
 * once for order items that have item_id set).
 */
function buildReceiptItemsFromOrderItems(
  db: PrintDocumentsDb,
  oiRows: (typeof orderItems.$inferSelect)[],
): ReceiptItem[] {
  const nameArFallback = loadItemNameArFallback(
    db,
    oiRows.filter((oi) => !oi.itemNameAr && oi.itemId != null).map((oi) => oi.itemId as number),
  );
  return oiRows.map((oi) => ({
    qty: oi.qty,
    name: oi.itemName,
    nameAr: oi.itemNameAr ?? (oi.itemId != null ? (nameArFallback.get(oi.itemId) ?? null) : null),
    unitPriceHalalas: oi.unitPriceHalalas,
    totalHalalas: oi.totalHalalas,
    vatRateBp: oi.vatRateBp,
  }));
}

/**
 * VAT rate in basis points when every line shares the same rate (so the
 * receipt can show "VAT (15.0%)"), otherwise undefined ("VAT" only).
 */
function sharedVatRateBp(rateBps: number[]): number | undefined {
  if (rateBps.length === 0) return undefined;
  const first = rateBps[0];
  return rateBps.every((r) => r === first) ? first : undefined;
}

/**
 * Resolve the display name of the user who created an order (users.name) so
 * kitchen tickets can print "Created By: <name>". Display name only — never
 * username, id, or role. Returns undefined when the order has no creator or
 * the user row is missing/blank.
 */
function resolveCreatedByName(db: PrintDocumentsDb, order: OrderRow): string | undefined {
  if (order.createdBy == null) return undefined;
  const user = db.select().from(users).where(eq(users.id, order.createdBy)).get();
  const name = user?.name?.trim();
  return name ? name : undefined;
}

/**
 * Resolve the delivery partner title for an order row (ADR 0007), or
 * undefined when the order has no partner. Print paths load raw order rows
 * directly (no joined partner title), so the title is joined here.
 */
function getDeliveryPartnerTitle(db: PrintDocumentsDb, order: OrderRow): string | undefined {
  if (!order.deliveryPartnerId) return undefined;
  const partner = db
    .select({ title: deliveryPartners.title })
    .from(deliveryPartners)
    .where(eq(deliveryPartners.id, order.deliveryPartnerId))
    .get();
  return partner?.title ?? undefined;
}

/** Resolve the table name for an order row, or undefined when unset. */
function resolveTableName(db: PrintDocumentsDb, order: OrderRow): string | undefined {
  let tableName: string | undefined;
  if (order.tableId != null) {
    const tbl = db.select().from(tables).where(eq(tables.id, order.tableId)).get();
    tableName = tbl?.name;
  }
  return tableName;
}
