import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, inArray, gte, lte } from 'drizzle-orm';
import { orders, orderItems, dayOpenings, itemCategories, items, users } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { BusinessDayService } from '../business-day/business-day.service';
import { PrintersService } from '../printers/printers.service';
import { ZReportBuilder } from './z-report-builder';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

export interface XReport {
  dayId: number;
  businessDate: string;
  status: string;
  openingCashHalalas: number;
  totalSalesHalalas: number;
  totalVatHalalas: number;
  paidOrderCount: number;
  sentOrderCount: number;
  openOrderCount: number;
  voidedOrderCount: number;
  salesByType: Record<string, { count: number; totalHalalas: number }>;
  salesByUser: Array<{ userId: number; userName: string; orderCount: number; totalHalalas: number }>;
  salesByCategory: Array<{ categoryId: number | null; categoryName: string; itemCount: number; totalHalalas: number }>;
  paymentTotals: { cash: number };
}

export interface ZReport extends XReport {
  closingCashHalalas: number;
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private businessDayService: BusinessDayService,
    private printersService: PrintersService,
  ) {}

  async getXReport(): Promise<XReport | { error: string }> {
    const openDay = this.businessDayService.getOpenDay();
    if (!openDay) return { error: 'No open business day' };

    return this.buildBreakdown(openDay.id);
  }

  async getZReport(dayId: number): Promise<ZReport> {
    const day = this.db.select().from(dayOpenings).where(eq(dayOpenings.id, dayId)).get();
    if (!day) throw new NotFoundException('Business day not found');

    const breakdown = this.buildBreakdown(dayId);

    return {
      ...breakdown,
      closingCashHalalas: day.closingCashHalalas ?? 0,
    };
  }

  private buildBreakdown(dayId: number): XReport {
    const day = this.db.select().from(dayOpenings).where(eq(dayOpenings.id, dayId)).get()!;

    const allOrders = this.db
      .select()
      .from(orders)
      .where(eq(orders.dayOpeningId, dayId))
      .all();

    const paidOrders = allOrders.filter((o) => o.status === 'paid');
    const sentOrders = allOrders.filter((o) => o.status === 'sent');
    const openOrders = allOrders.filter((o) => o.status === 'open');
    const voidedOrders = allOrders.filter((o) => o.status === 'voided');

    const totalSalesHalalas = paidOrders.reduce((sum, o) => sum + o.totalHalalas, 0);
    const totalVatHalalas = paidOrders.reduce((sum, o) => sum + o.vatHalalas, 0);

    const salesByType: Record<string, { count: number; totalHalalas: number }> = {};
    for (const o of paidOrders) {
      const t = o.type;
      if (!salesByType[t]) salesByType[t] = { count: 0, totalHalalas: 0 };
      salesByType[t].count++;
      salesByType[t].totalHalalas += o.totalHalalas;
    }

    // Per-user sales
    const userIds = [...new Set(paidOrders.map((o) => o.createdBy).filter(Boolean))];
    const userRows = userIds.length > 0
      ? this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds as number[])).all()
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u.name]));

    const salesByUser = userIds.map((uid) => {
      const userOrders = paidOrders.filter((o) => o.createdBy === uid);
      return {
        userId: uid!,
        userName: userMap.get(uid!) ?? 'Unknown',
        orderCount: userOrders.length,
        totalHalalas: userOrders.reduce((sum, o) => sum + o.totalHalalas, 0),
      };
    });

    // Per-category sales via order_items (includes deleted-item fallback)
    const paidOrderIds = paidOrders.map((o) => o.id);
    const oiRows = paidOrderIds.length > 0
      ? this.db.select().from(orderItems).where(inArray(orderItems.orderId, paidOrderIds)).all()
      : [];

    const allCategories = this.db.select().from(itemCategories).all();
    const catMap = new Map(allCategories.map((c) => [c.id, c.name]));
    const allItems = this.db.select({ id: items.id, categoryId: items.categoryId }).from(items).all();
    const itemCatMap = new Map(allItems.map((i) => [i.id, i.categoryId]));

    const catAgg = new Map<string, { itemCount: number; totalHalalas: number }>();
    for (const oi of oiRows) {
      const catId = oi.itemId ? (itemCatMap.get(oi.itemId) ?? null) : null;
      const catName = catId ? (catMap.get(catId) ?? 'Uncategorized') : 'Uncategorized';
      const key = catId === null ? 'null' : String(catId);
      if (!catAgg.has(key)) catAgg.set(key, { itemCount: 0, totalHalalas: 0 });
      const agg = catAgg.get(key)!;
      agg.itemCount += oi.qty;
      agg.totalHalalas += oi.totalHalalas;
    }

    const salesByCategory = Array.from(catAgg.entries()).map(([key, agg]) => ({
      categoryId: key === 'null' ? null : Number(key),
      categoryName: key === 'null' ? 'Uncategorized' : (catMap.get(Number(key)) ?? 'Uncategorized'),
      itemCount: agg.itemCount,
      totalHalalas: agg.totalHalalas,
    }));

    return {
      dayId: day.id,
      businessDate: day.businessDate,
      status: day.status,
      openingCashHalalas: day.openingCashHalalas,
      totalSalesHalalas,
      totalVatHalalas,
      paidOrderCount: paidOrders.length,
      sentOrderCount: sentOrders.length,
      openOrderCount: openOrders.length,
      voidedOrderCount: voidedOrders.length,
      salesByType,
      salesByUser,
      salesByCategory,
      paymentTotals: { cash: totalSalesHalalas },
    };
  }

  async getSalesRange(from: string, to: string) {
    const dayRows = this.db
      .select()
      .from(dayOpenings)
      .all();

    const filtered = dayRows.filter((d) => d.businessDate >= from && d.businessDate <= to);

    const results = filtered.map((d) => ({
      businessDate: d.businessDate,
      status: d.status,
      totalSalesHalalas: d.totalSalesHalalas ?? 0,
      totalVatHalalas: d.totalVatHalalas ?? 0,
      orderCount: d.orderCount ?? 0,
    }));

    return { days: results };
  }

  async getVatSummary(from: string, to: string) {
    const dayRows = this.db
      .select()
      .from(dayOpenings)
      .all()
      .filter((d) => d.businessDate >= from && d.businessDate <= to);

    const days = dayRows.map((d) => {
      const salesIncl = d.totalSalesHalalas ?? 0;
      const vat = d.totalVatHalalas ?? 0;
      const salesExcl = salesIncl - vat;
      return {
        businessDate: d.businessDate,
        salesExclHalalas: salesExcl,
        vatHalalas: vat,
        salesInclHalalas: salesIncl,
        orderCount: d.orderCount ?? 0,
      };
    });

    const grandTotal = days.reduce(
      (acc, d) => ({
        salesExclHalalas: acc.salesExclHalalas + d.salesExclHalalas,
        vatHalalas: acc.vatHalalas + d.vatHalalas,
        salesInclHalalas: acc.salesInclHalalas + d.salesInclHalalas,
        orderCount: acc.orderCount + d.orderCount,
      }),
      { salesExclHalalas: 0, vatHalalas: 0, salesInclHalalas: 0, orderCount: 0 },
    );

    return { days, grandTotal };
  }

  async printZReport(dayId: number): Promise<{ success: boolean; message: string }> {
    const report = await this.getZReport(dayId);
    const receiptPrinter = this.printersService.getActiveByRole('receipt');
    if (!receiptPrinter) {
      return { success: false, message: 'No active receipt printer configured' };
    }

    const restaurantName = this.printersService.getSetting('restaurant_name', 'SpicyHome');
    const builder = new ZReportBuilder();
    const buffer = builder.build({ ...report, restaurantName });
    await this.printersService.sendBuffer(receiptPrinter, buffer);
    return { success: true, message: 'Z-report printed' };
  }

  async printXReport(): Promise<{ success: boolean; message: string }> {
    const report = await this.getXReport();
    if ('error' in report) {
      return { success: false, message: report.error };
    }

    const receiptPrinter = this.printersService.getActiveByRole('receipt');
    if (!receiptPrinter) {
      return { success: false, message: 'No active receipt printer configured' };
    }

    const restaurantName = this.printersService.getSetting('restaurant_name', 'SpicyHome');
    const builder = new ZReportBuilder();
    const buffer = builder.build({
      ...report,
      closingCashHalalas: 0,
      restaurantName,
    });
    await this.printersService.sendBuffer(receiptPrinter, buffer);
    return { success: true, message: 'X-report printed' };
  }
}
