import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { eq, desc, and, ne, lte, gte } from 'drizzle-orm';
import { promotions } from '@spicyhome/db';
import { getServiceDayBoundsUnix, getServiceDayString } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import { mapBools } from '../../common/bool-mapper.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

/** Inclusive range overlap: startA <= endB && startB <= endA. */
function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && startB <= endA;
}

@Injectable()
export class PromotionsService {
  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {}

  /** List all promotions (including disabled). startBusinessDate DESC, id DESC. */
  list(): any[] {
    return this.db
      .select()
      .from(promotions)
      .orderBy(desc(promotions.startBusinessDate), desc(promotions.id))
      .all()
      .map((r) => mapBools(r, ['enabled']));
  }

  /**
   * Create a promotion (ADR 0009 / #191).
   *
   * Always enabled on create. Rejects overlapping enabled date ranges (409).
   */
  create(
    dto: {
      name: string;
      nameAr: string;
      percentBp: number;
      startBusinessDate: string;
      endBusinessDate: string;
    },
    userId: number,
  ): any {
    const name = this.trimRequired(dto.name, 'name');
    const nameAr = this.trimRequired(dto.nameAr, 'nameAr');
    this.validatePercentBp(dto.percentBp);
    this.validateBusinessDate(dto.startBusinessDate);
    this.validateBusinessDate(dto.endBusinessDate);
    this.validateDateOrder(dto.startBusinessDate, dto.endBusinessDate);

    this.assertNoEnabledOverlap(dto.startBusinessDate, dto.endBusinessDate, null);

    const audit = createAuditFields(userId);
    const result = this.db
      .insert(promotions)
      .values({
        name,
        nameAr,
        percentBp: dto.percentBp,
        startBusinessDate: dto.startBusinessDate,
        endBusinessDate: dto.endBusinessDate,
        enabled: 1,
        ...audit,
      })
      .run();

    const created = this.db
      .select()
      .from(promotions)
      .where(eq(promotions.id, Number(result.lastInsertRowid)))
      .get()!;

    return mapBools(created, ['enabled']);
  }

  /**
   * Update a promotion.
   *
   * Once the promotion has ended (current service day > endBusinessDate) it is
   * read-only: every edit — including `enabled` toggles — is rejected (409).
   * While it has not ended, soft-disable via `enabled: false` is always allowed
   * (no open-order guard — snapshots live on the order).
   *
   * If the resulting row is enabled, overlap is checked against other enabled rows.
   */
  update(
    id: number,
    dto: {
      name?: string;
      nameAr?: string;
      percentBp?: number;
      startBusinessDate?: string;
      endBusinessDate?: string;
      enabled?: boolean;
    },
    userId: number,
  ): any {
    const existing = this.db.select().from(promotions).where(eq(promotions.id, id)).get();
    if (!existing) throw new NotFoundException('Promotion not found');

    const today = getServiceDayString(Date.now());
    if (today > existing.endBusinessDate) {
      throw new ConflictException(
        `Promotion "${existing.name}" ended on ${existing.endBusinessDate} and can no longer be edited`,
      );
    }

    const updates: Record<string, any> = { ...updateAuditFields(userId) };

    if (dto.name !== undefined) {
      updates.name = this.trimRequired(dto.name, 'name');
    }
    if (dto.nameAr !== undefined) {
      updates.nameAr = this.trimRequired(dto.nameAr, 'nameAr');
    }
    if (dto.percentBp !== undefined) {
      this.validatePercentBp(dto.percentBp);
      updates.percentBp = dto.percentBp;
    }

    const start =
      dto.startBusinessDate !== undefined ? dto.startBusinessDate : existing.startBusinessDate;
    const end = dto.endBusinessDate !== undefined ? dto.endBusinessDate : existing.endBusinessDate;

    if (dto.startBusinessDate !== undefined) {
      this.validateBusinessDate(dto.startBusinessDate);
      updates.startBusinessDate = dto.startBusinessDate;
    }
    if (dto.endBusinessDate !== undefined) {
      this.validateBusinessDate(dto.endBusinessDate);
      updates.endBusinessDate = dto.endBusinessDate;
    }
    // Resulting range must be ordered when either date changes (or both present).
    if (dto.startBusinessDate !== undefined || dto.endBusinessDate !== undefined) {
      this.validateDateOrder(start, end);
    }

    const resultingEnabled = dto.enabled !== undefined ? dto.enabled : existing.enabled === 1;

    if (dto.enabled !== undefined) {
      updates.enabled = dto.enabled ? 1 : 0;
    }

    if (resultingEnabled) {
      this.assertNoEnabledOverlap(start, end, id);
    }

    this.db.update(promotions).set(updates).where(eq(promotions.id, id)).run();

    const updated = this.db.select().from(promotions).where(eq(promotions.id, id)).get()!;
    return mapBools(updated, ['enabled']);
  }

  /**
   * Lookup the single enabled promotion whose inclusive range covers `date`.
   * Public for later order-attach (slice 5). Not exposed as HTTP.
   */
  findEnabledForBusinessDate(date: string): any | null {
    this.validateBusinessDate(date);

    const row = this.db
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.enabled, 1),
          lte(promotions.startBusinessDate, date),
          gte(promotions.endBusinessDate, date),
        ),
      )
      .get();

    if (!row) return null;
    return mapBools(row, ['enabled']);
  }

  private trimRequired(value: string, field: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${field} must not be empty`);
    }
    return trimmed;
  }

  private validatePercentBp(percentBp: number): void {
    if (
      typeof percentBp !== 'number' ||
      !Number.isInteger(percentBp) ||
      percentBp < 1 ||
      percentBp > 10000
    ) {
      throw new BadRequestException('percentBp must be an integer between 1 and 10000');
    }
  }

  private validateBusinessDate(value: string): void {
    if (getServiceDayBoundsUnix(value) === null) {
      throw new BadRequestException(`Invalid date: ${value} (expected YYYY-MM-DD)`);
    }
  }

  private validateDateOrder(start: string, end: string): void {
    if (start > end) {
      throw new BadRequestException('startBusinessDate must not be after endBusinessDate');
    }
  }

  /**
   * At most one enabled promotion may cover a given Business Date.
   * `excludeId` skips self on update.
   */
  private assertNoEnabledOverlap(start: string, end: string, excludeId: number | null): void {
    const conditions = [eq(promotions.enabled, 1)];
    if (excludeId !== null) {
      conditions.push(ne(promotions.id, excludeId));
    }

    const enabledRows = this.db
      .select()
      .from(promotions)
      .where(and(...conditions))
      .all();

    for (const other of enabledRows) {
      if (rangesOverlap(start, end, other.startBusinessDate, other.endBusinessDate)) {
        throw new ConflictException(
          `An enabled promotion "${other.name}" already covers ${other.startBusinessDate}–${other.endBusinessDate}`,
        );
      }
    }
  }
}
