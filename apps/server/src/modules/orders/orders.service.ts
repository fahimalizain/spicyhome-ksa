import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  orders,
  orderItems,
  orderAuditLog,
  tables,
  dayOpenings,
  settings,
  items,
} from '@spicyhome/db';
import { decomposeVat } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import { AuditLogService } from './audit-log.service';
import { PrintJobService } from '../printers/print-job.service';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['sent', 'voided'],
  sent: ['paid', 'voided'],
  paid: [],
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

@Injectable()
export class OrdersService {
  private readonly auditLog: AuditLogService;

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private eventEmitter: EventEmitter2,
    private printJobService: PrintJobService,
  ) {
    this.auditLog = new AuditLogService();
  }

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

      this.auditLog.createEntry(
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

    return result;
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

  async addItem(
    orderId: number,
    dto: { itemId: number; qty: number; notes?: string },
    userId: number,
  ) {
    const now = Math.floor(Date.now() / 1000);

    return this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'open') throw new BadRequestException('Order is not open');

      const item = tx.select().from(items).where(eq(items.id, dto.itemId)).get();
      if (!item) throw new NotFoundException('Item not found');

      const totalHalalas = item.priceHalalas * dto.qty;

      tx.insert(orderItems)
        .values({
          orderId,
          itemId: item.id,
          itemName: item.name,
          unitPriceHalalas: item.priceHalalas,
          vatRateBp: item.vatRateBp,
          qty: dto.qty,
          totalHalalas,
          notes: dto.notes ?? null,
          ...createAuditFields(userId, now),
        })
        .run();

      this.recomputeAndUpdateOrderTotals(tx, orderId, now, userId);

      this.auditLog.createEntry(
        tx,
        orderId,
        userId,
        'item_added',
        {
          itemId: item.id,
          itemName: item.name,
          qty: dto.qty,
          totalHalalas,
        },
        now,
      );

      return { success: true };
    });
  }

  async updateItem(
    orderId: number,
    orderItemId: number,
    dto: { qty?: number; notes?: string },
    userId: number,
  ) {
    const now = Math.floor(Date.now() / 1000);

    return this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'open') throw new BadRequestException('Order is not open');

      const oi = tx.select().from(orderItems).where(eq(orderItems.id, orderItemId)).get();
      if (!oi || oi.orderId !== orderId) throw new NotFoundException('Order item not found');

      const updates: Record<string, any> = { ...updateAuditFields(userId, now) };
      if (dto.qty !== undefined) {
        updates.qty = dto.qty;
        updates.totalHalalas = oi.unitPriceHalalas * dto.qty;
      }
      if (dto.notes !== undefined) updates.notes = dto.notes;

      tx.update(orderItems).set(updates).where(eq(orderItems.id, orderItemId)).run();

      this.recomputeAndUpdateOrderTotals(tx, orderId, now, userId);

      this.auditLog.createEntry(
        tx,
        orderId,
        userId,
        'item_updated',
        {
          orderItemId,
          qty: dto.qty,
          notes: dto.notes,
        },
        now,
      );

      return { success: true };
    });
  }

  async removeItem(orderId: number, orderItemId: number, userId: number) {
    const now = Math.floor(Date.now() / 1000);

    return this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'open') throw new BadRequestException('Order is not open');

      const oi = tx.select().from(orderItems).where(eq(orderItems.id, orderItemId)).get();
      if (!oi || oi.orderId !== orderId) throw new NotFoundException('Order item not found');

      tx.delete(orderItems).where(eq(orderItems.id, orderItemId)).run();

      this.recomputeAndUpdateOrderTotals(tx, orderId, now, userId);

      this.auditLog.createEntry(
        tx,
        orderId,
        userId,
        'item_removed',
        {
          orderItemId,
          itemName: oi.itemName,
          totalHalalas: oi.totalHalalas,
        },
        now,
      );

      return { success: true };
    });
  }

  async sendOrder(orderId: number, userId: number) {
    const result = await this.transitionStatus(orderId, 'sent', 'sent_to_kitchen', userId);
    // Non-blocking print — failure must NOT fail the order
    this.emitPrintEvent('order.sent', orderId, userId);
    return result;
  }

  async payOrder(orderId: number, userId: number) {
    const result = await this.transitionStatus(orderId, 'paid', 'paid', userId);
    // Non-blocking print
    this.emitPrintEvent('order.paid', orderId, userId);
    return result;
  }

  async voidOrder(orderId: number, userId: number) {
    return this.transitionStatus(orderId, 'voided', 'voided', userId);
  }

  async reprintOrder(orderId: number, target: string, userId: number) {
    // Direct call — reprint needs sync result
    return this.printJobService.reprintOrder(orderId, target, userId);
  }

  private emitPrintEvent(event: string, orderId: number, userId: number): void {
    try {
      this.eventEmitter.emit(event, { orderId, userId });
    } catch (err: any) {
      // Swallow — print events never fail the order operation
    }
  }

  private transitionStatus(
    orderId: number,
    newStatus: string,
    auditAction: string,
    userId: number,
  ) {
    const now = Math.floor(Date.now() / 1000);

    return this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');

      const allowed = VALID_TRANSITIONS[order.status] || [];
      if (!allowed.includes(newStatus)) {
        throw new BadRequestException(
          `Cannot change order status from '${order.status}' to '${newStatus}'`,
        );
      }

      tx.update(orders)
        .set({ status: newStatus, ...updateAuditFields(userId, now) })
        .where(eq(orders.id, orderId))
        .run();

      this.auditLog.createEntry(
        tx,
        orderId,
        userId,
        auditAction,
        {
          fromStatus: order.status,
          toStatus: newStatus,
        },
        now,
      );

      return { success: true, status: newStatus };
    });
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
    const logs = this.db
      .select()
      .from(orderAuditLog)
      .where(eq(orderAuditLog.orderId, id))
      .orderBy(orderAuditLog.id)
      .all();
    return { ...order, items: itemsList, auditLog: logs };
  }

  verifyAuditChain(orderId: number): any {
    const logs = this.db
      .select()
      .from(orderAuditLog)
      .where(eq(orderAuditLog.orderId, orderId))
      .orderBy(orderAuditLog.id)
      .all();
    return this.auditLog.verifyChain(orderId, logs);
  }
}
