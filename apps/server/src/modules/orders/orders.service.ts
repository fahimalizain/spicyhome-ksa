import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { eq, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  orders,
  orderItems,
  orderRefunds,
  orderRefundItems,
  orderPayments,
  paymentMethods,
  deliveryPartners,
  tables,
  dayOpenings,
  settings,
  items,
} from '@spicyhome/db';
import {
  decomposeVat,
  parseZatcaBuyerDetails,
  formatZatcaBuyerDetailsErrors,
  AuditAction,
} from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import { mapBools } from '../../common/bool-mapper.helper';
import { OrderEventsService } from './order-events.service';
import { PrintJobService } from '../printers/print-job.service';
import { DocumentIdService } from './document-id.allocator';
import { ZatcaBuyerDetailsDto } from './dto/zatca-buyer-details.dto';
import { ZatcaStandardInvoiceService } from '../zatca/zatca-standard-invoice.service';
import type { PrinterRecord } from '../printers/printers.service';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

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

function normalizeExternalRef(r: string | null | undefined): string | null {
  if (r == null) return null;
  const trimmed = r.trim();
  return trimmed === '' ? null : trimmed;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private eventEmitter: EventEmitter2,
    private printJobService: PrintJobService,
    private orderEvents: OrderEventsService,
    private documentIdService: DocumentIdService,
    private zatcaStandardService: ZatcaStandardInvoiceService,
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
      const documentId = this.documentIdService.allocateInvoiceDocumentId(tx);

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
          documentId,
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
          documentId,
        },
        now,
      );

      return { id: orderId, uuid: orderUuid, orderNo, documentId };
    });

    this.emitDomainEvent('order.created', result.id, userId);
    return result;
  }

  async updateOrderMeta(
    orderId: number,
    dto: { baseUpdatedAt: number; type: 'dine_in' | 'takeaway'; tableId?: number },
    userId: number,
  ) {
    const now = Math.floor(Date.now() / 1000);

    // Normalize intended state outside the transaction (read-only, stable
    // data). Table catalog is stable, so 404 for a bad table before the tx
    // is safe and keeps the error simpler.
    const toType = dto.type;
    let toTableId: number | null;

    if (toType === 'takeaway') {
      // Issue D4: takeaway never holds a table — force-release regardless of
      // what the client sent (ignore non-null tableId).
      toTableId = null;
    } else {
      // dine_in requires a table
      if (!dto.tableId) {
        throw new BadRequestException('Table is required for dine-in orders');
      }
      const table = this.db.select().from(tables).where(eq(tables.id, dto.tableId)).get();
      if (!table || !table.isActive) throw new NotFoundException('Table not found or inactive');
      toTableId = dto.tableId;
    }

    // All order state checks + the mutation happen inside ONE transaction to
    // close the TOCTOU window between loading and writing (same style as
    // syncItems).
    let anyMutation = false;

    this.db.transaction((tx: any) => {
      // Load order; 404 if missing
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');

      // Only open orders can change type or table
      if (order.status !== 'open') {
        throw new BadRequestException('Only open orders can change type or table');
      }

      // Concurrency check — same shape as syncItems stale conflict
      if (order.updatedAt !== dto.baseUpdatedAt) {
        throw new ConflictException({
          message: 'Order was modified by another terminal. Please refresh your cart.',
          updatedAt: order.updatedAt,
        });
      }

      const fromType = order.type;
      const fromTableId = order.tableId ?? null;

      // No-op: same type + same table → return current order without bumping
      // updated_at or writing an event.
      if (fromType === toType && fromTableId === toTableId) {
        const refreshedOrder = tx.select().from(orders).where(eq(orders.id, orderId)).get();
        const refreshedItems = tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId))
          .all();
        const logs = this.orderEvents.getEvents(tx, orderId);
        return { ...refreshedOrder, items: refreshedItems, events: logs };
      }

      // Prevent another open order from holding the target table (exclude self)
      if (toTableId != null) {
        const existingOpen = tx
          .select({ id: orders.id, orderNo: orders.orderNo })
          .from(orders)
          .where(and(eq(orders.tableId, toTableId), eq(orders.status, 'open')))
          .all()
          .filter((o: any) => o.id !== orderId);
        if (existingOpen.length > 0) {
          throw new ConflictException(
            `Table already has an open order #${existingOpen[0].orderNo} (id ${existingOpen[0].id}).`,
          );
        }
      }

      anyMutation = true;

      tx.update(orders)
        .set({
          type: toType,
          tableId: toTableId,
          ...updateAuditFields(userId, now),
        })
        .where(eq(orders.id, orderId))
        .run();

      this.orderEvents.createEvent(
        tx,
        orderId,
        userId,
        'type_changed',
        {
          fromType,
          toType,
          fromTableId,
          toTableId,
        },
        now,
      );

      // ADR 0007: takeaway → dine_in (and any other patch that ends up
      // dine_in) clears the delivery partner + external ref and resets every
      // line price to the live catalog — a dine-in order is always at menu
      // prices. The existing type_changed payload is unchanged; the partner
      // clear and price resets are recorded as their own events.
      if (toType === 'dine_in') {
        const hadPartner = order.deliveryPartnerId != null;
        if (hadPartner || order.deliveryExternalRef != null) {
          tx.update(orders)
            .set({
              deliveryPartnerId: null,
              deliveryExternalRef: null,
              ...updateAuditFields(userId, now),
            })
            .where(eq(orders.id, orderId))
            .run();
        }

        const resetItemCount = this.resetLinePricesToCatalog(
          tx,
          orderId,
          userId,
          'type_changed_to_dine_in',
          now,
        );

        if (hadPartner) {
          this.orderEvents.createEvent(
            tx,
            orderId,
            userId,
            AuditAction.DELIVERY_PARTNER_CHANGED,
            {
              fromPartnerId: order.deliveryPartnerId,
              toPartnerId: null,
              fromPartnerTitle: this.getPartnerTitle(tx, order.deliveryPartnerId),
              toPartnerTitle: null,
              fromExternalRef: order.deliveryExternalRef ?? null,
              toExternalRef: null,
              resetItemCount,
            },
            now,
          );
        }
      }

      const refreshedOrder = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      const refreshedItems = tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .all();
      const logs = this.orderEvents.getEvents(tx, orderId);
      return { ...refreshedOrder, items: refreshedItems, events: logs };
    });

    // Only emit for an actual mutation — no-op returns without writing or emitting
    if (anyMutation) {
      this.emitDomainEvent('order.updated', orderId, userId);
    }
    // Reuse getOrder's mapping so the response always matches OrderResponse:
    // isStandardInvoice as a real boolean, payments array, zatcaBuyerDetails.
    return this.getOrder(orderId);
  }

  /**
   * PATCH /orders/:id/partner — set / clear / change the delivery partner
   * and external ref on an open order (ADR 0007).
   *
   * Rules (implemented exactly as the ADR table):
   *
   * - open orders only → else 400
   * - set/change partner: order type must be `takeaway` (dine_in → 400 with
   *   guidance) and the partner must exist and be enabled (else 400);
   *   line prices are NEVER touched on set/change
   * - clear partner (`deliveryPartnerId: null`): resets every line's
   *   `unit_price_halalas` to the live catalog and recomputes totals; the
   *   external ref is force-nulled; lines with `item_id` NULL keep their
   *   current price and get no reset event
   * - ref-only edit (`deliveryPartnerId` omitted): allowed when a partner is
   *   already set; without a partner the ref is ignored/force-nulled (no-op)
   * - stale `baseUpdatedAt` → 409 `{ message, updatedAt }`
   *
   * Audit: writes `delivery_partner_changed` (set/change/clear/ref-only) and,
   * on clear, one `item_price_reset` per actually-changed line with
   * `reason: 'partner_cleared'`. Emits `order.updated` on mutation.
   */
  async updateOrderPartner(
    orderId: number,
    dto: {
      baseUpdatedAt: number;
      deliveryPartnerId?: string | null;
      deliveryExternalRef?: string | null;
    },
    userId: number,
  ) {
    const now = Math.floor(Date.now() / 1000);
    let anyMutation = false;

    this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');

      // Status gate — open orders only (ADR 0007)
      if (order.status !== 'open') {
        throw new BadRequestException('Only open orders can change the delivery partner');
      }

      // Concurrency — same 409 shape as syncItems / updateOrderMeta
      if (order.updatedAt !== dto.baseUpdatedAt) {
        throw new ConflictException({
          message: 'Order was modified by another terminal. Please refresh your cart.',
          updatedAt: order.updatedAt,
        });
      }

      const fromPartnerId = order.deliveryPartnerId ?? null;
      const fromExternalRef = order.deliveryExternalRef ?? null;
      const snapshot = () => {
        const refreshedOrder = tx.select().from(orders).where(eq(orders.id, orderId)).get();
        const refreshedItems = tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId))
          .all();
        const logs = this.orderEvents.getEvents(tx, orderId);
        return { ...refreshedOrder, items: refreshedItems, events: logs };
      };

      // ── Clear the partner (deliveryPartnerId: null) ──────────────────────
      if (dto.deliveryPartnerId === null) {
        // Already clear → no-op (the ref is always null without a partner).
        if (fromPartnerId === null) return snapshot();

        anyMutation = true;

        // Clear partner + force-null the external ref (a ref has no meaning
        // without a partner).
        tx.update(orders)
          .set({
            deliveryPartnerId: null,
            deliveryExternalRef: null,
            ...updateAuditFields(userId, now),
          })
          .where(eq(orders.id, orderId))
          .run();

        // Reset every line price to the live catalog + recompute totals.
        const resetItemCount = this.resetLinePricesToCatalog(
          tx,
          orderId,
          userId,
          'partner_cleared',
          now,
        );

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          AuditAction.DELIVERY_PARTNER_CHANGED,
          {
            fromPartnerId,
            toPartnerId: null,
            fromPartnerTitle: this.getPartnerTitle(tx, fromPartnerId),
            toPartnerTitle: null,
            fromExternalRef,
            toExternalRef: null,
            resetItemCount,
          },
          now,
        );

        return snapshot();
      }

      // ── Set / change the partner (deliveryPartnerId: <slug>) ─────────────
      if (dto.deliveryPartnerId !== undefined) {
        const toPartnerId = dto.deliveryPartnerId;

        // A partner only makes sense on a takeaway order (ADR 0007).
        if (order.type !== 'takeaway') {
          throw new BadRequestException('Set order type to takeaway first');
        }

        // Partner must exist and be enabled.
        const partner = tx
          .select()
          .from(deliveryPartners)
          .where(eq(deliveryPartners.id, toPartnerId))
          .get();
        if (!partner) {
          throw new BadRequestException(`Unknown delivery partner "${toPartnerId}"`);
        }
        if (!partner.enabled) {
          throw new BadRequestException(`Delivery partner "${toPartnerId}" is disabled`);
        }

        const toExternalRef =
          dto.deliveryExternalRef === undefined
            ? fromExternalRef
            : normalizeExternalRef(dto.deliveryExternalRef);

        // No-op: same partner and same ref.
        if (toPartnerId === fromPartnerId && toExternalRef === fromExternalRef) {
          return snapshot();
        }

        anyMutation = true;

        // Set/change NEVER touches line prices (ADR 0007). The ref is
        // updated only when the body actually carries it.
        tx.update(orders)
          .set({
            deliveryPartnerId: toPartnerId,
            ...(dto.deliveryExternalRef !== undefined
              ? { deliveryExternalRef: toExternalRef }
              : {}),
            ...updateAuditFields(userId, now),
          })
          .where(eq(orders.id, orderId))
          .run();

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          AuditAction.DELIVERY_PARTNER_CHANGED,
          {
            fromPartnerId,
            toPartnerId,
            fromPartnerTitle: this.getPartnerTitle(tx, fromPartnerId),
            toPartnerTitle: partner.title,
            fromExternalRef,
            toExternalRef,
            resetItemCount: 0,
          },
          now,
        );

        return snapshot();
      }

      // ── Ref-only edit (deliveryPartnerId omitted) ────────────────────────
      // No ref in the body → nothing was requested at all → no-op.
      if (dto.deliveryExternalRef === undefined) {
        return snapshot();
      }

      const toExternalRef = normalizeExternalRef(dto.deliveryExternalRef);
      if (toExternalRef === fromExternalRef) {
        // No change → no-op.
        return snapshot();
      }

      // A ref without a partner is meaningless — ignore/force-null (it is
      // already null here) and treat as a no-op (ADR 0007).
      if (fromPartnerId === null) return snapshot();

      anyMutation = true;

      tx.update(orders)
        .set({ deliveryExternalRef: toExternalRef, ...updateAuditFields(userId, now) })
        .where(eq(orders.id, orderId))
        .run();

      this.orderEvents.createEvent(
        tx,
        orderId,
        userId,
        AuditAction.DELIVERY_PARTNER_CHANGED,
        {
          fromPartnerId,
          toPartnerId: fromPartnerId,
          fromPartnerTitle: this.getPartnerTitle(tx, fromPartnerId),
          toPartnerTitle: this.getPartnerTitle(tx, fromPartnerId),
          fromExternalRef,
          toExternalRef,
          resetItemCount: 0,
        },
        now,
      );

      return snapshot();
    });

    // Only emit for an actual mutation — no-op returns without writing or emitting
    if (anyMutation) {
      this.emitDomainEvent('order.updated', orderId, userId);
    }
    // Reuse getOrder's mapping so the response always matches OrderResponse
    return this.getOrder(orderId);
  }

  /**
   * ADR 0007 price reset — set every order line's `unit_price_halalas` to
   * the live catalog price (`items.price_halalas`) and recompute the order
   * totals. Shared by the clear-partner endpoint and the takeaway → dine_in
   * type-change path.
   *
   * - Lines whose `item_id` is NULL keep their current unit price (there is
   *   no catalog price to reset to) and get no reset event.
   * - Lines already at the catalog price are untouched.
   * - One `item_price_reset` event is written per actually-changed line.
   *
   * Returns the number of lines actually changed (the caller reports it as
   * `resetItemCount` in the `delivery_partner_changed` payload).
   */
  private resetLinePricesToCatalog(
    tx: any,
    orderId: number,
    userId: number,
    reason: 'partner_cleared' | 'type_changed_to_dine_in',
    now: number,
  ): number {
    const rows: Array<any> = tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .all();

    const itemIds = [...new Set(rows.map((r) => r.itemId).filter((x): x is number => x != null))];
    const catalogPrices = new Map<number, number>();
    if (itemIds.length > 0) {
      const catalogRows = tx
        .select({ id: items.id, priceHalalas: items.priceHalalas })
        .from(items)
        .where(inArray(items.id, itemIds))
        .all();
      for (const c of catalogRows) catalogPrices.set(c.id, c.priceHalalas);
    }

    let changed = 0;
    for (const oi of rows) {
      if (oi.itemId == null) continue;
      const catalogPrice = catalogPrices.get(oi.itemId);
      // Missing catalog row (item hard-deleted after the line snapshot) →
      // keep the current price, same as item_id NULL.
      if (catalogPrice === undefined || catalogPrice === oi.unitPriceHalalas) continue;

      tx.update(orderItems)
        .set({
          unitPriceHalalas: catalogPrice,
          totalHalalas: catalogPrice * oi.qty,
          ...updateAuditFields(userId, now),
        })
        .where(eq(orderItems.id, oi.id))
        .run();

      this.orderEvents.createEvent(
        tx,
        orderId,
        userId,
        AuditAction.ITEM_PRICE_RESET,
        {
          orderItemId: oi.id,
          itemId: oi.itemId,
          fromUnitPriceHalalas: oi.unitPriceHalalas,
          toUnitPriceHalalas: catalogPrice,
          reason,
        },
        now,
      );
      changed++;
    }

    if (changed > 0) {
      this.recomputeAndUpdateOrderTotals(tx, orderId, now, userId);
    }
    return changed;
  }

  /** Look up a delivery partner's title by slug (null when unset/unknown). */
  private getPartnerTitle(tx: any, partnerId: string | null): string | null {
    if (!partnerId) return null;
    const partner = tx
      .select({ title: deliveryPartners.title })
      .from(deliveryPartners)
      .where(eq(deliveryPartners.id, partnerId))
      .get();
    return partner?.title ?? null;
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
    clientType?: string,
  ) {
    const now = Math.floor(Date.now() / 1000);

    // Track whether any mutation (remove/update/insert) occurred
    let anyMutation = false;

    this.db.transaction((tx: any) => {
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

      // ADR 0005: Android cannot reduce qty below the current DB qty or
      // remove server lines. Compare against the DB inside the transaction
      // (after the concurrency check) and reject the ENTIRE sync — no
      // partial apply. POS (or tokens without a clientType claim) keep
      // full decrease/remove power.
      if (clientType === 'android') {
        for (const existing of existingItems) {
          if (!desiredIds.has(existing.id)) {
            throw new BadRequestException('Kitchen items can only be reduced at the cashier.');
          }
        }
        for (const line of desiredLines) {
          if (line.orderItemId != null) {
            const oi = existingMap.get(line.orderItemId);
            if (oi && line.qty < oi.qty) {
              throw new BadRequestException('Kitchen items can only be reduced at the cashier.');
            }
          }
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

          // ADR 0006: item mutations NEVER kitchen-print. The ledger records
          // kitchenPrintedQty: 0; send-to-kitchen is the only path that
          // enqueues kitchen prints (computing deltas against this ledger).
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
              kitchenPrintedQty: 0,
              ...(notesChanged ? { notes: desiredNotes } : {}),
            },
            now,
          );
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
              itemNameAr: item.nameAr ?? null,
              unitPriceHalalas: item.priceHalalas,
              vatRateBp: item.vatRateBp,
              qty: line.qty,
              totalHalalas,
              notes: normalizedNotes,
              ...createAuditFields(userId, now),
            })
            .run();

          const orderItemId = Number(insertResult.lastInsertRowid);

          // ADR 0006: item mutations NEVER kitchen-print. The item_added event
          // records kitchenPrintedQty: 0; send-to-kitchen is the only path
          // that enqueues kitchen prints.
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
              kitchenPrintedQty: 0,
              ...(normalizedNotes ? { notes: normalizedNotes } : {}),
            },
            now,
          );
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

    if (anyMutation) {
      this.emitDomainEvent('order.updated', orderId, userId);
    }
    // Reuse getOrder's mapping so the response always matches OrderResponse:
    // isStandardInvoice as a real boolean, payments array, zatcaBuyerDetails.
    return this.getOrder(orderId);
  }

  /**
   * Explicit, differential kitchen print (ADR 0006).
   *
   * Item mutations NEVER kitchen-print — this endpoint is the ONLY path that
   * enqueues/runs kitchen prints. It computes, per order item with `qty > 0`,
   * the delta between the current qty and the ledger's printed total
   * (`getPrintedQty`: legacy `kitchenPrintedQty` on item events +
   * `items[].printedQty` on `kitchen_print_enqueued` events), groups the
   * deltas by kitchen printer, and inside a transaction:
   *
   * - bumps `orders.updated_at` (so the POS can detect the change)
   * - writes one `kitchen_print_enqueued` event per printer
   *   (`{ printer, printerId, items: [{ orderItemId, itemName, printedQty }] }`)
   * - does NOT write fake `item_updated` events
   *
   * After the transaction: non-blocking `runKitchenPrint` per printer
   * (→ `kitchen_print_succeeded`) and emits `order.updated`.
   *
   * No deltas at all (or no kitchen printer configured) → 200 no-op: no
   * events, no print, no `updated_at` bump, no domain event. The response is
   * the current order (same shape as every other order endpoint).
   *
   * Permission: `update_order` (see ADR 0006 permission note).
   */
  async sendToKitchen(orderId: number, userId: number) {
    const now = Math.floor(Date.now() / 1000);

    // Fast pre-check outside the transaction (same pattern as syncItems) —
    // the authoritative status check is repeated inside the transaction.
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'open') {
      throw new BadRequestException('Order is not open');
    }

    // Printer groups hoisted from the transaction for the post-commit prints.
    let groups: Array<{
      printer: PrinterRecord;
      items: Array<{ orderItemId: number; itemName: string; printedQty: number }>;
    }> = [];

    const anySent = this.db.transaction((tx: any) => {
      // Re-check inside the tx to close the TOCTOU window
      const fresh = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!fresh) throw new NotFoundException('Order not found');
      if (fresh.status !== 'open') throw new BadRequestException('Order is not open');

      const itemRows = tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();

      // Differential math vs the immutable ledger — only unsent qty prints
      const deltas: Array<{
        orderItemId: number;
        itemId: number;
        itemName: string;
        printedQty: number;
      }> = [];
      for (const oi of itemRows) {
        if (oi.itemId == null || oi.qty <= 0) continue;
        const previousPrinted = this.orderEvents.getPrintedQty(tx, oi.id);
        const delta = oi.qty - previousPrinted;
        if (delta > 0) {
          deltas.push({
            orderItemId: oi.id,
            itemId: oi.itemId,
            itemName: oi.itemName,
            printedQty: delta,
          });
        }
      }

      // No deltas → 200 no-op (no events, no print)
      if (deltas.length === 0) return false;

      // Group deltas by kitchen printer via existing menu-item routing
      const byPrinter = new Map<
        string,
        {
          printer: PrinterRecord;
          items: Array<{ orderItemId: number; itemName: string; printedQty: number }>;
        }
      >();
      for (const d of deltas) {
        const printer = this.printJobService.getKitchenPrinterForItem(d.itemId);
        if (!printer) continue;
        const key = printer.name;
        let entry = byPrinter.get(key);
        if (!entry) {
          entry = { printer, items: [] };
          byPrinter.set(key, entry);
        }
        entry.items.push({
          orderItemId: d.orderItemId,
          itemName: d.itemName,
          printedQty: d.printedQty,
        });
      }

      // Deltas exist but no kitchen printer configured → nothing to enqueue
      if (byPrinter.size === 0) return false;

      // Bump order audit fields so concurrent terminals (POS) see the change
      tx.update(orders)
        .set({ ...updateAuditFields(userId, now) })
        .where(eq(orders.id, orderId))
        .run();

      // One kitchen_print_enqueued per printer (same payload shape as the
      // pre-ADR syncItems path — getPrintedQty feeds off these)
      for (const [, entry] of byPrinter) {
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

      groups = [...byPrinter.values()];
      return true;
    });

    // After transaction: non-blocking kitchen prints — one ticket per printer
    if (anySent) {
      for (const entry of groups) {
        this.runKitchenPrint(orderId, entry.printer, entry.items, userId);
      }
      this.emitDomainEvent('order.updated', orderId, userId);
    }

    // Reuse getOrder's mapping so the response always matches OrderResponse
    return this.getOrder(orderId);
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

  /**
   * Finalize an open order (ADR 0006) — the ONLY `open → paid` path.
   *
   * Payments are appended separately via `addOrderPayment`; this method
   * validates the ADR preconditions inside a transaction and, on success,
   * transitions the order to `paid`, writes the `paid` ledger event, and
   * triggers receipt print / cash drawer kick:
   *
   * - order exists and status is `open` (else 400)
   * - optional `baseUpdatedAt` concurrency check (stale → 409, same shape as
   *   syncItems / updateOrderMeta)
   * - ≥ 1 order item (else 400)
   * - `SUM(order_payments.amount_halalas) === order.total_halalas` — the
   *   outstanding must be exactly 0 (else 400)
   * - every payment method nets ≥ 0 — a negative method net is rejected
   *   (else 400); the ZATCA PaymentMeans are netted per method, zero nets
   *   dropped
   *
   * Receipt logic (unchanged from the old pay flow):
   * - `hasCashPayment` = any payment line with `methodId === 'cash'` and a
   *   positive amount (drawer kick if any positive cash line exists)
   * - simplified: enqueue + run receipt print with `kickDrawer = hasCashPayment`
   * - standard: deferred receipt (prints on ZATCA clearance); immediate
   *   cash drawer kick when `hasCashPayment`
   *
   * Emits `order.paid` and returns `{ success, status: 'paid', invoiceType }`.
   */
  async submitOrder(
    orderId: number,
    userId: number,
    dto: {
      baseUpdatedAt?: number;
      isStandardInvoice?: boolean;
      zatcaBuyerDetails?: ZatcaBuyerDetailsDto;
    },
  ) {
    const now = Math.floor(Date.now() / 1000);
    const receiptPrinter = this.printJobService.getReceiptPrinter();

    // Validate standard invoice buyer fields outside transaction
    const validatedBuyer = this.validateStandardInvoiceBuyer(dto);
    const isStandardInvoice = dto.isStandardInvoice === true;

    // Set inside the transaction from the payment lines actually on the order
    let hasCashPayment = false;

    this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');

      if (order.status !== 'open') {
        throw new BadRequestException(
          `Cannot submit order in '${order.status}' status. Only open orders can be submitted.`,
        );
      }

      // Optional concurrency check — same 409 shape as syncItems / updateOrderMeta
      if (dto.baseUpdatedAt !== undefined && dto.baseUpdatedAt !== null) {
        if (order.updatedAt !== dto.baseUpdatedAt) {
          throw new ConflictException({
            message: 'Order was modified by another terminal. Please refresh your cart.',
            updatedAt: order.updatedAt,
          });
        }
      }

      // ADR 0006 precondition: ≥ 1 order item
      const itemRows = tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .all();
      if (itemRows.length === 0) {
        throw new BadRequestException('Cannot submit an order without items');
      }

      // Load all payment lines (append ledger — nothing is inserted here)
      const paymentRows = tx
        .select()
        .from(orderPayments)
        .where(eq(orderPayments.orderId, orderId))
        .orderBy(orderPayments.id)
        .all();

      // ADR 0006 precondition: outstanding must be exactly 0
      const sumAmounts = paymentRows.reduce((sum: number, r: any) => sum + r.amountHalalas, 0);
      if (sumAmounts !== order.totalHalalas) {
        const outstanding = order.totalHalalas - sumAmounts;
        throw new BadRequestException(
          `Payment sum (${sumAmounts}) does not equal order total (${order.totalHalalas}). Outstanding ${outstanding} halalas.`,
        );
      }

      // ADR 0006 precondition: every method must net ≥ 0 (negative nets are
      // rejected here; ZATCA PaymentMeans net per method, zeros dropped)
      const netsByMethod = new Map<string, number>();
      for (const p of paymentRows) {
        netsByMethod.set(p.methodId, (netsByMethod.get(p.methodId) ?? 0) + p.amountHalalas);
      }
      for (const [methodId, net] of netsByMethod) {
        if (net < 0) {
          throw new BadRequestException(
            `Payment method "${methodId}" nets negative (${net} halalas). Add balancing lines before submitting.`,
          );
        }
      }

      // Drawer kick if any POSITIVE cash line exists (card-only stays closed)
      hasCashPayment = paymentRows.some((p: any) => p.methodId === 'cash' && p.amountHalalas > 0);

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

      // Write paid event with the FULL raw payment ledger (audit) plus the
      // netted per-method breakdown and standard invoice flag if applicable
      const paidPayload: Record<string, any> = {
        fromStatus: 'open',
        toStatus: 'paid',
        payments: paymentRows.map((p: any) => ({
          paymentId: p.id,
          methodId: p.methodId,
          methodTitle: p.methodTitle,
          zatcaPaymentMeansCode: p.zatcaPaymentMeansCode,
          amountHalalas: p.amountHalalas,
          ...(p.tenderedHalalas !== null && p.tenderedHalalas !== undefined
            ? { tenderedHalalas: p.tenderedHalalas, changeHalalas: p.changeHalalas }
            : {}),
        })),
        netPayments: [...netsByMethod.entries()]
          .map(([methodId, amountHalalas]) => ({ methodId, amountHalalas }))
          .filter((n) => n.amountHalalas > 0),
      };
      if (isStandardInvoice) {
        paidPayload.isStandardInvoice = true;
        const buyer = validatedBuyer as Record<string, unknown>;
        paidPayload.buyerVatNumber = buyer.vatNumber;
        paidPayload.buyerName = buyer.name;
      }

      this.orderEvents.createEvent(tx, orderId, userId, 'paid', paidPayload, now);

      // Receipt print enqueued with conditional kickDrawer
      // For standard invoices: do NOT enqueue receipt print here — deferred
      // until ZATCA clearance succeeds (see onZatcaInvoiceCleared).
      if (receiptPrinter && !isStandardInvoice) {
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

      // For standard invoices with cash payment: kick cash drawer immediately
      // on submit (ops requirement). The tax receipt with QR prints later on
      // clearance, with kickDrawer:false since we already kicked here.
      if (isStandardInvoice && hasCashPayment && receiptPrinter) {
        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'cash_drawer_kick_enqueued',
          {
            printer: receiptPrinter.name,
            printerId: receiptPrinter.id,
          },
          now,
        );
      }
    });

    // After transaction: non-blocking receipt print (simplified only)
    if (receiptPrinter && !isStandardInvoice) {
      this.runReceiptPrint(orderId, receiptPrinter, userId, hasCashPayment);
    }

    // For standard invoices: kick cash drawer immediately if needed
    if (isStandardInvoice && hasCashPayment && receiptPrinter) {
      this.kickCashDrawer(receiptPrinter, orderId, userId);
    }

    this.emitDomainEvent('order.paid', orderId, userId);
    return {
      success: true,
      status: 'paid',
      ...(isStandardInvoice ? { invoiceType: 'standard' } : { invoiceType: 'simplified' }),
    };
  }

  /**
   * Append ONE payment line to an open order (ADR 0006).
   *
   * The order stays `open` — no status change, no invoice, no receipt.
   * `amountHalalas` is a signed integer: negative lines are corrections
   * (balancing lines). Rules enforced inside the transaction:
   *
   * - order must exist, be `open`, and have ≥ 1 order item
   * - `amountHalalas !== 0`
   * - payment method must exist and be enabled
   * - cash tendered/change only on positive cash lines (same semantics as pay)
   * - after the append, `SUM(order_payments.amount_halalas) >= 0`
   *
   * Emits `order.updated` (not `order.paid`) so other terminals refresh.
   */
  async addOrderPayment(
    orderId: number,
    userId: number,
    dto: { methodId: string; amountHalalas: number; tenderedHalalas?: number },
  ): Promise<any> {
    const now = Math.floor(Date.now() / 1000);

    this.db.transaction((tx: any) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundException('Order not found');

      if (order.status !== 'open') {
        throw new BadRequestException(
          `Cannot add payment to order in '${order.status}' status. Only open orders accept payments.`,
        );
      }

      // ADR 0006: ≥ 1 order item required to add a payment
      const itemRows = tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .all();
      if (itemRows.length === 0) {
        throw new BadRequestException('Cannot add a payment to an order without items');
      }

      const amount = dto.amountHalalas;
      if (amount === 0) {
        throw new BadRequestException('Payment amount must be non-zero');
      }

      // Payment method must exist and be enabled
      const pm = tx.select().from(paymentMethods).where(eq(paymentMethods.id, dto.methodId)).get();
      if (!pm) {
        throw new BadRequestException(`Unknown payment method "${dto.methodId}"`);
      }
      if (!pm.enabled) {
        throw new BadRequestException(`Payment method "${dto.methodId}" is disabled`);
      }

      // Cash / non-cash tendered rules (same semantics as the removed /pay flow)
      let tendered: number | null = null;
      let change: number | null = null;
      if (dto.methodId !== 'cash') {
        if (dto.tenderedHalalas !== undefined && dto.tenderedHalalas !== null) {
          throw new BadRequestException(
            `Tendered amount is only valid for cash payments (method "${dto.methodId}")`,
          );
        }
      } else if (amount > 0) {
        // Positive cash: tendered optional; if present must be >= amount
        if (dto.tenderedHalalas !== undefined && dto.tenderedHalalas !== null) {
          if (dto.tenderedHalalas < amount) {
            throw new BadRequestException(
              `Cash tendered amount (${dto.tenderedHalalas}) must be >= payment amount (${amount})`,
            );
          }
          tendered = dto.tenderedHalalas;
          change = tendered - amount;
        } else {
          tendered = amount;
          change = 0;
        }
      } else if (dto.tenderedHalalas !== undefined && dto.tenderedHalalas !== null) {
        // Negative cash correction lines carry no tendered/change
        throw new BadRequestException(
          'Tendered amount is not allowed on negative cash payment lines',
        );
      }

      // Net-sum guard: after append, SUM(all amounts) must be >= 0
      const paymentRows = tx
        .select({ amountHalalas: orderPayments.amountHalalas })
        .from(orderPayments)
        .where(eq(orderPayments.orderId, orderId))
        .all();
      const existingSum = paymentRows.reduce((sum: number, r: any) => sum + r.amountHalalas, 0);
      if (existingSum + amount < 0) {
        throw new BadRequestException(
          `Payment would bring the order to a net negative balance (net ${existingSum + amount} halalas).`,
        );
      }

      // Append the immutable payment line
      const insertResult = tx
        .insert(orderPayments)
        .values({
          orderId,
          methodId: dto.methodId,
          methodTitle: pm.title,
          zatcaPaymentMeansCode: pm.zatcaPaymentMeansCode,
          amountHalalas: amount,
          tenderedHalalas: tendered,
          changeHalalas: change,
          createdAt: now,
          createdBy: userId,
        })
        .run();
      const paymentId = Number(insertResult.lastInsertRowid);

      // Bump order audit fields so concurrent terminals see the change
      tx.update(orders)
        .set({ ...updateAuditFields(userId, now) })
        .where(eq(orders.id, orderId))
        .run();

      // Immutable ledger entry with the line details
      this.orderEvents.createEvent(
        tx,
        orderId,
        userId,
        AuditAction.PAYMENT_ADDED,
        {
          paymentId,
          methodId: dto.methodId,
          methodTitle: pm.title,
          zatcaPaymentMeansCode: pm.zatcaPaymentMeansCode,
          amountHalalas: amount,
          ...(tendered !== null ? { tenderedHalalas: tendered, changeHalalas: change } : {}),
        },
        now,
      );
    });

    this.emitDomainEvent('order.updated', orderId, userId);
    // Reuse getOrder's mapping so the response always matches OrderResponse
    return this.getOrder(orderId);
  }

  /**
   * Deferred receipt print — triggered when ZATCA clears a standard invoice.
   * Prints the tax receipt with QR code and kickDrawer:false (cash drawer
   * was already kicked on pay for cash payments).
   */
  @OnEvent('zatca.invoice.cleared')
  async onZatcaInvoiceCleared(payload: {
    orderId: number;
    userId: number;
    invoiceId: number;
  }): Promise<void> {
    try {
      const receiptPrinter = this.printJobService.getReceiptPrinter();
      if (!receiptPrinter) return;

      // Drawer was already kicked on pay for standard cash — never kick here
      const kickDrawer = false;

      // Write receipt print enqueued + succeeded events
      const now = Math.floor(Date.now() / 1000);
      this.orderEvents.createEvent(
        this.db,
        payload.orderId,
        payload.userId,
        'receipt_print_enqueued',
        {
          printer: receiptPrinter.name,
          printerId: receiptPrinter.id,
          kickDrawer,
        },
        now,
      );

      await this.printJobService.printReceipt(payload.orderId, { kickDrawer });

      this.orderEvents.createEvent(
        this.db,
        payload.orderId,
        payload.userId,
        'receipt_print_succeeded',
        { printer: receiptPrinter.name, printerId: receiptPrinter.id },
        now,
      );
    } catch (err: any) {
      this.logger.error(
        `Deferred receipt print failed for order ${payload.orderId}: ${err.message}`,
      );
    }
  }

  /**
   * Deferred credit note receipt print — triggered when ZATCA clears a
   * standard credit note.
   */
  @OnEvent('zatca.credit_note.cleared')
  async onZatcaCreditNoteCleared(payload: {
    orderId: number;
    userId: number;
    creditNoteId: number;
    refundId: number;
  }): Promise<void> {
    try {
      const receiptPrinter = this.printJobService.getReceiptPrinter();
      if (!receiptPrinter) return;

      const now = Math.floor(Date.now() / 1000);
      this.orderEvents.createEvent(
        this.db,
        payload.orderId,
        payload.userId,
        'receipt_print_enqueued',
        {
          printer: receiptPrinter.name,
          printerId: receiptPrinter.id,
          kickDrawer: false,
        },
        now,
      );

      await this.printJobService.printRefundReceipt(payload.refundId, { kickDrawer: false });

      this.orderEvents.createEvent(
        this.db,
        payload.orderId,
        payload.userId,
        'receipt_print_succeeded',
        { printer: receiptPrinter.name, printerId: receiptPrinter.id },
        now,
      );
    } catch (err: any) {
      this.logger.error(
        `Deferred credit note print failed for refund ${payload.refundId}: ${err.message}`,
      );
    }
  }

  /**
   * Kick the cash drawer without printing a receipt.
   * Used for standard invoice cash payments where the tax receipt is deferred.
   */
  private async kickCashDrawer(
    printer: PrinterRecord,
    orderId: number,
    userId: number,
  ): Promise<void> {
    try {
      await this.printJobService.kickDrawer(printer);

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
      this.logger.error(`Cash drawer kick failed for order ${orderId}: ${err.message}`);
    }
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

      // ADR 0006: void is only allowed once payments net to exactly 0. Staff
      // first append negative balancing lines, then void.
      const paymentRows = tx
        .select({ amountHalalas: orderPayments.amountHalalas })
        .from(orderPayments)
        .where(eq(orderPayments.orderId, orderId))
        .all();
      const netPayments = paymentRows.reduce((sum: number, r: any) => sum + r.amountHalalas, 0);
      if (netPayments !== 0) {
        throw new BadRequestException(
          `Cannot void order with outstanding payments (net ${netPayments} halalas). Append balancing payment lines until net is 0.`,
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

      // Allocate document_id for the refund
      const refundDocumentId = this.documentIdService.allocateRefundDocumentId(tx);

      // Insert order_refunds
      const refundInsert = tx
        .insert(orderRefunds)
        .values({
          orderId,
          userId,
          methodId: dto.methodId,
          methodTitle: pm.title,
          zatcaPaymentMeansCode: pm.zatcaPaymentMeansCode,
          subtotalHalalas,
          vatHalalas,
          totalHalalas,
          reason: dto.reason ?? null,
          documentId: refundDocumentId,
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
            itemNameAr: oi.itemNameAr ?? null,
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
          documentId: refundDocumentId,
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

      // Receipt print enqueued event — skip for standard orders (deferred print)
      if (receiptPrinter && order.isStandardInvoice !== 1) {
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
    if (receiptPrinter && order.isStandardInvoice !== 1) {
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
        zatcaPaymentMeansCode: refund.zatcaPaymentMeansCode,
        subtotalHalalas: refund.subtotalHalalas,
        vatHalalas: refund.vatHalalas,
        totalHalalas: refund.totalHalalas,
        reason: refund.reason,
        documentId: refund.documentId,
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

  /**
   * Reprint a specific refund's receipt.
   * Validates the order exists and the refund belongs to it, then reprints
   * via printRefundReceipt (title REFUND) and writes enqueued/succeeded events
   * tagged with refundId so the timeline can distinguish refund prints.
   */
  async reprintRefundReceipt(
    orderId: number,
    refundId: number,
    userId: number,
  ): Promise<{ success: boolean; errors: string[] }> {
    const now = Math.floor(Date.now() / 1000);
    const errors: string[] = [];

    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new NotFoundException('Order not found');

    const refund = this.db.select().from(orderRefunds).where(eq(orderRefunds.id, refundId)).get();
    if (!refund) {
      throw new NotFoundException(`Refund ${refundId} not found`);
    }
    if (refund.orderId !== orderId) {
      throw new BadRequestException(`Refund ${refundId} does not belong to order ${orderId}`);
    }

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
        kickDrawer: false,
        refundId,
        totalHalalas: refund.totalHalalas,
      },
      now,
    );

    try {
      await this.printJobService.printRefundReceipt(refundId, { kickDrawer: false });

      this.orderEvents.createEvent(
        this.db,
        orderId,
        userId,
        'receipt_print_succeeded',
        { printer: receiptPrinter.name, printerId: receiptPrinter.id, refundId },
        now,
      );
    } catch (err: any) {
      const msg = `Refund receipt reprint: ${err.message}`;
      this.logger.error(msg);
      errors.push(msg);
    }

    return { success: errors.length === 0, errors };
  }

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
    const rows: any[] = query.orderBy(orders.id).all();
    return this.attachDeliveryPartnerTitles(rows);
  }

  /**
   * Attach `deliveryPartnerTitle` to order rows (ADR 0007) — one batched
   * lookup for all distinct partner ids instead of an N+1 join.
   */
  private attachDeliveryPartnerTitles(rows: any[]): any[] {
    const ids = [
      ...new Set(rows.map((r) => r.deliveryPartnerId).filter((x): x is string => x != null)),
    ];
    const titles = new Map<string, string>();
    if (ids.length > 0) {
      const partners = this.db
        .select({ id: deliveryPartners.id, title: deliveryPartners.title })
        .from(deliveryPartners)
        .where(inArray(deliveryPartners.id, ids))
        .all();
      for (const p of partners) titles.set(p.id, p.title);
    }
    return rows.map((r) => ({
      ...r,
      deliveryPartnerTitle: r.deliveryPartnerId ? (titles.get(r.deliveryPartnerId) ?? null) : null,
    }));
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
          id: p.id,
          methodId: p.methodId,
          methodTitle: p.methodTitle,
          zatcaPaymentMeansCode: p.zatcaPaymentMeansCode,
          amountHalalas: p.amountHalalas,
          tenderedHalalas: p.tenderedHalalas,
          changeHalalas: p.changeHalalas,
          createdAt: p.createdAt,
        })),
        deliveryPartnerTitle: this.getPartnerTitle(this.db, order.deliveryPartnerId ?? null),
        zatcaBuyerDetails: this.parseOrderBuyerDetails(order),
        documentId: order.documentId,
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

  // ── ZATCA Standard Invoice APIs ────────────────────────────────────────────

  /**
   * Get ZATCA invoice status for an order (for POS polling).
   */
  getZatcaInvoiceStatus(orderId: number) {
    return this.zatcaStandardService.getInvoiceStatus(orderId);
  }

  /**
   * Retry clearance for a standard invoice with error status.
   * Maps precondition errors to BadRequestException so the HTTP layer returns 400.
   */
  async retryZatcaClearance(orderId: number, userId: number) {
    try {
      return await this.zatcaStandardService.retryClearance(orderId, userId);
    } catch (e: any) {
      if (e.message?.includes('Cannot retry') || e.message?.includes('No invoice found')) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  /**
   * Reissue a standard invoice after rejection.
   * Maps precondition errors to BadRequestException so the HTTP layer returns 400.
   */
  async reissueZatcaInvoice(
    orderId: number,
    userId: number,
    buyerDetails?: Record<string, unknown>,
  ) {
    try {
      return await this.zatcaStandardService.reissue(orderId, userId, buyerDetails);
    } catch (e: any) {
      if (
        e.message?.includes('Cannot reissue') ||
        e.message?.includes('No invoice found') ||
        e.message?.includes('Invalid buyer details')
      ) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  // ── ZATCA Standard Credit Note APIs ────────────────────────────────────────

  /**
   * Validate that a refund belongs to the given order.
   * Throws NotFoundException or BadRequestException if not.
   */
  private validateRefundBelongsToOrder(orderId: number, refundId: number): void {
    const refund = this.db.select().from(orderRefunds).where(eq(orderRefunds.id, refundId)).get();
    if (!refund) {
      throw new NotFoundException(`Refund ${refundId} not found`);
    }
    if (refund.orderId !== orderId) {
      throw new BadRequestException(`Refund ${refundId} does not belong to order ${orderId}`);
    }
  }

  /**
   * Get ZATCA credit note status for a refund (for POS polling).
   */
  getZatcaCreditNoteStatus(orderId: number, refundId: number) {
    this.validateRefundBelongsToOrder(orderId, refundId);
    return this.zatcaStandardService.getCreditNoteStatus(orderId, refundId);
  }

  /**
   * Retry clearance for a credit note with error status.
   */
  async retryZatcaCreditNoteClearance(orderId: number, refundId: number, userId: number) {
    this.validateRefundBelongsToOrder(orderId, refundId);
    try {
      return await this.zatcaStandardService.retryCreditNoteClearance(orderId, refundId, userId);
    } catch (e: any) {
      if (e.message?.includes('Cannot retry') || e.message?.includes('No credit note found')) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  /**
   * Reissue a credit note after rejection (new attempt, new ICV).
   */
  async reissueZatcaCreditNote(orderId: number, refundId: number, userId: number) {
    this.validateRefundBelongsToOrder(orderId, refundId);
    try {
      return await this.zatcaStandardService.reissueCreditNote(orderId, refundId, userId);
    } catch (e: any) {
      if (
        e.message?.includes('Cannot reissue') ||
        e.message?.includes('No credit note found') ||
        e.message?.includes('already has a cleared credit note')
      ) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }
}
