/**
 * Operator-facing rollup of zatca_invoices + zatca_credit_notes.
 *
 * Two pipelines share one `status` column (see docs/zatca/overview.md):
 *   simplified (B2C reporting): signed → reported | failed
 *   standard   (B2B clearance): pending → cleared | rejected | error
 *
 * Staff do not need that taxonomy. They need: is the tax document done,
 * waiting, retryable, or burned-and-must-reissue. So we collapse into
 * four buckets and count the *current* attempt per order / refund — not
 * every historical row. Counting every row would mark a recovered
 * clearance rejection as permanently unhealthy.
 */

export type ZatcaDocumentHealth = 'ok' | 'attention';

export interface ZatcaDocumentCounts {
  submitted: number;
  queued: number;
  failed: number;
  rejected: number;
  total: number;
}

export interface ZatcaDocumentsSummary {
  invoices: ZatcaDocumentCounts;
  creditNotes: ZatcaDocumentCounts;
  overall: ZatcaDocumentCounts & { health: ZatcaDocumentHealth };
}

export interface ZatcaAttemptRow {
  id: number;
  /** orders.id for invoices, order_refunds.id for credit notes */
  ownerId: number;
  status: string;
}

export type ZatcaDocumentBucket = 'submitted' | 'queued' | 'failed' | 'rejected';

export function bucketStatus(status: string): ZatcaDocumentBucket {
  switch (status) {
    case 'reported':
    case 'cleared':
      return 'submitted';
    case 'signed':
    case 'pending':
      return 'queued';
    case 'rejected':
      return 'rejected';
    case 'failed':
    case 'error':
    default:
      // Unknown is treated as failed so a new/typo status surfaces as
      // attention instead of silently dropping out of the totals.
      return 'failed';
  }
}

/**
 * One row per owner — the document staff can act on today.
 *
 * Matches `getActiveInvoiceForOrder`: prefer a `cleared` row, otherwise
 * the highest id (latest attempt).
 *
 * Why prefer cleared over a later non-cleared row?
 *   A rejected standard attempt keeps its ICV/UUID forever (hash chain).
 *   Reissue inserts a *new* row. The partial unique index allows only one
 *   `cleared` per order/refund, but a later `rejected`/`error` row is not
 *   forbidden. The issued tax document is the cleared one; a later burn
 *   must not hide that success or inflate "needs attention".
 *
 * Why latest id when nothing is cleared?
 *   That is the in-flight or last-failed attempt (`pending` / `error` /
 *   `rejected` / `signed` / `failed`). Older rejected siblings are burned
 *   history and must not be counted.
 */
export function pickCurrentAttempt<T extends ZatcaAttemptRow>(rows: T[]): T[] {
  const byOwner = new Map<number, T>();
  for (const row of rows) {
    const existing = byOwner.get(row.ownerId);
    if (!existing) {
      byOwner.set(row.ownerId, row);
      continue;
    }
    if (row.status === 'cleared' && existing.status !== 'cleared') {
      byOwner.set(row.ownerId, row);
      continue;
    }
    if (existing.status === 'cleared' && row.status !== 'cleared') {
      continue;
    }
    if (row.id > existing.id) {
      byOwner.set(row.ownerId, row);
    }
  }
  return [...byOwner.values()];
}

export function countBuckets(statuses: string[]): ZatcaDocumentCounts {
  const counts: ZatcaDocumentCounts = {
    submitted: 0,
    queued: 0,
    failed: 0,
    rejected: 0,
    total: statuses.length,
  };
  for (const status of statuses) {
    counts[bucketStatus(status)]++;
  }
  return counts;
}

export function sumCounts(a: ZatcaDocumentCounts, b: ZatcaDocumentCounts): ZatcaDocumentCounts {
  return {
    submitted: a.submitted + b.submitted,
    queued: a.queued + b.queued,
    failed: a.failed + b.failed,
    rejected: a.rejected + b.rejected,
    total: a.total + b.total,
  };
}

/** Queued alone is ok — the reporter polls `signed`/`failed` every few minutes. */
export function healthOf(counts: ZatcaDocumentCounts): ZatcaDocumentHealth {
  return counts.failed + counts.rejected > 0 ? 'attention' : 'ok';
}

export function buildDocumentsSummary(
  invoiceRows: ZatcaAttemptRow[],
  creditNoteRows: ZatcaAttemptRow[],
): ZatcaDocumentsSummary {
  const invoices = countBuckets(pickCurrentAttempt(invoiceRows).map((row) => row.status));
  const creditNotes = countBuckets(pickCurrentAttempt(creditNoteRows).map((row) => row.status));
  const overallCounts = sumCounts(invoices, creditNotes);
  return {
    invoices,
    creditNotes,
    overall: { ...overallCounts, health: healthOf(overallCounts) },
  };
}
