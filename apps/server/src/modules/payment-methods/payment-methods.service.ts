import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import { paymentMethods } from '@spicyhome/db';
import { isZatcaPaymentMeansCode, ZATCA_PAYMENT_MEANS_CODES } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import { mapBools } from '../../common/bool-mapper.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

/**
 * Generate a kebab-case slug from a title string.
 *
 * Lowercase, non-alphanumeric → hyphen, collapse multiple hyphens, trim ends.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

@Injectable()
export class PaymentMethodsService {
  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {}

  /** List all payment methods, ordered by sort_order ASC then title ASC. */
  list(): any[] {
    return this.db
      .select()
      .from(paymentMethods)
      .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.title))
      .all()
      .map((r) => mapBools(r, ['enabled']));
  }

  /** List only enabled payment methods, ordered by sort_order ASC then title ASC. */
  listEnabled(): any[] {
    return this.db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.enabled, 1))
      .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.title))
      .all()
      .map((r) => mapBools(r, ['enabled']));
  }

  /** Get a single payment method by slug */
  get(id: string): any {
    const method = this.db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).get();
    if (!method) throw new NotFoundException('Payment method not found');
    return mapBools(method, ['enabled']);
  }

  /** Create a new payment method */
  create(dto: { title: string; zatcaPaymentMeansCode: string }, userId: number): any {
    // ZATCA allow-list (10, 30, 42, 48, 1) — required on create
    if (!isZatcaPaymentMeansCode(dto.zatcaPaymentMeansCode)) {
      throw new BadRequestException(
        `zatcaPaymentMeansCode must be one of: ${ZATCA_PAYMENT_MEANS_CODES.join(', ')}`,
      );
    }

    const slug = slugify(dto.title);
    if (!slug) {
      throw new BadRequestException('Title must contain at least one alphanumeric character');
    }

    // Check for duplicate slug
    const existing = this.db.select().from(paymentMethods).where(eq(paymentMethods.id, slug)).get();
    if (existing) {
      throw new ConflictException(`A payment method with slug "${slug}" already exists`);
    }

    const now = Math.floor(Date.now() / 1000);
    const row = {
      id: slug,
      title: dto.title.trim(),
      zatcaPaymentMeansCode: dto.zatcaPaymentMeansCode,
      enabled: 1,
      sortOrder: 0,
      ...createAuditFields(userId, now),
    };

    this.db
      .insert(paymentMethods)
      .values(row as any)
      .run();

    return mapBools(
      this.db.select().from(paymentMethods).where(eq(paymentMethods.id, slug)).get()!,
      ['enabled'],
    );
  }

  /** Update a payment method */
  update(
    id: string,
    dto: { title?: string; enabled?: boolean; sortOrder?: number; zatcaPaymentMeansCode?: string },
    userId: number,
  ): any {
    const method = this.db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).get();
    if (!method) throw new NotFoundException('Payment method not found');

    // Cash lock: reject title change, enabled=false, and ZATCA code change away from 10
    if (id === 'cash') {
      if (dto.title !== undefined) {
        throw new ForbiddenException('The cash payment method title cannot be changed');
      }
      if (dto.enabled === false) {
        throw new ForbiddenException('The cash payment method cannot be disabled');
      }
      if (dto.zatcaPaymentMeansCode !== undefined && dto.zatcaPaymentMeansCode !== '10') {
        throw new ForbiddenException(
          'The cash payment method ZATCA payment means code cannot be changed from 10',
        );
      }
    }

    if (
      dto.zatcaPaymentMeansCode !== undefined &&
      !isZatcaPaymentMeansCode(dto.zatcaPaymentMeansCode)
    ) {
      throw new BadRequestException(
        `zatcaPaymentMeansCode must be one of: ${ZATCA_PAYMENT_MEANS_CODES.join(', ')}`,
      );
    }

    const updates: Record<string, any> = { ...updateAuditFields(userId) };
    if (dto.title !== undefined) {
      updates.title = dto.title.trim();
    }
    if (dto.zatcaPaymentMeansCode !== undefined) {
      updates.zatcaPaymentMeansCode = dto.zatcaPaymentMeansCode;
    }
    if (dto.enabled !== undefined) {
      updates.enabled = dto.enabled ? 1 : 0;
    }
    if (dto.sortOrder !== undefined) {
      updates.sortOrder = dto.sortOrder;
    }

    this.db.update(paymentMethods).set(updates).where(eq(paymentMethods.id, id)).run();

    return mapBools(this.db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).get()!, [
      'enabled',
    ]);
  }
}
