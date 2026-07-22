import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import { eq, and, ne, desc } from 'drizzle-orm';
import { dayOpenings, orders } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

function todayInRiyadh(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' });
  return fmt.format(new Date());
}

@Injectable()
export class BusinessDayService {
  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {}

  getOpenDay() {
    return this.db.select().from(dayOpenings).where(eq(dayOpenings.status, 'open')).get() ?? null;
  }

  async openDay(dto: { openingCashHalalas: number }, userId: number) {
    const existing = this.getOpenDay();
    if (existing) {
      throw new ConflictException(
        'A business day is already open. Close it before opening a new one.',
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const businessDate = todayInRiyadh();

    const values = {
      businessDate,
      status: 'open',
      openingCashHalalas: dto.openingCashHalalas,
      openedAt: now,
      openedBy: userId,
      ...createAuditFields(userId, now),
    };

    const result = this.db
      .insert(dayOpenings)
      .values(values as any)
      .run();
    return this.db
      .select()
      .from(dayOpenings)
      .where(eq(dayOpenings.id, Number(result.lastInsertRowid)))
      .get();
  }

  async closeDay(dto: { closingCashHalalas: number }, userId: number) {
    const openDay = this.getOpenDay();
    if (!openDay) {
      throw new NotFoundException('No open business day to close.');
    }

    const now = Math.floor(Date.now() / 1000);

    // Validate no orders still in open|sent
    const openOrders = this.db
      .select({ id: orders.id, orderNo: orders.orderNo, status: orders.status })
      .from(orders)
      .where(
        and(
          eq(orders.dayOpeningId, openDay.id),
          ne(orders.status, 'paid'),
          ne(orders.status, 'voided'),
          ne(orders.status, 'refunded'),
        ),
      )
      .all();

    if (openOrders.length > 0) {
      const offending = openOrders.map((o) => `#${o.orderNo}`).join(', ');
      throw new ConflictException(
        `Cannot close day — ${openOrders.length} order(s) still open or sent: ${offending}. Pay or void them first.`,
      );
    }

    // Compute totals from paid orders only
    const paidOrders = this.db
      .select({
        totalHalalas: orders.totalHalalas,
        vatHalalas: orders.vatHalalas,
      })
      .from(orders)
      .where(and(eq(orders.dayOpeningId, openDay.id), eq(orders.status, 'paid')))
      .all();

    const voidedCount = this.db
      .select({ count: orders.id })
      .from(orders)
      .where(and(eq(orders.dayOpeningId, openDay.id), eq(orders.status, 'voided')))
      .all().length;

    const totalSalesHalalas = paidOrders.reduce((sum, o) => sum + o.totalHalalas, 0);
    const totalVatHalalas = paidOrders.reduce((sum, o) => sum + o.vatHalalas, 0);
    const orderCount = paidOrders.length;

    this.db
      .update(dayOpenings)
      .set({
        status: 'closed',
        closedAt: now,
        closedBy: userId,
        closingCashHalalas: dto.closingCashHalalas,
        totalSalesHalalas,
        totalVatHalalas,
        orderCount,
        ...updateAuditFields(userId, now),
      } as any)
      .where(eq(dayOpenings.id, openDay.id))
      .run();

    const closed = this.db.select().from(dayOpenings).where(eq(dayOpenings.id, openDay.id)).get();
    return { ...closed, voidedOrderCount: voidedCount };
  }

  getCurrentDay() {
    const openDay = this.getOpenDay();
    if (!openDay) return null;

    // Live X-report totals
    const paidOrders = this.db
      .select({
        totalHalalas: orders.totalHalalas,
        vatHalalas: orders.vatHalalas,
      })
      .from(orders)
      .where(and(eq(orders.dayOpeningId, openDay.id), eq(orders.status, 'paid')))
      .all();

    const liveSales = paidOrders.reduce((sum, o) => sum + o.totalHalalas, 0);
    const liveVat = paidOrders.reduce((sum, o) => sum + o.vatHalalas, 0);
    const liveCount = paidOrders.length;

    return {
      ...openDay,
      liveSalesHalalas: liveSales,
      liveVatHalalas: liveVat,
      liveOrderCount: liveCount,
    };
  }

  listDays(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const rows = this.db
      .select()
      .from(dayOpenings)
      .orderBy(desc(dayOpenings.id))
      .limit(limit)
      .offset(offset)
      .all();

    const total = this.db.select().from(dayOpenings).all().length;

    return { data: rows, total, page, limit };
  }

  getDay(id: number) {
    const day = this.db.select().from(dayOpenings).where(eq(dayOpenings.id, id)).get();
    if (!day) throw new NotFoundException('Business day not found');
    return day;
  }

  /** Today's business date in Asia/Riyadh (YYYY-MM-DD). */
  static todayInRiyadh(): string {
    return todayInRiyadh();
  }
}
