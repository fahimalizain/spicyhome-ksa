import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { eq, asc, and } from 'drizzle-orm';
import { deliveryPartners, paymentMethods, orders } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import { mapBools } from '../../common/bool-mapper.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

/**
 * Generate a kebab-case slug from a title string.
 *
 * Lowercase, non-alphanumeric → hyphen, collapse multiple hyphens, trim ends.
 * Identical to the payment-methods slugify (ADR 0007) — the two catalogs
 * share one slug namespace because each partner owns a payment method with
 * the same slug id.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

@Injectable()
export class DeliveryPartnersService {
  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {}

  /** List all delivery partners (including disabled), sort_order ASC then title ASC. */
  list(): any[] {
    return this.db
      .select()
      .from(deliveryPartners)
      .orderBy(asc(deliveryPartners.sortOrder), asc(deliveryPartners.title))
      .all()
      .map((r) => mapBools(r, ['enabled']));
  }

  /**
   * List only enabled delivery partners, sort_order ASC then title ASC.
   *
   * Authenticated (no manage_settings) — needed later by the POS order page
   * partner selector, mirroring GET /payment-methods/enabled.
   */
  listEnabled(): any[] {
    return this.db
      .select()
      .from(deliveryPartners)
      .where(eq(deliveryPartners.enabled, 1))
      .orderBy(asc(deliveryPartners.sortOrder), asc(deliveryPartners.title))
      .all()
      .map((r) => mapBools(r, ['enabled']));
  }

  /**
   * Create a delivery partner (ADR 0007).
   *
   * Atomically creates the partner row AND its 1:1 payment method (same slug,
   * same title, zatca_payment_means_code '30', enabled 1, sort_order 0) in one
   * transaction — if either insert fails, both are rolled back.
   */
  create(dto: { title: string }, userId: number): any {
    const slug = slugify(dto.title);
    if (!slug) {
      throw new BadRequestException('Title must contain at least one alphanumeric character');
    }

    // Shared slug namespace with payment_methods (ADR 0007).
    const partnerExists = this.db
      .select()
      .from(deliveryPartners)
      .where(eq(deliveryPartners.id, slug))
      .get();
    if (partnerExists) {
      throw new ConflictException(`A delivery partner with slug "${slug}" already exists`);
    }
    const methodExists = this.db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, slug))
      .get();
    if (methodExists) {
      throw new ConflictException(`A payment method with slug "${slug}" already exists`);
    }

    const now = Math.floor(Date.now() / 1000);
    const title = dto.title.trim();
    const audit = createAuditFields(userId, now);

    const created = this.db.transaction((tx: any) => {
      tx.insert(deliveryPartners)
        .values({ id: slug, title, enabled: 1, sortOrder: 0, ...audit })
        .run();
      tx.insert(paymentMethods)
        .values({
          id: slug,
          title,
          zatcaPaymentMeansCode: '30', // '30' = Credit / On Account (ZATCA UNTDID 4461)
          enabled: 1,
          sortOrder: 0,
          ...audit,
        })
        .run();
      return tx.select().from(deliveryPartners).where(eq(deliveryPartners.id, slug)).get();
    });

    return mapBools(created, ['enabled']);
  }

  /**
   * Update a delivery partner (ADR 0007).
   *
   * Mirrors `title` and `enabled` to the owned payment method in the same
   * transaction. `sort_order` is deliberately NOT mirrored (the method's
   * sort_order is tuned independently via PATCH /payment-methods/:id).
   */
  update(
    id: string,
    dto: { id?: string; title?: string; enabled?: boolean; sortOrder?: number },
    userId: number,
  ): any {
    // Slug is immutable — reject attempts to change the id (the whitelisting
    // ValidationPipe would otherwise silently drop it).
    if (dto.id !== undefined && dto.id !== id) {
      throw new BadRequestException(
        'Delivery partner slug (id) is immutable and cannot be changed',
      );
    }

    const partner = this.db
      .select()
      .from(deliveryPartners)
      .where(eq(deliveryPartners.id, id))
      .get();
    if (!partner) throw new NotFoundException('Delivery partner not found');

    // Disable guard (ADR 0007): a partner with open orders must stay payable
    // through its own method, and disabled methods cannot be selected for
    // payment (ADR 0002). Paid/voided/refunded historical orders are fine.
    if (dto.enabled === false && partner.enabled === 1) {
      const openCount = this.db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.deliveryPartnerId, id), eq(orders.status, 'open')))
        .all().length;
      if (openCount > 0) {
        throw new ConflictException(
          `Cannot disable delivery partner "${id}": ${openCount} open order(s) still reference it`,
        );
      }
    }

    const updated = this.db.transaction((tx: any) => {
      const updates: Record<string, any> = { ...updateAuditFields(userId) };
      if (dto.title !== undefined) updates.title = dto.title.trim();
      if (dto.enabled !== undefined) updates.enabled = dto.enabled ? 1 : 0;
      if (dto.sortOrder !== undefined) updates.sortOrder = dto.sortOrder;
      tx.update(deliveryPartners).set(updates).where(eq(deliveryPartners.id, id)).run();

      // Mirror title + enabled to the owned payment method (same transaction).
      const methodUpdates: Record<string, any> = { ...updateAuditFields(userId) };
      let mirror = false;
      if (dto.title !== undefined) {
        methodUpdates.title = dto.title.trim();
        mirror = true;
      }
      if (dto.enabled !== undefined) {
        methodUpdates.enabled = dto.enabled ? 1 : 0;
        mirror = true;
      }
      if (mirror) {
        tx.update(paymentMethods).set(methodUpdates).where(eq(paymentMethods.id, id)).run();
      }

      return tx.select().from(deliveryPartners).where(eq(deliveryPartners.id, id)).get();
    });

    return mapBools(updated, ['enabled']);
  }
}
