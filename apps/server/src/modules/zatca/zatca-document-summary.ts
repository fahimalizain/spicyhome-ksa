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
      return 'failed';
  }
}

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
