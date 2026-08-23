import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, inArray, and, isNull } from 'drizzle-orm';
import {
  orders,
  orderPayments,
  orderRefunds,
  paymentMethods,
  dayOpenings,
  users,
  tables,
  deliveryPartners,
} from '@spicyhome/db';
import { getServiceDayString } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { BusinessDayService } from '../business-day/business-day.service';
import { PrintersService } from '../printers/printers.service';
import { buildXReportBuffer, buildZReportBuffer } from '../printers/print-documents';
import { loadDayCategorySales } from './day-sales';
import { parseReportPeriod } from './report-period';
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
  openOrderCount: number;
  voidedOrderCount: number;
  salesByType: Record<string, { count: number; totalHalalas: number }>;
  salesByUser: Array<{
    userId: number;
    userName: string;
    orderCount: number;
    totalHalalas: number;
  }>;
  salesByCategory: Array<{
    categoryId: number | null;
    categoryName: string;
    itemCount: number;
    totalHalalas: number;
  }>;
  paymentTotals: Array<{ methodId: string; methodTitle: string; totalHalalas: number }>;
}

export interface ZReport extends XReport {
  closingCashHalalas: number;
}

export interface SalesRegisterTender {
  methodId: string;
  methodTitle: string;
  amountHalalas: number;
}

export interface SalesRegisterRow {
  kind: 'sale' | 'refund';
  postedAt: number;
  businessDate: string;
  documentId: string;
  orderId: number;
  refundId: number | null;
  orderNo: number;
  type: string;
  tableId: number | null;
  tableName: string | null;
  deliveryPartnerId: string | null;
  deliveryPartnerTitle: string | null;
  deliveryExternalRef: string | null;
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  tenders: SalesRegisterTender[];
  cashierUserId: number | null;
  cashierName: string;
  notes: string | null;
}

export interface SalesRegisterFooter {
  saleCount: number;
  refundCount: number;
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
}

export interface SalesRegisterResponse {
  rows: SalesRegisterRow[];
  footer: SalesRegisterFooter;
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

    const allOrders = this.db.select().from(orders).where(eq(orders.dayOpeningId, dayId)).all();

    const paidOrders = allOrders.filter((o) => o.status === 'paid');
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
    const userRows =
      userIds.length > 0
        ? this.db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, userIds as number[]))
            .all()
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

    const salesByCategory = loadDayCategorySales(
      this.db,
      paidOrders.map((o) => o.id),
    );

    // Per-method payment totals — include payments from both paid and refunded orders
    // (original money in still happened even if items were later refunded)
    const paidAndRefundedOrderIds = allOrders
      .filter((o) => o.status === 'paid' || o.status === 'refunded')
      .map((o) => o.id);

    const paymentTotals: Array<{ methodId: string; methodTitle: string; totalHalalas: number }> =
      [];
    if (paidAndRefundedOrderIds.length > 0) {
      const paymentRows = this.db
        .select({
          methodId: orderPayments.methodId,
          total: orderPayments.amountHalalas,
        })
        .from(orderPayments)
        .innerJoin(orders, eq(orderPayments.orderId, orders.id))
        .where(and(eq(orders.dayOpeningId, dayId), inArray(orders.id, paidAndRefundedOrderIds)))
        .all();

      // Aggregate by method_id
      const agg = new Map<string, number>();
      for (const row of paymentRows) {
        const cur = agg.get(row.methodId) ?? 0;
        agg.set(row.methodId, cur + row.total);
      }

      // Use current catalog title for display
      for (const [methodId, total] of agg.entries()) {
        const pm = this.db
          .select()
          .from(paymentMethods)
          .where(eq(paymentMethods.id, methodId))
          .get();
        paymentTotals.push({
          methodId,
          methodTitle: pm?.title ?? methodId,
          totalHalalas: total,
        });
      }
    }

    return {
      dayId: day.id,
      businessDate: day.businessDate,
      status: day.status,
      openingCashHalalas: day.openingCashHalalas,
      totalSalesHalalas,
      totalVatHalalas,
      paidOrderCount: paidOrders.length,
      openOrderCount: openOrders.length,
      voidedOrderCount: voidedOrders.length,
      salesByType,
      salesByUser,
      salesByCategory,
      paymentTotals,
    };
  }

  async getSalesRange(from: string, to: string) {
    const dayRows = this.db.select().from(dayOpenings).all();

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

  /**
   * Sales register — a document day-book of paid invoices (sales) and
   * refunds (credit notes) over a business-date range, filtered by document
   * **posting time** (earliest `order_payments.created_at` for sales,
   * `order_refunds.created_at` for refunds), not by `day_opening_id`.
   *
   * - One row per paid/refunded order that has at least one payment whose
   *   earliest `created_at` falls in `[from 05:00, (to+1) 05:00)` Asia/Riyadh.
   * - One row per refund whose `created_at` falls in the window (parent order
   *   any status — open/voided orders can never be refunded).
   * - Refund rows carry negative amounts and `notes = "Refund of <parent
   *   document id>"`. A later-refunded order keeps its sale row at pay time.
   * - Rows sort by `postedAt` ascending (day-book); ties: sale before refund,
   *   then `documentId`.
   */
  getSalesRegister(query: {
    from?: string;
    to?: string;
    type?: string;
    partner?: string;
    kind?: string;
  }): SalesRegisterResponse {
    const { startUnix, endUnix } = parseReportPeriod(query.from, query.to);

    if (query.type !== undefined && query.type !== 'dine_in' && query.type !== 'takeaway') {
      throw new BadRequestException(`Invalid type: ${query.type}`);
    }
    if (query.kind !== undefined && query.kind !== 'sale' && query.kind !== 'refund') {
      throw new BadRequestException(`Invalid kind: ${query.kind}`);
    }

    // Candidate parent orders: only paid/refunded orders can have produced a
    // payment or a refund. Order-level filters (type / partner) apply to the
    // parent order for both sales and refunds.
    const orderConditions: any[] = [inArray(orders.status, ['paid', 'refunded'])];
    if (query.type !== undefined) {
      orderConditions.push(eq(orders.type, query.type));
    }
    if (query.partner === 'none') {
      orderConditions.push(isNull(orders.deliveryPartnerId));
    } else if (query.partner !== undefined) {
      orderConditions.push(eq(orders.deliveryPartnerId, query.partner));
    }

    const candidateOrders = this.db
      .select()
      .from(orders)
      .where(and(...orderConditions))
      .all();
    if (candidateOrders.length === 0) {
      return { rows: [], footer: this.emptyFooter() };
    }
    const orderById = new Map(candidateOrders.map((o) => [o.id, o]));
    const orderIds = [...orderById.keys()];

    const tableMap = new Map(
      this.db
        .select({ id: tables.id, name: tables.name })
        .from(tables)
        .all()
        .map((t) => [t.id, t.name]),
    );
    const partnerMap = new Map(
      this.db
        .select({ id: deliveryPartners.id, title: deliveryPartners.title })
        .from(deliveryPartners)
        .all()
        .map((p) => [p.id, p.title]),
    );
    const userMap = new Map(
      this.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .all()
        .map((u) => [u.id, u.name]),
    );

    const rows: SalesRegisterRow[] = [];

    // ── Sales: earliest payment per order must post inside the window ────────
    if (query.kind !== 'refund') {
      const paymentRows = this.db
        .select()
        .from(orderPayments)
        .where(inArray(orderPayments.orderId, orderIds))
        .all();

      const paymentsByOrder = new Map<number, typeof paymentRows>();
      for (const p of paymentRows) {
        const list = paymentsByOrder.get(p.orderId) ?? [];
        list.push(p);
        paymentsByOrder.set(p.orderId, list);
      }

      for (const [orderId, payments] of paymentsByOrder) {
        const earliest = payments.reduce((min, p) =>
          p.createdAt < min.createdAt || (p.createdAt === min.createdAt && p.id < min.id) ? p : min,
        );
        if (earliest.createdAt < startUnix || earliest.createdAt >= endUnix) continue;

        const order = orderById.get(orderId)!;
        rows.push({
          kind: 'sale',
          postedAt: earliest.createdAt,
          businessDate: getServiceDayString(earliest.createdAt * 1000),
          documentId: order.documentId,
          orderId: order.id,
          refundId: null,
          orderNo: order.orderNo,
          type: order.type,
          tableId: order.tableId,
          tableName: order.tableId != null ? (tableMap.get(order.tableId) ?? null) : null,
          deliveryPartnerId: order.deliveryPartnerId,
          deliveryPartnerTitle:
            order.deliveryPartnerId != null
              ? (partnerMap.get(order.deliveryPartnerId) ?? null)
              : null,
          deliveryExternalRef: order.deliveryExternalRef,
          subtotalHalalas: order.subtotalHalalas,
          vatHalalas: order.vatHalalas,
          totalHalalas: order.totalHalalas,
          tenders: payments.map((p) => ({
            methodId: p.methodId,
            methodTitle: p.methodTitle,
            amountHalalas: p.amountHalalas,
          })),
          cashierUserId: earliest.createdBy,
          cashierName:
            earliest.createdBy != null ? (userMap.get(earliest.createdBy) ?? 'Unknown') : 'Unknown',
          notes: order.notes,
        });
      }
    }

    // ── Refunds: refund posting time is order_refunds.created_at ─────────────
    if (query.kind !== 'sale') {
      const refundRows = this.db
        .select()
        .from(orderRefunds)
        .where(inArray(orderRefunds.orderId, orderIds))
        .all()
        .filter((r) => r.createdAt >= startUnix && r.createdAt < endUnix);

      for (const refund of refundRows) {
        const order = orderById.get(refund.orderId)!;
        rows.push({
          kind: 'refund',
          postedAt: refund.createdAt,
          businessDate: getServiceDayString(refund.createdAt * 1000),
          documentId: refund.documentId,
          orderId: order.id,
          refundId: refund.id,
          orderNo: order.orderNo,
          type: order.type,
          tableId: order.tableId,
          tableName: order.tableId != null ? (tableMap.get(order.tableId) ?? null) : null,
          deliveryPartnerId: order.deliveryPartnerId,
          deliveryPartnerTitle:
            order.deliveryPartnerId != null
              ? (partnerMap.get(order.deliveryPartnerId) ?? null)
              : null,
          deliveryExternalRef: order.deliveryExternalRef,
          subtotalHalalas: -refund.subtotalHalalas,
          vatHalalas: -refund.vatHalalas,
          totalHalalas: -refund.totalHalalas,
          tenders: [
            {
              methodId: refund.methodId,
              methodTitle: refund.methodTitle,
              amountHalalas: refund.totalHalalas,
            },
          ],
          cashierUserId: refund.userId,
          cashierName: userMap.get(refund.userId) ?? 'Unknown',
          notes: `Refund of ${order.documentId}`,
        });
      }
    }

    // Day-book order: postedAt ascending; ties — sale before refund, then documentId.
    rows.sort((a, b) => {
      if (a.postedAt !== b.postedAt) return a.postedAt - b.postedAt;
      const aKind = a.kind === 'sale' ? 0 : 1;
      const bKind = b.kind === 'sale' ? 0 : 1;
      if (aKind !== bKind) return aKind - bKind;
      return a.documentId.localeCompare(b.documentId);
    });

    const footer = rows.reduce<SalesRegisterFooter>(
      (acc, r) => {
        if (r.kind === 'sale') acc.saleCount++;
        else acc.refundCount++;
        acc.subtotalHalalas += r.subtotalHalalas;
        acc.vatHalalas += r.vatHalalas;
        acc.totalHalalas += r.totalHalalas;
        return acc;
      },
      { saleCount: 0, refundCount: 0, subtotalHalalas: 0, vatHalalas: 0, totalHalalas: 0 },
    );

    return { rows, footer };
  }

  private emptyFooter(): SalesRegisterFooter {
    return { saleCount: 0, refundCount: 0, subtotalHalalas: 0, vatHalalas: 0, totalHalalas: 0 };
  }

  async printZReport(dayId: number): Promise<{ success: boolean; message: string }> {
    await this.getZReport(dayId);
    const receiptPrinter = this.printersService.getActiveByRole('receipt');
    if (!receiptPrinter) {
      return { success: false, message: 'No active receipt printer configured' };
    }

    const buffer = buildZReportBuffer(this.db, dayId);
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

    const buffer = buildXReportBuffer(this.db, report.dayId);
    await this.printersService.sendBuffer(receiptPrinter, buffer);
    return { success: true, message: 'X-report printed' };
  }
}
