import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, desc, inArray } from 'drizzle-orm';
import {
  orders,
  orderItems,
  orderPayments,
  orderRefunds,
  orderRefundItems,
  items,
  itemCategories,
  tables,
  zatcaInvoices,
  zatcaCreditNotes,
  deliveryPartners,
} from '@spicyhome/db';
import { PrinterRole, safeParsePrinterConfig } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { PrintersService, PrinterRecord } from './printers.service';
import { PrinterUnreachableError } from './printer-transport';
import { ReceiptBuilder, ReceiptItem } from './receipt-builder';
import { KitchenTicketBuilder, KitchenTicketItem } from './kitchen-ticket-builder';
import { TestTicketBuilder } from './test-ticket-builder';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

/**
 * ZATCA statuses for which a signed QR payload is available.
 * - simplified: signed (fresh), reported (reporting success), failed (reporting failure; QR still valid)
 * - standard:   cleared (clearance success)
 *
 * Must NOT use QR from: pending, rejected, error (standard in-flight/failure).
 */
const PRINTABLE_QR_STATUSES = ['cleared', 'signed', 'reported', 'failed'] as const;

@Injectable()
export class PrintJobService {
  private readonly logger = new Logger(PrintJobService.name);
  private readonly receiptBuilder: ReceiptBuilder;
  private readonly kitchenTicketBuilder: KitchenTicketBuilder;

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private printersService: PrintersService,
  ) {
    this.receiptBuilder = new ReceiptBuilder();
    this.kitchenTicketBuilder = new KitchenTicketBuilder();
  }

  // ── Public helpers (called from OrdersService) ───────────────────────────────

  /** Return the active receipt printer, or null if none. */
  getReceiptPrinter(): PrinterRecord | null {
    return this.printersService.getActiveByRole(PrinterRole.RECEIPT);
  }

  /**
   * Return the kitchen printer for a given menu item.
   * Uses the item's category printer if configured and active, otherwise the default kitchen printer.
   *
   * TEMPORARY: category routing is currently unused — all active kitchen
   * printers receive the full ticket (fan-out) instead. Kept implemented for
   * a fast revert; do NOT call from active print paths.
   */
  getKitchenPrinterForItem(itemId: number): PrinterRecord | null {
    const item = this.db.select().from(items).where(eq(items.id, itemId)).get();
    if (!item) return null;

    const cat = this.db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.id, item.categoryId))
      .get();

    if (cat?.printerId) {
      const p = this.printersService.getByPrinterId(cat.printerId);
      if (p) return p;
    }

    // Fallback to default kitchen printer
    return this.printersService.getActiveByRole(PrinterRole.KITCHEN);
  }

  /**
   * TEMPORARY: list all active kitchen printers (fan-out targets).
   * Every send-to-kitchen prints the full ticket to each of them.
   */
  listActiveKitchenPrinters(): PrinterRecord[] {
    return this.printersService.listActiveByRole(PrinterRole.KITCHEN);
  }

  /**
   * Print a receipt for an order. Does NOT write audit events — the caller handles that.
   * Returns the printer used or throws on failure.
   */
  async printReceipt(
    orderId: number,
    opts?: { kickDrawer?: boolean; qrTlvPayload?: string },
  ): Promise<{ printer: PrinterRecord }> {
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    const oiRows = this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();

    const receiptPrinter = this.printersService.getActiveByRole(PrinterRole.RECEIPT);
    if (!receiptPrinter) {
      throw new Error('No active receipt printer configured');
    }

    // Seller block — same settings keys as the ZATCA XML.
    const sellerName = this.printersService.getSetting('seller_name', 'SpicyHome');
    const vatNumber = this.printersService.getSetting('vat_number', '');
    const sellerStreet = this.printersService.getSetting('seller_street', '');
    const sellerBuilding = this.printersService.getSetting('seller_building', '');
    const sellerCity = this.printersService.getSetting('seller_city', 'Riyadh');
    const sellerPostal = this.printersService.getSetting('seller_postal', '');
    const sellerCountry = this.printersService.getSetting('seller_country', 'SA');

    let tableName: string | undefined;
    if (order.tableId) {
      const tbl = this.db.select().from(tables).where(eq(tables.id, order.tableId)).get() as any;
      tableName = tbl?.name;
    }

    // Arabic name fallback for historical rows that predate the snapshot:
    // batch-load items.name_ar once for order items that have item_id set.
    const nameArFallback = this.loadItemNameArFallback(
      oiRows.filter((oi) => !oi.itemNameAr && oi.itemId != null).map((oi) => oi.itemId as number),
    );

    const receiptItems: ReceiptItem[] = oiRows.map((oi) => ({
      qty: oi.qty,
      name: oi.itemName,
      nameAr: oi.itemNameAr ?? (oi.itemId != null ? (nameArFallback.get(oi.itemId) ?? null) : null),
      unitPriceHalalas: oi.unitPriceHalalas,
      totalHalalas: oi.totalHalalas,
      vatRateBp: oi.vatRateBp,
    }));

    // Load QR from a printable zatca_invoices row if not provided by caller.
    // Printable statuses:
    //   simplified: signed | reported | failed (signing already done; QR is valid)
    //   standard:   cleared (clearance success)
    // Must NOT use QR from: pending, rejected, error (standard in-flight/failure).
    let qrTlvPayload = opts?.qrTlvPayload ?? undefined;
    if (!qrTlvPayload) {
      const printable = this.db
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

    const receipt = this.receiptBuilder.build({
      documentKind: 'simplified_invoice',
      // Prefer the ZATCA IRN; fall back to the internal reference as last resort.
      documentId: order.documentId?.length ? order.documentId : `Order-${order.orderNo}`,
      orderNo: order.orderNo,
      createdAt: order.createdAt,
      sellerName,
      vatNumber,
      sellerStreet,
      sellerBuilding,
      sellerCity,
      sellerPostal,
      sellerCountry,
      orderType: order.type as 'dine_in' | 'takeaway',
      tableName,
      deliveryPartnerTitle: this.getDeliveryPartnerTitle(order),
      deliveryExternalRef: order.deliveryExternalRef ?? undefined,
      items: receiptItems,
      subtotalHalalas: order.subtotalHalalas,
      vatHalalas: order.vatHalalas,
      totalHalalas: order.totalHalalas,
      vatRateBp: this.sharedVatRateBp(oiRows.map((oi) => oi.vatRateBp)),
      arabic: safeParsePrinterConfig(receiptPrinter.config).arabic,
      kickDrawer: opts?.kickDrawer ?? false,
      qrTlvPayload,
    });

    await this.printersService.sendBuffer(receiptPrinter, receipt);
    return { printer: receiptPrinter };
  }

  /**
   * Print a non-ZATCA open order receipt (guest pays at the table with a
   * portable ATM-POS). Title is "OPEN ORDER RECEIPT" — deliberately NOT a tax
   * invoice: no QR, no VAT registration number, no seller address, no drawer
   * kick. The display name comes from the `restaurant_name` setting (not the
   * ZATCA `seller_name`). Does NOT write audit events — the caller handles that.
   */
  async printOpenOrderReceipt(orderId: number): Promise<{ printer: PrinterRecord }> {
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    const oiRows = this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();

    const receiptPrinter = this.printersService.getActiveByRole(PrinterRole.RECEIPT);
    if (!receiptPrinter) {
      throw new Error('No active receipt printer configured');
    }

    // Restaurant display name — NOT the ZATCA legal seller name.
    const restaurantName = this.printersService.getSetting('restaurant_name', 'SpicyHome');

    let tableName: string | undefined;
    if (order.tableId) {
      const tbl = this.db.select().from(tables).where(eq(tables.id, order.tableId)).get() as any;
      tableName = tbl?.name;
    }

    // Arabic name fallback for historical rows that predate the snapshot:
    // batch-load items.name_ar once for order items that have item_id set.
    const nameArFallback = this.loadItemNameArFallback(
      oiRows.filter((oi) => !oi.itemNameAr && oi.itemId != null).map((oi) => oi.itemId as number),
    );

    const receiptItems: ReceiptItem[] = oiRows.map((oi) => ({
      qty: oi.qty,
      name: oi.itemName,
      nameAr: oi.itemNameAr ?? (oi.itemId != null ? (nameArFallback.get(oi.itemId) ?? null) : null),
      unitPriceHalalas: oi.unitPriceHalalas,
      totalHalalas: oi.totalHalalas,
      vatRateBp: oi.vatRateBp,
    }));

    // Net payments already recorded on the order (ADR 0006 — payment before
    // food). The ledger is signed: correction lines are negative, so the
    // reduce gives the true net paid amount.
    const paymentRows = this.db
      .select({ amountHalalas: orderPayments.amountHalalas })
      .from(orderPayments)
      .where(eq(orderPayments.orderId, orderId))
      .all();
    const paidHalalas = paymentRows.reduce((s, r) => s + r.amountHalalas, 0);

    const receipt = this.receiptBuilder.build({
      documentKind: 'open_order',
      // Not printed for open_order — kept in the type for ZATCA documents.
      documentId: order.documentId?.length ? order.documentId : `Order-${order.orderNo}`,
      orderNo: order.orderNo,
      createdAt: order.createdAt,
      sellerName: restaurantName,
      vatNumber: '',
      orderType: order.type as 'dine_in' | 'takeaway',
      tableName,
      deliveryPartnerTitle: this.getDeliveryPartnerTitle(order),
      deliveryExternalRef: order.deliveryExternalRef ?? undefined,
      items: receiptItems,
      subtotalHalalas: order.subtotalHalalas,
      vatHalalas: order.vatHalalas,
      totalHalalas: order.totalHalalas,
      paidHalalas,
      vatRateBp: this.sharedVatRateBp(oiRows.map((oi) => oi.vatRateBp)),
      arabic: safeParsePrinterConfig(receiptPrinter.config).arabic,
      kickDrawer: false,
      // No QR — open order receipts are not tax invoices.
    });

    await this.printersService.sendBuffer(receiptPrinter, receipt);
    return { printer: receiptPrinter };
  }

  /**
   * Print a refund receipt for a specific refund record.
   * Throws if no active receipt printer is configured.
   */
  async printRefundReceipt(
    refundId: number,
    opts?: { kickDrawer?: boolean; qrTlvPayload?: string },
  ): Promise<{ printer: PrinterRecord }> {
    const refund = this.db.select().from(orderRefunds).where(eq(orderRefunds.id, refundId)).get();
    if (!refund) throw new Error(`Refund ${refundId} not found`);

    const rifRows = this.db
      .select()
      .from(orderRefundItems)
      .where(eq(orderRefundItems.refundId, refundId))
      .all();

    const order = this.db.select().from(orders).where(eq(orders.id, refund.orderId)).get();
    if (!order) throw new Error(`Order ${refund.orderId} not found`);

    const receiptPrinter = this.printersService.getActiveByRole(PrinterRole.RECEIPT);
    if (!receiptPrinter) {
      throw new Error('No active receipt printer configured');
    }

    // Seller block — same settings keys as the ZATCA XML.
    const sellerName = this.printersService.getSetting('seller_name', 'SpicyHome');
    const vatNumber = this.printersService.getSetting('vat_number', '');
    const sellerStreet = this.printersService.getSetting('seller_street', '');
    const sellerBuilding = this.printersService.getSetting('seller_building', '');
    const sellerCity = this.printersService.getSetting('seller_city', 'Riyadh');
    const sellerPostal = this.printersService.getSetting('seller_postal', '');
    const sellerCountry = this.printersService.getSetting('seller_country', 'SA');

    let tableName: string | undefined;
    if (order.tableId) {
      const tbl = this.db.select().from(tables).where(eq(tables.id, order.tableId)).get() as any;
      tableName = tbl?.name;
    }

    // Arabic name fallback: refund rows predating the snapshot fall back to
    // the snapshotted order_items.item_name_ar via order_item_id.
    const missingOrderItemIds = rifRows
      .filter((ri) => !ri.itemNameAr && ri.orderItemId != null)
      .map((ri) => ri.orderItemId as number);
    const oiNameArFallback = new Map<number, string | null>();
    if (missingOrderItemIds.length > 0) {
      const oiRows = this.db
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
      const printableCn = this.db
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

    const receipt = this.receiptBuilder.build({
      documentKind: 'credit_note',
      documentId: refund.documentId?.length ? refund.documentId : `Refund-${refund.id}`,
      originalDocumentId: order.documentId?.length ? order.documentId : undefined,
      reason: refund.reason ?? undefined,
      orderNo: order.orderNo,
      createdAt: refund.createdAt,
      sellerName,
      vatNumber,
      sellerStreet,
      sellerBuilding,
      sellerCity,
      sellerPostal,
      sellerCountry,
      orderType: order.type as 'dine_in' | 'takeaway',
      tableName,
      deliveryPartnerTitle: this.getDeliveryPartnerTitle(order),
      deliveryExternalRef: order.deliveryExternalRef ?? undefined,
      items: receiptItems,
      subtotalHalalas: refund.subtotalHalalas,
      vatHalalas: refund.vatHalalas,
      totalHalalas: refund.totalHalalas,
      vatRateBp: this.sharedVatRateBp(rifRows.map((ri) => ri.vatRateBp)),
      arabic: safeParsePrinterConfig(receiptPrinter.config).arabic,
      kickDrawer: opts?.kickDrawer ?? false,
      qrTlvPayload,
    });

    await this.printersService.sendBuffer(receiptPrinter, receipt);
    return { printer: receiptPrinter };
  }

  /**
   * Print kitchen deltas (specific items with specific quantities) to ALL
   * active kitchen printers.
   *
   * TEMPORARY: fan-out to every active kitchen printer — one full ticket
   * (built from ALL deltas, notes included) is sent to each target.
   * Category routing (`getKitchenPrinterForItem`) is left in place but unused.
   * Does NOT write audit events — the caller handles that.
   */
  async printKitchenDeltas(
    orderId: number,
    deltas: Array<{ orderItemId: number; printedQty: number; itemName: string }>,
  ): Promise<{ printed: PrinterRecord[]; errors: string[] }> {
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    // Get table name
    let tableName: string | undefined;
    if (order.tableId) {
      const tbl = this.db.select().from(tables).where(eq(tables.id, order.tableId)).get() as any;
      tableName = tbl?.name;
    }

    // TEMPORARY: fan-out targets — every active kitchen printer gets the
    // same full ticket. No kitchen printers → nothing to print.
    const targets = this.printersService.listActiveByRole(PrinterRole.KITCHEN);
    if (targets.length === 0) return { printed: [], errors: [] };

    // Load notes for each delta's order item (same as the old per-group path)
    const notesById = new Map<number, string | null>();
    for (const d of deltas) {
      if (notesById.has(d.orderItemId)) continue;
      const oi = this.db.select().from(orderItems).where(eq(orderItems.id, d.orderItemId)).get();
      notesById.set(d.orderItemId, oi?.notes ?? null);
    }

    const ticketItems: KitchenTicketItem[] = deltas.map((d) => ({
      qty: d.printedQty,
      name: d.itemName,
      notes: notesById.get(d.orderItemId) ?? null,
    }));

    const ticket = this.kitchenTicketBuilder.build({
      orderNo: order.orderNo,
      createdAt: order.createdAt,
      orderType: order.type as 'dine_in' | 'takeaway',
      tableName,
      deliveryPartnerTitle: this.getDeliveryPartnerTitle(order),
      deliveryExternalRef: order.deliveryExternalRef ?? undefined,
      items: ticketItems,
    });

    const printed: PrinterRecord[] = [];
    const errors: string[] = [];

    for (const printer of targets) {
      try {
        await this.printersService.sendBuffer(printer, ticket);
        printed.push(printer);
      } catch (err: any) {
        const msg = err instanceof PrinterUnreachableError ? err.message : err.message;
        errors.push(`${printer.name}: ${msg}`);
        this.logger.error(`Failed printing kitchen ticket to ${printer.name}: ${msg}`);
      }
    }

    return { printed, errors };
  }

  /**
   * Print full kitchen tickets for an order (all items or filtered by orderItemIds)
   * to ALL active kitchen printers.
   *
   * TEMPORARY: fan-out to every active kitchen printer — one full ticket is
   * sent to each target (same behavior as printKitchenDeltas, for consistency).
   * Category routing (`getKitchenPrinterForItem`) is left in place but unused.
   * Used for reprints. Does NOT write audit events — the caller handles that.
   */
  async printKitchenTickets(
    orderId: number,
    orderItemIds?: number[],
  ): Promise<{ printed: PrinterRecord[]; errors: string[] }> {
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    let oiRows = this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
    if (orderItemIds && orderItemIds.length > 0) {
      const idSet = new Set(orderItemIds);
      oiRows = oiRows.filter((oi) => idSet.has(oi.id));
    }

    // Get table name
    let tableName: string | undefined;
    if (order.tableId) {
      const tbl = this.db.select().from(tables).where(eq(tables.id, order.tableId)).get() as any;
      tableName = tbl?.name;
    }

    // TEMPORARY: fan-out targets — every active kitchen printer gets the
    // same full ticket. No kitchen printers → nothing to print.
    const targets = this.printersService.listActiveByRole(PrinterRole.KITCHEN);
    if (targets.length === 0) return { printed: [], errors: [] };

    const ticketItems: KitchenTicketItem[] = oiRows.map((oi) => ({
      qty: oi.qty,
      name: oi.itemName,
      notes: oi.notes,
    }));

    const ticket = this.kitchenTicketBuilder.build({
      orderNo: order.orderNo,
      createdAt: order.createdAt,
      orderType: order.type as 'dine_in' | 'takeaway',
      tableName,
      deliveryPartnerTitle: this.getDeliveryPartnerTitle(order),
      deliveryExternalRef: order.deliveryExternalRef ?? undefined,
      items: ticketItems,
    });

    const printed: PrinterRecord[] = [];
    const errors: string[] = [];

    for (const printer of targets) {
      try {
        await this.printersService.sendBuffer(printer, ticket);
        printed.push(printer);
      } catch (err: any) {
        const msg = err instanceof PrinterUnreachableError ? err.message : err.message;
        errors.push(`${printer.name}: ${msg}`);
        this.logger.error(`Failed printing kitchen ticket to ${printer.name}: ${msg}`);
      }
    }

    return { printed, errors };
  }

  // ── Test ticket ──────────────────────────────────────────────────────────────

  async printTestTicket(printerId: number): Promise<void> {
    const p = this.printersService.get(printerId);
    const builder = new TestTicketBuilder();
    const buf = builder.build({
      printerName: p.name,
      ip: p.ip,
      port: p.port,
      // p.config is already parsed by mapPrinterRow via safeParsePrinterConfig
      config: p.config,
    });
    await this.printersService.sendBuffer(p, buf);
  }

  /**
   * Kick the cash drawer without printing a full receipt.
   * Builds a minimal ESC/POS buffer containing only the drawer kick command.
   */
  async kickDrawer(printer?: PrinterRecord): Promise<void> {
    const p = printer ?? this.printersService.getActiveByRole(PrinterRole.RECEIPT);
    if (!p) return;

    const { EscPosBuilder } = require('./esc-pos-builder');
    const eb = new EscPosBuilder();
    eb.cashDrawerKick();
    await this.printersService.sendBuffer(p, eb.getBuffer());
  }

  /**
   * Batch-load items.name_ar for order items without a name_ar snapshot.
   * Returns a map of itemId → Arabic name (null when the menu item has none).
   */
  private loadItemNameArFallback(itemIds: number[]): Map<number, string | null> {
    const result = new Map<number, string | null>();
    if (itemIds.length === 0) return result;
    const rows = this.db
      .select({ id: items.id, nameAr: items.nameAr })
      .from(items)
      .where(inArray(items.id, itemIds))
      .all();
    for (const row of rows) result.set(row.id, row.nameAr);
    return result;
  }

  /**
   * VAT rate in basis points when every line shares the same rate (so the
   * receipt can show "VAT (15.0%)"), otherwise undefined ("VAT" only).
   */
  private sharedVatRateBp(rateBps: number[]): number | undefined {
    if (rateBps.length === 0) return undefined;
    const first = rateBps[0];
    return rateBps.every((r) => r === first) ? first : undefined;
  }

  /**
   * Resolve the delivery partner title for an order row (ADR 0007), or
   * undefined when the order has no partner. Print paths load raw order rows
   * directly (no joined partner title), so the title is joined here.
   */
  private getDeliveryPartnerTitle(order: { deliveryPartnerId: string | null }): string | undefined {
    if (!order.deliveryPartnerId) return undefined;
    const partner = this.db
      .select({ title: deliveryPartners.title })
      .from(deliveryPartners)
      .where(eq(deliveryPartners.id, order.deliveryPartnerId))
      .get();
    return partner?.title ?? undefined;
  }
}
