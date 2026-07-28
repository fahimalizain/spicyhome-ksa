import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  orders,
  orderItems,
  orderRefunds,
  orderRefundItems,
  orderPayments,
  paymentMethods,
  tables,
  dayOpenings,
  settings,
  items,
} from '@spicyhome/db';
import {
  decomposeVat,
  parseZatcaBuyerDetails,
  formatZatcaBuyerDetailsErrors,
} from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import { mapBools } from '../../common/bool-mapper.helper';
import { OrderEventsService } from './order-events.service';
import { PrintJobService } from '../printers/print-job.service';
import { ZatcaBuyerDetailsDto } from './dto/zatca-buyer-details.dto';
import type { PrinterRecord } from '../printers/printers.service';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['paid', 'voided'],
  paid: ['refunded'],
  voided: [],
  refunded: [],
};

function recomputeOrderTotals(rows: Array<{ totalHalalas: number; vatRateBp: number }>): {
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
} {
  let subtotal = 0;
  let vat = 0;
  let total = 0;
  for (const row of rows) {
    const d = decomposeVat(row.totalHalalas, row.vatRateBp);
    subtotal += d.priceExclHalalas;
    vat += d.vatHalalas;
    total += row.totalHalalas;
  }
  return { subtotalHalalas: subtotal, vatHalalas: vat, totalHalalas: total };
}

function todayInRiyadh(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' });
  return fmt.format(new Date());
}

function normalizeNotes(n: string | null | undefined): string | null {
  if (n == null || n === '') return null;
  return n;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private eventEmitter: EventEmitter2,
    private printJobService: PrintJobService,
    private orderEvents: OrderEventsService,
  ) {}

  async createOrder(dto: { type: string; tableId?: number }, userId: number) {
    const now = Math.floor(Date.now() / 1000);

    if (dto.type === 'dine_in') {
      if (!dto.tableId) throw new BadRequestException('Table is required for dine-in orders');
      const table = this.db.select().from(tables).where(eq(tables.id, dto.tableId)).get();
      if (!table || !table.isActive) throw new NotFoundException('Table not found or inactive');
    }

    const dayOpening = this.db
      .select()
      .from(dayOpenings)
      .where(eq(dayOpenings.status, 'open'))
      .get();
    if (!dayOpening)
      throw new ConflictException(
        'No open business day. Open a business day before creating orders.',
      );

    const today = todayInRiyadh();
    if (dayOpening.businessDate !== today) {
      throw new ConflictException(
        `The open business day is from ${dayOpening.businessDate}. Close it before creating orders for today (${today}).`,
      );
    }

    const orderUuid = uuidv4();

    const result: any = await this.db.transaction((tx: any) => {
      // Prevent multiple open orders on the same table
      if (dto.type === 'dine_in' && dto.tableId) {
        const existingOpen = tx
          .select({ id: orders.id, orderNo: orders.orderNo })
          .from(orders)
          .where(and(eq(orders.tableId, dto.tableId), eq(orders.status, 'open')))
          .get();
        if (existingOpen) {
          throw new ConflictException(
            `Table already has an open order #${existingOpen.orderNo} (id ${existingOpen.id}).`,
          );
        }
      }

      const orderNo = this.getNextOrderNo(tx, now);

      const insertResult = tx
        .insert(orders)
        .values({
          orderNo,
          uuid: orderUuid,
          type: dto.type,
          tableId: dto.tableId ?? null,
          dayOpeningId: dayOpening.id,
          status: 'open',
          subtotalHalalas: 0,
          vatHalalas: 0,
          totalHalalas: 0,
          discountHalalas: 0,
          ...createAuditFields(userId, now),
        })
        .run();

      const orderId = Number(insertResult.lastInsertRowid);

      this.orderEvents.createEvent(
        tx,
        orderId,
        userId,
        'created',
        {
          type: dto.type,
          tableId: dto.tableId ?? null,
          orderNo,
          uuid: orderUuid,
        },
        now,
      );

      return { id: orderId, uuid: orderUuid, orderNo };
    });

    this.emitDomainEvent('order.created', result.id, userId);
    return result;
  }

  private emitDomainEvent(
    event: string,
    orderId: number,
    userId: number,
    extra?: Record<string, unknown>,
  ): void {
    try {
      this.eventEmitter.emit(event, { orderId, userId, ...extra });
    } catch {
      // Swallow — domain events never fail the operation
    }
  }

  private getNextOrderNo(tx: any, now: number): number {
    const today = new Date(now * 1000).toISOString().slice(0, 10);

    const row = tx.select().from(settings).where(eq(settings.key, 'daily_order_seq')).get();

    if (!row) {
      tx.insert(settings)
        .values({ key: 'daily_order_seq', value: `${today}:1` })
        .run();
      return 1;
    }

    const [storedDate, storedSeqStr] = row.value.split(':');
    const storedSeq = parseInt(storedSeqStr, 10);

    if (storedDate === today) {
      const newSeq = storedSeq + 1;
      tx.update(settings)
        .set({ value: `${today}:${newSeq}` })
        .where(eq(settings.key, 'daily_order_seq'))
        .run();
      return newSeq;
    } else {
      tx.update(settings)
        .set({ value: `${today}:1` })
        .where(eq(settings.key, 'daily_order_seq'))
        .run();
      return 1;
    }
  }

  async syncItems(
    orderId: number,
    dto: {
      baseUpdatedAt: number;
      items: Array<{
        orderItemId?: number;
        itemId?: number;
        qty: number;
        notes?: string | null | undefined;
      }>;
    },
    userId: number,
  ) {
    const now = Math.floor(Date.now() / 1000);

    // Resolve kitchen printers pre-transaction (read-only, stable data)
    // We'll map itemId → printer for new lines; for existing lines, get from order_items.itemId
    const printerCache = new Map<number, PrinterRecord | null>();
    const getPrinter = (menuItemId: number): PrinterRecord | null => {
      if (!printerCache.has(menuItemId)) {
        printerCache.set(menuItemId, this.printJobService.getKitchenPrinterForItem(menuItemId));
      }
      return printerCache.get(menuItemId) ?? null;
    };

    // Kitchen deltas collected during transaction
    const kitchenDeltasByPrinter = new Map<
      string, // printer name
      {
        printer: PrinterRecord;
        items: Array<{ orderItemId: number; itemName: string; printedQty: number }>;
      }
    >();

    // Track whether any mutation (remove/update/insert) occurred
    let anyMutation = false;

    const updatedOrder = this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'open') throw new BadRequestException('Order is not open');

      // Concurrency check
      if (order.updatedAt !== dto.baseUpdatedAt) {
        throw new ConflictException({
          message: 'Order was modified by another terminal. Please refresh your cart.',
          updatedAt: order.updatedAt,
        });
      }

      const existingItems: Array<any> = tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .all();

      const existingMap = new Map(existingItems.map((oi: any) => [oi.id, oi]));

      // Desired set of orderItemIds (excluding null for new lines)
      const desiredIds = new Set<number>();
      const desiredLines: Array<{
        orderItemId?: number;
        itemId?: number;
        qty: number;
        notes?: string | null;
      }> = dto.items;

      for (const line of desiredLines) {
        if (line.orderItemId != null) {
          desiredIds.add(line.orderItemId);
        }
      }

      // 1. Remove lines not in desired set
      for (const existing of existingItems) {
        if (!desiredIds.has(existing.id)) {
          anyMutation = true;

          tx.delete(orderItems).where(eq(orderItems.id, existing.id)).run();

          this.orderEvents.createEvent(
            tx,
            orderId,
            userId,
            'item_removed',
            {
              orderItemId: existing.id,
              itemName: existing.itemName,
              oldQty: existing.qty,
              oldTotal: existing.totalHalalas,
            },
            now,
          );
        }
      }

      // 2. Process each desired line
      for (const line of desiredLines) {
        if (line.orderItemId != null) {
          // Update existing line
          const oi = existingMap.get(line.orderItemId);
          if (!oi || oi.orderId !== orderId) {
            throw new NotFoundException(
              `Order item ${line.orderItemId} not found on order ${orderId}`,
            );
          }

          const oldQty = oi.qty;
          const oldTotal = oi.totalHalalas;

          // Compute desired notes
          const desiredNotes = line.notes !== undefined ? normalizeNotes(line.notes) : oi.notes;
          const qtyChanged = line.qty !== oi.qty;
          const notesChanged = normalizeNotes(desiredNotes) !== normalizeNotes(oi.notes);

          // Skip no-op lines — nothing changed
          if (!qtyChanged && !notesChanged) {
            continue;
          }

          anyMutation = true;

          const updates: Record<string, any> = { ...updateAuditFields(userId, now) };
          const newQty = line.qty;
          const newTotal = oi.unitPriceHalalas * line.qty;
          updates.qty = newQty;
          updates.totalHalalas = newTotal;

          if (line.notes !== undefined) {
            updates.notes = desiredNotes;
          }

          tx.update(orderItems).set(updates).where(eq(orderItems.id, line.orderItemId)).run();

          // Kitchen delta: only if qty increased
          let kitchenPrintedQty = 0;
          if (qtyChanged && newQty > oldQty && oi.itemId) {
            const previousPrinted = this.orderEvents.getPrintedQty(tx, line.orderItemId);
            kitchenPrintedQty = newQty > previousPrinted ? newQty - previousPrinted : 0;
          }

          this.orderEvents.createEvent(
            tx,
            orderId,
            userId,
            'item_updated',
            {
              orderItemId: line.orderItemId,
              itemName: oi.itemName,
              oldQty,
              newQty,
              oldTotal,
              newTotal,
              kitchenPrintedQty,
              ...(notesChanged ? { notes: desiredNotes } : {}),
            },
            now,
          );

          // Accumulate kitchen delta
          if (kitchenPrintedQty > 0 && oi.itemId) {
            const printer = getPrinter(oi.itemId);
            if (printer) {
              const key = printer.name;
              let entry = kitchenDeltasByPrinter.get(key);
              if (!entry) {
                entry = { printer, items: [] };
                kitchenDeltasByPrinter.set(key, entry);
              }
              entry.items.push({
                orderItemId: line.orderItemId,
                itemName: oi.itemName,
                printedQty: kitchenPrintedQty,
              });
            }
          }
        } else {
          // New line — must have itemId
          if (line.itemId == null) {
            throw new BadRequestException('New item lines must include an itemId');
          }

          anyMutation = true;

          const item = tx.select().from(items).where(eq(items.id, line.itemId)).get();
          if (!item) throw new NotFoundException(`Menu item ${line.itemId} not found`);
          if (!item.isActive) {
            throw new BadRequestException(`Menu item ${line.itemId} is inactive`);
          }

          const totalHalalas = item.priceHalalas * line.qty;
          const normalizedNotes = normalizeNotes(line.notes ?? null);

          const insertResult = tx
            .insert(orderItems)
            .values({
              orderId,
              itemId: item.id,
              itemName: item.name,
              unitPriceHalalas: item.priceHalalas,
              vatRateBp: item.vatRateBp,
              qty: line.qty,
              totalHalalas,
              notes: normalizedNotes,
              ...createAuditFields(userId, now),
            })
            .run();

          const orderItemId = Number(insertResult.lastInsertRowid);

          // item_added event with full payload (kitchenPrintedQty = qty for new lines)
          this.orderEvents.createEvent(
            tx,
            orderId,
            userId,
            'item_added',
            {
              orderItemId,
              itemId: item.id,
              itemName: item.name,
              qty: line.qty,
              unitPriceHalalas: item.priceHalalas,
              totalHalalas,
              kitchenPrintedQty: line.qty,
              ...(normalizedNotes ? { notes: normalizedNotes } : {}),
            },
            now,
          );

          // Accumulate kitchen delta for new line
          const printer = getPrinter(item.id);
          if (printer) {
            const key = printer.name;
            let entry = kitchenDeltasByPrinter.get(key);
            if (!entry) {
              entry = { printer, items: [] };
              kitchenDeltasByPrinter.set(key, entry);
            }
            entry.items.push({
              orderItemId,
              itemName: item.name,
              printedQty: line.qty,
            });
          }
        }
      }

      // Recompute totals and bump order audit fields — only if something changed
      if (anyMutation) {
        const allItems = tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
        const totals = recomputeOrderTotals(allItems);

        tx.update(orders)
          .set({
            subtotalHalalas: totals.subtotalHalalas,
            vatHalalas: totals.vatHalalas,
            totalHalalas: totals.totalHalalas,
            ...updateAuditFields(userId, now),
          })
          .where(eq(orders.id, orderId))
          .run();
      }

      // Write kitchen_print_enqueued events grouped by printer
      for (const [, entry] of kitchenDeltasByPrinter) {
        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'kitchen_print_enqueued',
          {
            printer: entry.printer.name,
            printerId: entry.printer.id,
            items: entry.items,
          },
          now,
        );
      }

      // Return the updated order
      const refreshedOrder = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      const refreshedItems = tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .all();
      const logs = this.orderEvents.getEvents(tx, orderId);
      return { ...refreshedOrder, items: refreshedItems, events: logs };
    });

    // After transaction: non-blocking kitchen prints — one ticket per printer
    for (const [, entry] of kitchenDeltasByPrinter) {
      if (entry.items.length > 0) {
        this.runKitchenPrint(orderId, entry.printer, entry.items, userId);
      }
    }

    if (anyMutation) {
      this.emitDomainEvent('order.updated', orderId, userId);
    }
    return updatedOrder;
  }

  private validateStandardInvoiceBuyer(dto: {
    isStandardInvoice?: boolean;
    zatcaBuyerDetails?: ZatcaBuyerDetailsDto;
  }): Record<string, unknown> | null {
    if (!dto.isStandardInvoice) return null;

    if (!dto.zatcaBuyerDetails) {
      throw new BadRequestException('zatcaBuyerDetails is required when isStandardInvoice is true');
    }

    const parsed = parseZatcaBuyerDetails(dto.zatcaBuyerDetails as unknown);
    if (!parsed.success) {
      const formatted = formatZatcaBuyerDetailsErrors(parsed.error);
      throw new BadRequestException(
        `Invalid buyer details: ${Object.entries(formatted)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ')}`,
      );
    }
    return parsed.data as unknown as Record<string, unknown>;
  }

  async payOrder(
    orderId: number,
    userId: number,
    dto: {
      payments: Array<{ methodId: string; amountHalalas: number; tenderedHalalas?: number }>;
      isStandardInvoice?: boolean;
      zatcaBuyerDetails?: ZatcaBuyerDetailsDto;
    },
  ) {
    const now = Math.floor(Date.now() / 1000);
    const receiptPrinter = this.printJobService.getReceiptPrinter();

    // Validate standard invoice buyer fields outside transaction
    const validatedBuyer = this.validateStandardInvoiceBuyer(dto);
    const isStandardInvoice = dto.isStandardInvoice === true;

    // Payment validation happens inside the transaction
    let hasCashPayment = false;

    this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');

      if (order.status !== 'open') {
        throw new BadRequestException(
          `Cannot pay order in '${order.status}' status. Only open orders can be paid.`,
        );
      }

      // ADR 0002: payments key is required — no implicit cash fallback
      if (!dto.payments || dto.payments.length === 0) {
        throw new BadRequestException('Payment lines array is required and must not be empty');
      }

      const paymentLines = dto.payments;

      // Validate and process each payment line
      const paymentRecords: Array<{
        methodId: string;
        methodTitle: string;
        amountHalalas: number;
        tenderedHalalas?: number;
        changeHalalas?: number;
      }> = [];
      const seenMethods = new Set<string>();

      let sumAmounts = 0;

      for (const line of paymentLines) {
        // Amount must be positive
        if (line.amountHalalas <= 0) {
          throw new BadRequestException(
            `Payment amount for method "${line.methodId}" must be positive`,
          );
        }

        // No duplicate methods
        if (seenMethods.has(line.methodId)) {
          throw new BadRequestException(
            `Duplicate payment method "${line.methodId}" — only one entry per method allowed`,
          );
        }
        seenMethods.add(line.methodId);

        // Validate method exists and is enabled
        const pm = tx
          .select()
          .from(paymentMethods)
          .where(eq(paymentMethods.id, line.methodId))
          .get();
        if (!pm) {
          throw new BadRequestException(`Unknown payment method "${line.methodId}"`);
        }
        if (!pm.enabled) {
          throw new BadRequestException(`Payment method "${line.methodId}" is disabled`);
        }

        // Non-cash: tenderedHalalas must be absent
        if (line.methodId !== 'cash') {
          if (line.tenderedHalalas !== undefined && line.tenderedHalalas !== null) {
            throw new BadRequestException(
              `Tendered amount is only valid for cash payments (method "${line.methodId}")`,
            );
          }
        }

        // Cash: tendered must be >= amount if present
        let tendered: number | undefined;
        let change: number | undefined;
        if (line.methodId === 'cash') {
          if (line.tenderedHalalas !== undefined && line.tenderedHalalas !== null) {
            if (line.tenderedHalalas < line.amountHalalas) {
              throw new BadRequestException(
                `Cash tendered amount (${line.tenderedHalalas}) must be >= payment amount (${line.amountHalalas})`,
              );
            }
            tendered = line.tenderedHalalas;
            change = tendered! - line.amountHalalas;
          } else {
            tendered = line.amountHalalas;
            change = 0;
          }
          if (line.amountHalalas > 0) {
            hasCashPayment = true;
          }
        }

        sumAmounts += line.amountHalalas;
        paymentRecords.push({
          methodId: line.methodId,
          methodTitle: pm.title,
          amountHalalas: line.amountHalalas,
          tenderedHalalas: tendered ?? undefined,
          changeHalalas: change ?? undefined,
        });
      }

      // Sum must equal order total
      if (sumAmounts !== order.totalHalalas) {
        throw new BadRequestException(
          `Payment sum (${sumAmounts}) does not equal order total (${order.totalHalalas})`,
        );
      }

      // Insert order_payments rows
      for (const pr of paymentRecords) {
        tx.insert(orderPayments)
          .values({
            orderId,
            methodId: pr.methodId,
            methodTitle: pr.methodTitle,
            amountHalalas: pr.amountHalalas,
            tenderedHalalas: pr.tenderedHalalas ?? null,
            changeHalalas: pr.changeHalalas ?? null,
            createdAt: now,
            createdBy: userId,
          })
          .run();
      }

      // Update order status (plus buyer fields if standard invoice)
      const orderUpdate: Record<string, any> = {
        status: 'paid',
        ...updateAuditFields(userId, now),
      };
      if (isStandardInvoice) {
        orderUpdate.isStandardInvoice = 1;
        orderUpdate.zatcaBuyerDetails = JSON.stringify(validatedBuyer);
      }
      tx.update(orders).set(orderUpdate).where(eq(orders.id, orderId)).run();

      // Write paid event with payment breakdown (and standard invoice flag if applicable)
      const paidPayload: Record<string, any> = {
        fromStatus: 'open',
        toStatus: 'paid',
        payments: paymentRecords.map((pr) => ({
          methodId: pr.methodId,
          methodTitle: pr.methodTitle,
          amountHalalas: pr.amountHalalas,
          ...(pr.tenderedHalalas !== undefined
            ? { tenderedHalalas: pr.tenderedHalalas, changeHalalas: pr.changeHalalas }
            : {}),
        })),
      };
      if (isStandardInvoice) {
        paidPayload.isStandardInvoice = true;
        const buyer = validatedBuyer as Record<string, unknown>;
        paidPayload.buyerVatNumber = buyer.vatNumber;
        paidPayload.buyerName = buyer.name;
      }

      this.orderEvents.createEvent(tx, orderId, userId, 'paid', paidPayload, now);

      // Receipt print enqueued with conditional kickDrawer
      if (receiptPrinter) {
        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'receipt_print_enqueued',
          {
            printer: receiptPrinter.name,
            printerId: receiptPrinter.id,
            totalHalalas: order.totalHalalas,
            kickDrawer: hasCashPayment,
          },
          now,
        );
      }
    });

    // After transaction: non-blocking receipt print
    if (receiptPrinter) {
      this.runReceiptPrint(orderId, receiptPrinter, userId, hasCashPayment);
    }

    this.emitDomainEvent('order.paid', orderId, userId);
    return { success: true, status: 'paid' };
  }

  async voidOrder(orderId: number, userId: number) {
    const now = Math.floor(Date.now() / 1000);

    this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');

      if (order.status !== 'open') {
        throw new BadRequestException(
          `Cannot void order in '${order.status}' status. Only open orders can be voided.`,
        );
      }

      tx.update(orders)
        .set({ status: 'voided', ...updateAuditFields(userId, now) })
        .where(eq(orders.id, orderId))
        .run();

      this.orderEvents.createEvent(
        tx,
        orderId,
        userId,
        'voided',
        {
          fromStatus: 'open',
          toStatus: 'voided',
        },
        now,
      );
    });

    this.emitDomainEvent('order.voided', orderId, userId);
    return { success: true, status: 'voided' };
  }

  async refundOrder(
    orderId: number,
    dto: { items: { orderItemId: number; qty: number }[]; reason?: string; methodId: string },
    userId: number,
  ) {
    const now = Math.floor(Date.now() / 1000);

    // ── Pre-transaction validation ──────────────────────────────────────────────

    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'paid') {
      throw new BadRequestException(
        `Cannot refund order in '${order.status}' status. Only paid orders can be refunded.`,
      );
    }

    // Validate payment method exists and is enabled
    const pm = this.db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, dto.methodId))
      .get();
    if (!pm) {
      throw new BadRequestException(`Unknown payment method "${dto.methodId}"`);
    }
    if (!pm.enabled) {
      throw new BadRequestException(`Payment method "${dto.methodId}" is disabled`);
    }

    // Load all order items and validate each requested item belongs to the order
    const allOrderItems = this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .all();
    const itemMap = new Map(allOrderItems.map((oi) => [oi.id, oi]));

    if (dto.items.length === 0) {
      throw new BadRequestException('At least one item must be specified for refund.');
    }

    for (const item of dto.items) {
      if (item.qty <= 0) {
        throw new BadRequestException('Refund quantity must be positive.');
      }
      const oi = itemMap.get(item.orderItemId);
      if (!oi) {
        throw new BadRequestException(
          `Order item ${item.orderItemId} does not belong to order ${orderId}.`,
        );
      }
    }

    const isCashRefund = dto.methodId === 'cash';
    const receiptPrinter = this.printJobService.getReceiptPrinter();

    // ── Transaction ─────────────────────────────────────────────────────────────
    let refundId = 0;
    let refundTotalHalalas = 0;
    let isFullyRefunded = false;
    const refundItems: Array<{
      orderItemId: number;
      itemName: string;
      qty: number;
      totalHalalas: number;
    }> = [];

    this.db.transaction((tx: any) => {
      const lineSubtotals: number[] = [];
      const lineVats: number[] = [];
      const lineTotals: number[] = [];

      for (const item of dto.items) {
        const oi = itemMap.get(item.orderItemId)!;

        // Calculate already-refunded qty for this order item within this order
        const refundedRows = tx
          .select()
          .from(orderRefundItems)
          .innerJoin(orderRefunds, eq(orderRefundItems.refundId, orderRefunds.id))
          .where(
            and(
              eq(orderRefunds.orderId, orderId),
              eq(orderRefundItems.orderItemId, item.orderItemId),
            ),
          )
          .all();
        const alreadyRefundedQty = refundedRows.reduce(
          (sum: number, row: any) => sum + row.order_refund_items.qty,
          0,
        );

        if (alreadyRefundedQty + item.qty > oi.qty) {
          throw new BadRequestException(
            `Refund qty ${item.qty} exceeds remaining qty ${oi.qty - alreadyRefundedQty} for item "${oi.itemName}".`,
          );
        }

        const lineTotal = oi.unitPriceHalalas * item.qty;
        const d = decomposeVat(lineTotal, oi.vatRateBp);

        lineSubtotals.push(d.priceExclHalalas);
        lineVats.push(d.vatHalalas);
        lineTotals.push(lineTotal);

        refundItems.push({
          orderItemId: item.orderItemId,
          itemName: oi.itemName,
          qty: item.qty,
          totalHalalas: lineTotal,
        });
      }

      const subtotalHalalas = lineSubtotals.reduce((a, b) => a + b, 0);
      const vatHalalas = lineVats.reduce((a, b) => a + b, 0);
      const totalHalalas = lineTotals.reduce((a, b) => a + b, 0);
      refundTotalHalalas = totalHalalas;

      // Insert order_refunds
      const refundInsert = tx
        .insert(orderRefunds)
        .values({
          orderId,
          userId,
          methodId: dto.methodId,
          methodTitle: pm.title,
          subtotalHalalas,
          vatHalalas,
          totalHalalas,
          reason: dto.reason ?? null,
          ...createAuditFields(userId, now),
        })
        .run();
      refundId = Number(refundInsert.lastInsertRowid);

      // Insert order_refund_items
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        const oi = itemMap.get(item.orderItemId)!;
        tx.insert(orderRefundItems)
          .values({
            refundId,
            orderItemId: item.orderItemId,
            itemName: oi.itemName,
            unitPriceHalalas: oi.unitPriceHalalas,
            vatRateBp: oi.vatRateBp,
            qty: item.qty,
            totalHalalas: lineTotals[i],
            createdAt: now,
          })
          .run();
      }

      // Write refund_issued event
      this.orderEvents.createEvent(
        tx,
        orderId,
        userId,
        'refund_issued',
        {
          refundId,
          methodId: dto.methodId,
          methodTitle: pm.title,
          items: refundItems,
          totalHalalas,
          ...(dto.reason ? { reason: dto.reason } : {}),
        },
        now,
      );

      // Determine if order is fully refunded
      // For every row in order_items, originalQty == (sum of all refund qtys)
      isFullyRefunded = true;
      for (const oi of allOrderItems) {
        // Refresh the sum including the items just inserted
        const refRows = tx
          .select()
          .from(orderRefundItems)
          .innerJoin(orderRefunds, eq(orderRefundItems.refundId, orderRefunds.id))
          .where(and(eq(orderRefunds.orderId, orderId), eq(orderRefundItems.orderItemId, oi.id)))
          .all();
        const totalRefundedQty = refRows.reduce(
          (s: number, row: any) => s + row.order_refund_items.qty,
          0,
        );
        if (totalRefundedQty < oi.qty) {
          isFullyRefunded = false;
          break;
        }
      }

      if (isFullyRefunded) {
        tx.update(orders)
          .set({ status: 'refunded', ...updateAuditFields(userId, now) })
          .where(eq(orders.id, orderId))
          .run();

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'refunded',
          {
            fromStatus: 'paid',
            toStatus: 'refunded',
          },
          now,
        );
      }

      // Receipt print enqueued event
      if (receiptPrinter) {
        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'receipt_print_enqueued',
          {
            printer: receiptPrinter.name,
            printerId: receiptPrinter.id,
            totalHalalas: refundTotalHalalas,
            kickDrawer: isCashRefund,
          },
          now,
        );
      }
    });

    // ── After transaction: non-blocking refund receipt print ───────────────────
    if (receiptPrinter) {
      this.runRefundReceiptPrint(orderId, refundId, receiptPrinter, userId, isCashRefund);
    }

    // ── Emit WebSocket events ───────────────────────────────────────────────────
    this.emitDomainEvent('order.refund.issued', orderId, userId, { refundId, userId });
    if (isFullyRefunded) {
      this.emitDomainEvent('order.refunded', orderId, userId);
    }

    const updatedOrder = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    return { success: true, refundId, status: updatedOrder!.status };
  }

  async getOrderRefunds(orderId: number) {
    const refunds = this.db
      .select()
      .from(orderRefunds)
      .where(eq(orderRefunds.orderId, orderId))
      .all();

    return refunds.map((refund) => {
      const rifItems = this.db
        .select()
        .from(orderRefundItems)
        .where(eq(orderRefundItems.refundId, refund.id))
        .all();

      return {
        id: refund.id,
        orderId: refund.orderId,
        userId: refund.userId,
        methodId: refund.methodId,
        methodTitle: refund.methodTitle,
        subtotalHalalas: refund.subtotalHalalas,
        vatHalalas: refund.vatHalalas,
        totalHalalas: refund.totalHalalas,
        reason: refund.reason,
        createdAt: refund.createdAt,
        items: rifItems.map((ri) => ({
          id: ri.id,
          orderItemId: ri.orderItemId,
          itemName: ri.itemName,
          unitPriceHalalas: ri.unitPriceHalalas,
          vatRateBp: ri.vatRateBp,
          qty: ri.qty,
          totalHalalas: ri.totalHalalas,
        })),
      };
    });
  }

  async reprintOrder(orderId: number, target: string, userId: number) {
    if (target !== 'receipt') {
      throw new BadRequestException(
        `Unsupported reprint target: ${target}. Only 'receipt' is supported.`,
      );
    }
    return this.reprintReceipt(orderId, userId);
  }

  // ── Non-blocking print helpers ───────────────────────────────────────────────

  private async runKitchenPrint(
    orderId: number,
    printer: PrinterRecord,
    deltas: Array<{ orderItemId: number; printedQty: number; itemName: string }>,
    userId: number,
  ): Promise<void> {
    try {
      const { printed } = await this.printJobService.printKitchenDeltas(orderId, deltas);

      const now = Math.floor(Date.now() / 1000);
      for (const p of printed) {
        this.orderEvents.createEvent(
          this.db,
          orderId,
          userId,
          'kitchen_print_succeeded',
          { printer: p.name, printerId: p.id },
          now,
        );
      }
    } catch (err: any) {
      this.logger.error(`Kitchen print failed for order ${orderId}: ${err.message}`);
    }
  }

  private async runReceiptPrint(
    orderId: number,
    printer: PrinterRecord,
    userId: number,
    kickDrawer = true,
  ): Promise<void> {
    try {
      await this.printJobService.printReceipt(orderId, { kickDrawer });

      const now = Math.floor(Date.now() / 1000);
      this.orderEvents.createEvent(
        this.db,
        orderId,
        userId,
        'receipt_print_succeeded',
        { printer: printer.name, printerId: printer.id },
        now,
      );
    } catch (err: any) {
      this.logger.error(`Receipt print failed for order ${orderId}: ${err.message}`);
    }
  }

  private async runRefundReceiptPrint(
    orderId: number,
    refundId: number,
    printer: PrinterRecord,
    userId: number,
    kickDrawer = false,
  ): Promise<void> {
    try {
      await this.printJobService.printRefundReceipt(refundId, { kickDrawer });

      const now = Math.floor(Date.now() / 1000);
      this.orderEvents.createEvent(
        this.db,
        orderId,
        userId,
        'receipt_print_succeeded',
        { printer: printer.name, printerId: printer.id },
        now,
      );
    } catch (err: any) {
      this.logger.error(`Refund receipt print failed for order ${orderId}: ${err.message}`);
    }
  }

  // ── Reprint helpers ──────────────────────────────────────────────────────────

  private async reprintReceipt(
    orderId: number,
    userId: number,
  ): Promise<{ success: boolean; errors: string[] }> {
    const now = Math.floor(Date.now() / 1000);
    const errors: string[] = [];

    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new NotFoundException('Order not found');

    const receiptPrinter = this.printJobService.getReceiptPrinter();
    if (!receiptPrinter) {
      return { success: false, errors: ['No active receipt printer configured'] };
    }

    this.orderEvents.createEvent(
      this.db,
      orderId,
      userId,
      'receipt_print_enqueued',
      {
        printer: receiptPrinter.name,
        printerId: receiptPrinter.id,
        totalHalalas: order.totalHalalas,
        kickDrawer: false,
      },
      now,
    );

    try {
      await this.printJobService.printReceipt(orderId, { kickDrawer: false });

      this.orderEvents.createEvent(
        this.db,
        orderId,
        userId,
        'receipt_print_succeeded',
        { printer: receiptPrinter.name, printerId: receiptPrinter.id },
        now,
      );
    } catch (err: any) {
      const msg = `Receipt reprint: ${err.message}`;
      this.logger.error(msg);
      errors.push(msg);
    }

    return { success: errors.length === 0, errors };
  }

  private recomputeAndUpdateOrderTotals(tx: any, orderId: number, now: number, userId: number) {
    const allItems = tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
    const totals = recomputeOrderTotals(allItems);

    tx.update(orders)
      .set({
        subtotalHalalas: totals.subtotalHalalas,
        vatHalalas: totals.vatHalalas,
        totalHalalas: totals.totalHalalas,
        ...updateAuditFields(userId, now),
      })
      .where(eq(orders.id, orderId))
      .run();
  }

  listOrders(filters?: { status?: string; date?: string }): any[] {
    let query = this.db.select().from(orders);
    if (filters?.status) {
      query = query.where(eq(orders.status, filters.status)) as any;
    }
    return query.orderBy(orders.id).all();
  }

  getOrder(id: number): any {
    const order = this.db.select().from(orders).where(eq(orders.id, id)).get();
    if (!order) throw new NotFoundException('Order not found');
    const itemsList = this.db.select().from(orderItems).where(eq(orderItems.orderId, id)).all();
    const logs = this.orderEvents.getEvents(this.db, id);
    const payments = this.db
      .select()
      .from(orderPayments)
      .where(eq(orderPayments.orderId, id))
      .orderBy(orderPayments.id)
      .all();
    return mapBools(
      {
        ...order,
        items: itemsList,
        events: logs,
        payments: payments.map((p) => ({
          methodId: p.methodId,
          methodTitle: p.methodTitle,
          amountHalalas: p.amountHalalas,
          tenderedHalalas: p.tenderedHalalas,
          changeHalalas: p.changeHalalas,
        })),
        zatcaBuyerDetails: this.parseOrderBuyerDetails(order),
      },
      ['isStandardInvoice'],
    );
  }

  getOrderEvents(orderId: number): any[] {
    return this.orderEvents.getEvents(this.db, orderId);
  }

  /**
   * Parse zatca_buyer_details JSON string from a DB order row.
   * Returns a parsed object on success, null for missing/corrupt data.
   * Logs a warning on corrupt JSON (resilience — don't crash on bad data).
   */
  private parseOrderBuyerDetails(order: Record<string, any>): Record<string, unknown> | null {
    const raw = order.zatcaBuyerDetails;
    if (raw == null || raw === '') return null;
    try {
      const parsed = JSON.parse(raw);
      // Validate shape but don't throw — return null on invalid data
      const result = parseZatcaBuyerDetails(parsed);
      if (result.success) {
        return result.data as unknown as Record<string, unknown>;
      }
      this.logger.warn(
        `Order ${order.id} has invalid zatca_buyer_details JSON shape, returning null. Errors: ${JSON.stringify(formatZatcaBuyerDetailsErrors(result.error))}`,
      );
      return null;
    } catch {
      return null;
    }
  }

  verifyOrderChain(orderId: number): any {
    const logs = this.orderEvents.getEvents(this.db, orderId);
    return this.orderEvents.verifyChain(orderId, logs);
  }
}
