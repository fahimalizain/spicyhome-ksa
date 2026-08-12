import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { itemCategories, items, orders } from '@spicyhome/db';
import { PrinterRole } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { PrintersService, PrinterRecord } from './printers.service';
import { PrinterUnreachableError } from './printer-transport';
import {
  buildCreditNoteBuffer,
  buildKitchenDeltaTicketBuffer,
  buildKitchenTicketBuffer,
  buildOpenOrderReceiptBuffer,
  buildSimplifiedInvoiceBuffer,
  buildTestTicketBuffer,
} from './print-documents';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

@Injectable()
export class PrintJobService {
  private readonly logger = new Logger(PrintJobService.name);

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private printersService: PrintersService,
  ) {}

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
    const receiptPrinter = this.printersService.getActiveByRole(PrinterRole.RECEIPT);
    if (!receiptPrinter) {
      throw new Error('No active receipt printer configured');
    }
    const receipt = buildSimplifiedInvoiceBuffer(this.db, orderId, receiptPrinter, opts);
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
    const receiptPrinter = this.printersService.getActiveByRole(PrinterRole.RECEIPT);
    if (!receiptPrinter) {
      throw new Error('No active receipt printer configured');
    }
    const receipt = buildOpenOrderReceiptBuffer(this.db, orderId, receiptPrinter);
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
    const receiptPrinter = this.printersService.getActiveByRole(PrinterRole.RECEIPT);
    if (!receiptPrinter) {
      throw new Error('No active receipt printer configured');
    }
    const receipt = buildCreditNoteBuffer(this.db, refundId, receiptPrinter, opts);
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

    // TEMPORARY: fan-out targets — every active kitchen printer gets the
    // same full ticket. No kitchen printers → nothing to print.
    const targets = this.printersService.listActiveByRole(PrinterRole.KITCHEN);
    if (targets.length === 0) return { printed: [], errors: [] };

    const printed: PrinterRecord[] = [];
    const errors: string[] = [];

    for (const printer of targets) {
      try {
        // Build per printer so each ticket's header names its own station.
        const ticket = buildKitchenDeltaTicketBuffer(this.db, orderId, printer, deltas);
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

    // TEMPORARY: fan-out targets — every active kitchen printer gets the
    // same full ticket. No kitchen printers → nothing to print.
    const targets = this.printersService.listActiveByRole(PrinterRole.KITCHEN);
    if (targets.length === 0) return { printed: [], errors: [] };

    const printed: PrinterRecord[] = [];
    const errors: string[] = [];

    for (const printer of targets) {
      try {
        // Build per printer so each ticket's header names its own station.
        const ticket = buildKitchenTicketBuffer(this.db, orderId, printer, { orderItemIds });
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
    const buf = buildTestTicketBuffer(p);
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
}
