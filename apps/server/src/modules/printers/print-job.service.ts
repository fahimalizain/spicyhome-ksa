import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { orders, orderItems, items, itemCategories, tables } from '@spicyhome/db';
import { PrinterRole } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { PrintersService, PrinterRecord } from './printers.service';
import { PrinterUnreachableError } from './printer-transport';
import { ReceiptBuilder, ReceiptItem } from './receipt-builder';
import { KitchenTicketBuilder, KitchenTicketItem } from './kitchen-ticket-builder';
import { AuditLogService } from '../orders/audit-log.service';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

export const ORDER_PRINT_EVENT = 'order.print';

@Injectable()
export class PrintJobService {
  private readonly logger = new Logger(PrintJobService.name);
  private readonly auditLog: AuditLogService;
  private readonly receiptBuilder: ReceiptBuilder;
  private readonly kitchenTicketBuilder: KitchenTicketBuilder;

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private printersService: PrintersService,
  ) {
    this.auditLog = new AuditLogService();
    this.receiptBuilder = new ReceiptBuilder();
    this.kitchenTicketBuilder = new KitchenTicketBuilder();
  }

  // ── Event listeners ──────────────────────────────────────────────────────────

  @OnEvent('order.sent')
  async onOrderSent(payload: { orderId: number; userId: number }) {
    try {
      await this.printKitchenTickets(payload.orderId, payload.userId);
    } catch (err: any) {
      this.logger.error(`Kitchen print failed for order ${payload.orderId}: ${err.message}`);
    }
  }

  @OnEvent('order.paid')
  async onOrderPaid(payload: { orderId: number; userId: number }) {
    try {
      await this.printReceipt(payload.orderId, payload.userId, { kickDrawer: true });
    } catch (err: any) {
      this.logger.error(`Receipt print failed for order ${payload.orderId}: ${err.message}`);
    }
  }

  @OnEvent(ORDER_PRINT_EVENT)
  async onReprintRequest(payload: { orderId: number; target: string; userId: number }) {
    try {
      if (payload.target === 'kitchen') {
        await this.printKitchenTickets(payload.orderId, payload.userId);
      } else {
        await this.printReceipt(payload.orderId, payload.userId);
      }
    } catch (err: any) {
      this.logger.error(`Reprint failed for order ${payload.orderId}: ${err.message}`);
      throw err;
    }
  }

  // ── Public methods ───────────────────────────────────────────────────────────

  async reprintOrder(
    orderId: number,
    target: string,
    userId: number,
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    try {
      if (target === 'kitchen') {
        const r = await this.printKitchenTicketsInternal(orderId, userId);
        errors.push(...r.errors);
      } else {
        await this.printReceipt(orderId, userId);
      }
    } catch (err: any) {
      errors.push(err.message);
    }
    return { success: errors.length === 0, errors };
  }

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

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private async printKitchenTickets(orderId: number, userId: number): Promise<void> {
    const results = await this.printKitchenTicketsInternal(orderId, userId);
    if (results.errors.length > 0) {
      this.logger.warn(`Kitchen print for order ${orderId} errors: ${results.errors.join('; ')}`);
    }
  }

  private async printKitchenTicketsInternal(
    orderId: number,
    userId: number,
  ): Promise<{ printed: PrinterRecord[]; errors: string[] }> {
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    const oiRows = this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
    const now = Math.floor(Date.now() / 1000);

    // Cache of itemId → category printer_id
    const catPrinterCache = new Map<number, number | null>();

    for (const oi of oiRows) {
      if (!oi.itemId || catPrinterCache.has(oi.itemId)) continue;

      const sourceItem = this.db.select().from(items).where(eq(items.id, oi.itemId)).get();
      if (sourceItem) {
        const catId = (sourceItem as any).categoryId;
        const cat = this.db
          .select()
          .from(itemCategories)
          .where(eq(itemCategories.id, catId))
          .get() as any;
        catPrinterCache.set(oi.itemId, cat?.printerId ?? null);
      } else {
        catPrinterCache.set(oi.itemId, null);
      }
    }

    // Group items by printer_id (null → default kitchen)
    const routing = new Map<number | string, typeof oiRows>();
    for (const oi of oiRows) {
      const pid = oi.itemId ? (catPrinterCache.get(oi.itemId) ?? null) : null;
      const key = pid ?? '__default__';
      const group = routing.get(key) || [];
      group.push(oi);
      routing.set(key, group);
    }

    // Get table name
    let tableName: string | undefined;
    if (order.tableId) {
      const tbl = this.db.select().from(tables).where(eq(tables.id, order.tableId)).get() as any;
      tableName = tbl?.name;
    }

    const printed: PrinterRecord[] = [];
    const errors: string[] = [];

    for (const [key, grp] of routing.entries()) {
      const printer =
        key === '__default__'
          ? this.printersService.getActiveByRole(PrinterRole.KITCHEN)
          : this.printersService.getByPrinterId(Number(key));

      if (!printer) {
        errors.push(
          `No active kitchen printer for ${key === '__default__' ? 'default routing' : `printer ${key}`}, ${grp.length} items skipped`,
        );
        continue;
      }

      const ticketItems: KitchenTicketItem[] = grp.map((oi) => ({
        qty: oi.qty,
        name: oi.itemName,
        notes: oi.notes,
      }));

      const ticket = this.kitchenTicketBuilder.build({
        orderNo: order.orderNo,
        createdAt: order.createdAt,
        orderType: order.type as 'dine_in' | 'takeaway',
        tableName,
        items: ticketItems,
      });

      try {
        await this.printersService.sendBuffer(printer, ticket);
        printed.push(printer);

        this.auditLog.createEntry(
          this.db,
          orderId,
          userId,
          'printed',
          {
            target: 'kitchen',
            printer: printer.name,
          },
          now,
        );
      } catch (err: any) {
        const msg = err instanceof PrinterUnreachableError ? err.message : err.message;
        errors.push(`${printer.name}: ${msg}`);
        this.logger.error(`Failed printing kitchen ticket to ${printer.name}: ${msg}`);
      }
    }

    return { printed, errors };
  }

  private async printReceipt(
    orderId: number,
    userId: number,
    opts?: { kickDrawer?: boolean },
  ): Promise<void> {
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

    const now = Math.floor(Date.now() / 1000);

    await this.printersService.sendBuffer(receiptPrinter, receipt);

    this.auditLog.createEntry(
      this.db,
      orderId,
      userId,
      'printed',
      {
        target: 'receipt',
        printer: receiptPrinter.name,
      },
      now,
    );
  }
}
