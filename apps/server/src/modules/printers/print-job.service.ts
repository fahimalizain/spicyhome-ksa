import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  orders,
  orderItems,
  orderRefunds,
  orderRefundItems,
  items,
  itemCategories,
  tables,
} from '@spicyhome/db';
import { PrinterRole } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { PrintersService, PrinterRecord } from './printers.service';
import { PrinterUnreachableError } from './printer-transport';
import { ReceiptBuilder, ReceiptItem } from './receipt-builder';
import { KitchenTicketBuilder, KitchenTicketItem } from './kitchen-ticket-builder';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

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
   * Print a receipt for an order. Does NOT write audit events — the caller handles that.
   * Returns the printer used or throws on failure.
   */
  async printReceipt(
    orderId: number,
    opts?: { kickDrawer?: boolean },
  ): Promise<{ printer: PrinterRecord }> {
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    const oiRows = this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();

    const receiptPrinter = this.printersService.getActiveByRole(PrinterRole.RECEIPT);
    if (!receiptPrinter) {
      throw new Error('No active receipt printer configured');
    }

    const restaurantName = this.printersService.getSetting('restaurant_name', 'SpicyHome');
    const vatNumber = this.printersService.getSetting('vat_number', '');

    let tableName: string | undefined;
    if (order.tableId) {
      const tbl = this.db.select().from(tables).where(eq(tables.id, order.tableId)).get() as any;
      tableName = tbl?.name;
    }

    const receiptItems: ReceiptItem[] = oiRows.map((oi) => ({
      qty: oi.qty,
      name: oi.itemName,
      totalHalalas: oi.totalHalalas,
    }));

    const receipt = this.receiptBuilder.build({
      restaurantName,
      vatNumber,
      orderNo: order.orderNo,
      createdAt: order.createdAt,
      orderType: order.type as 'dine_in' | 'takeaway',
      tableName,
      items: receiptItems,
      subtotalHalalas: order.subtotalHalalas,
      vatHalalas: order.vatHalalas,
      totalHalalas: order.totalHalalas,
      kickDrawer: opts?.kickDrawer ?? false,
    });

    await this.printersService.sendBuffer(receiptPrinter, receipt);
    return { printer: receiptPrinter };
  }

  /**
   * Print a refund receipt for a specific refund record.
   * Throws if no active receipt printer is configured.
   */
  async printRefundReceipt(refundId: number): Promise<{ printer: PrinterRecord }> {
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

    const restaurantName = this.printersService.getSetting('restaurant_name', 'SpicyHome');
    const vatNumber = this.printersService.getSetting('vat_number', '');

    let tableName: string | undefined;
    if (order.tableId) {
      const tbl = this.db.select().from(tables).where(eq(tables.id, order.tableId)).get() as any;
      tableName = tbl?.name;
    }

    const receiptItems: ReceiptItem[] = rifRows.map((ri) => ({
      qty: ri.qty,
      name: ri.itemName,
      totalHalalas: ri.totalHalalas,
    }));

    const receipt = this.receiptBuilder.build({
      title: 'REFUND',
      restaurantName,
      vatNumber,
      orderNo: order.orderNo,
      createdAt: refund.createdAt,
      orderType: order.type as 'dine_in' | 'takeaway',
      tableName,
      items: receiptItems,
      subtotalHalalas: refund.subtotalHalalas,
      vatHalalas: refund.vatHalalas,
      totalHalalas: refund.totalHalalas,
      footer: `Refund processed — Original order #: ${order.orderNo}`,
    });

    await this.printersService.sendBuffer(receiptPrinter, receipt);
    return { printer: receiptPrinter };
  }

  /**
   * Print kitchen deltas (specific items with specific quantities) to the correct kitchen printer.
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

    // Group deltas by printer
    const printerGroups = new Map<
      number,
      {
        printer: PrinterRecord;
        items: Array<{
          orderItemId: number;
          printedQty: number;
          itemName: string;
          notes?: string | null;
        }>;
      }
    >();

    for (const d of deltas) {
      // Resolve printer by looking up the order item's source item
      const oi = this.db.select().from(orderItems).where(eq(orderItems.id, d.orderItemId)).get();

      let printer: PrinterRecord | null = null;
      if (oi?.itemId) {
        printer = this.getKitchenPrinterForItem(oi.itemId);
      }
      if (!printer) {
        printer = this.printersService.getActiveByRole(PrinterRole.KITCHEN);
      }

      if (!printer) {
        // No kitchen printer at all, skip
        continue;
      }

      let group = printerGroups.get(printer.id);
      if (!group) {
        group = { printer, items: [] };
        printerGroups.set(printer.id, group);
      }
      group.items.push({ ...d, notes: oi?.notes });
    }

    const printed: PrinterRecord[] = [];
    const errors: string[] = [];

    for (const [, group] of printerGroups) {
      const ticketItems: KitchenTicketItem[] = group.items.map((d) => ({
        qty: d.printedQty,
        name: d.itemName,
        notes: d.notes,
      }));

      const ticket = this.kitchenTicketBuilder.build({
        orderNo: order.orderNo,
        createdAt: order.createdAt,
        orderType: order.type as 'dine_in' | 'takeaway',
        tableName,
        items: ticketItems,
      });

      try {
        await this.printersService.sendBuffer(group.printer, ticket);
        printed.push(group.printer);
      } catch (err: any) {
        const msg = err instanceof PrinterUnreachableError ? err.message : err.message;
        errors.push(`${group.printer.name}: ${msg}`);
        this.logger.error(`Failed printing kitchen ticket to ${group.printer.name}: ${msg}`);
      }
    }

    return { printed, errors };
  }

  /**
   * Print full kitchen tickets for an order (all items or filtered by orderItemIds).
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

    // Group items by kitchen printer
    const printerGroups = new Map<
      number,
      {
        printer: PrinterRecord;
        items: Array<{ qty: number; name: string; notes?: string | null }>;
      }
    >();

    for (const oi of oiRows) {
      let printer: PrinterRecord | null = null;
      if (oi.itemId) {
        printer = this.getKitchenPrinterForItem(oi.itemId);
      }
      if (!printer) {
        printer = this.printersService.getActiveByRole(PrinterRole.KITCHEN);
      }
      if (!printer) continue;

      let group = printerGroups.get(printer.id);
      if (!group) {
        group = { printer, items: [] };
        printerGroups.set(printer.id, group);
      }
      group.items.push({ qty: oi.qty, name: oi.itemName, notes: oi.notes });
    }

    const printed: PrinterRecord[] = [];
    const errors: string[] = [];

    for (const [, group] of printerGroups) {
      const ticketItems: KitchenTicketItem[] = group.items.map((i) => ({
        qty: i.qty,
        name: i.name,
        notes: i.notes,
      }));

      const ticket = this.kitchenTicketBuilder.build({
        orderNo: order.orderNo,
        createdAt: order.createdAt,
        orderType: order.type as 'dine_in' | 'takeaway',
        tableName,
        items: ticketItems,
      });

      try {
        await this.printersService.sendBuffer(group.printer, ticket);
        printed.push(group.printer);
      } catch (err: any) {
        const msg = err instanceof PrinterUnreachableError ? err.message : err.message;
        errors.push(`${group.printer.name}: ${msg}`);
        this.logger.error(`Failed printing kitchen ticket to ${group.printer.name}: ${msg}`);
      }
    }

    return { printed, errors };
  }

  // ── Test ticket ──────────────────────────────────────────────────────────────

  async printTestTicket(printerId: number): Promise<void> {
    const p = this.printersService.get(printerId);
    const { EscPosBuilder } = await import('./esc-pos-builder');
    const eb = new EscPosBuilder();
    eb.init();
    eb.align(1);
    eb.text('TEST TICKET');
    eb.text(`Printer: ${p.name}`);
    eb.text(`IP: ${p.ip}:${p.port}`);
    eb.text(new Date().toISOString());
    eb.feed(3);
    eb.cut(1);
    await this.printersService.sendBuffer(p, eb.getBuffer());
  }
}
