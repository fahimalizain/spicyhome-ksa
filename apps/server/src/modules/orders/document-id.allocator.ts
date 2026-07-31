import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { settings } from '@spicyhome/db';
import { zatcaKey, ZATCAEnvironment } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { PrintersService } from '../printers/printers.service';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

/**
 * Document ID allocator for ZATCA e-invoicing.
 *
 * Allocates human-readable document identifiers in the format:
 *   - Invoices:  `INV{YY}-####`  e.g. `INV26-0001`
 *   - Refunds:   `REF{YY}-####`  e.g. `REF26-0001`
 *
 * `{YY}` = last two digits of the calendar year in Asia/Riyadh at allocation
 * time. The sequence is zero-padded to at least 4 digits (e.g. seq 10000 →
 * `INV26-10000`).
 *
 * Counters are stored in the `settings` table, scoped per environment and
 * organizational unit using `zatcaKey()`:
 *   - Invoice seq: `zatcaKey(env, orgUnit, 'last_inv_document')`
 *   - Refund seq:  `zatcaKey(env, orgUnit, 'last_ref_document')`
 *
 * Counter value format: `"{yy}:{seq}"` (e.g. `"26:12"`). When the year
 * changes, the sequence resets to 1.
 *
 * Allocation must happen inside a database transaction. Never reuse a
 * burned document_id — rotate only on clearance rejection.
 */
@Injectable()
export class DocumentIdService {
  private static readonly INV_SUFFIX = 'last_inv_document';
  private static readonly REF_SUFFIX = 'last_ref_document';

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private printersService: PrintersService,
  ) {}

  /**
   * Allocate the next invoice document ID — `INV{YY}-####`.
   *
   * @param tx — an active Drizzle transaction (or the raw db instance).
   * @param nowMs — optional epoch milliseconds; defaults to Date.now().
   */
  allocateInvoiceDocumentId(tx: any, nowMs?: number): string {
    return this.allocateDocumentId(tx, 'INV', DocumentIdService.INV_SUFFIX, nowMs);
  }

  /**
   * Allocate the next refund/credit-note document ID — `REF{YY}-####`.
   *
   * @param tx — an active Drizzle transaction (or the raw db instance).
   * @param nowMs — optional epoch milliseconds; defaults to Date.now().
   */
  allocateRefundDocumentId(tx: any, nowMs?: number): string {
    return this.allocateDocumentId(tx, 'REF', DocumentIdService.REF_SUFFIX, nowMs);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private allocateDocumentId(
    tx: any,
    prefix: 'INV' | 'REF',
    suffixKey: string,
    nowMs?: number,
  ): string {
    const env = this.getEnv();
    const orgUnit = this.getOrgUnit();
    const key = zatcaKey(env, orgUnit, suffixKey);

    // Determine the current two-digit year in Asia/Riyadh
    const yy = this.getTwoDigitYear(nowMs);

    const row = tx.select().from(settings).where(eq(settings.key, key)).get();

    let seq: number;
    if (row) {
      const [storedYyStr, storedSeqStr] = row.value.split(':');
      const storedYy = parseInt(storedYyStr, 10);
      const storedSeq = parseInt(storedSeqStr, 10);

      if (storedYy === yy) {
        seq = storedSeq + 1;
      } else {
        // Year changed — reset to 1
        seq = 1;
      }
      tx.update(settings)
        .set({ value: `${yy}:${seq}` })
        .where(eq(settings.key, key))
        .run();
    } else {
      // First allocation — start at 1
      seq = 1;
      tx.insert(settings)
        .values({ key, value: `${yy}:1` })
        .run();
    }

    const paddedYy = String(yy).padStart(2, '0');
    const paddedSeq = String(seq).padStart(4, '0');
    return `${prefix}${paddedYy}-${paddedSeq}`;
  }

  /**
   * Return the last two digits of the current calendar year in Asia/Riyadh.
   */
  private getTwoDigitYear(nowMs?: number): number {
    const date = new Date(nowMs ?? Date.now());
    // toLocaleDateString with year:'2-digit' returns the two-digit year in
    // the specified timezone.
    const yyStr = date.toLocaleDateString('en-US', {
      timeZone: 'Asia/Riyadh',
      year: '2-digit',
    });
    return parseInt(yyStr, 10);
  }

  private getEnv(): ZATCAEnvironment {
    return this.printersService.getSetting('zatca_environment', 'simulation') as ZATCAEnvironment;
  }

  private getOrgUnit(): string {
    const raw = this.printersService.getSetting('zatca_org_unit', '');
    // If org unit is empty (not configured yet), use a default slug so
    // that zatcaKey does not throw. This covers the pre-onboarding state
    // where orders can be created before ZATCA onboarding is complete.
    // The counters will be scoped to zatca_<env>_default_* until the
    // org unit is configured.
    if (!raw || !raw.trim()) return 'Default';
    return raw;
  }
}
