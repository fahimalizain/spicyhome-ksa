import {
  bucketStatus,
  buildDocumentsSummary,
  countBuckets,
  healthOf,
  pickCurrentAttempt,
  sumCounts,
} from './zatca-document-summary';

describe('zatca-document-summary', () => {
  describe('bucketStatus', () => {
    it('maps simplified and standard success to submitted', () => {
      expect(bucketStatus('reported')).toBe('submitted');
      expect(bucketStatus('cleared')).toBe('submitted');
    });

    it('maps in-flight statuses to queued', () => {
      expect(bucketStatus('signed')).toBe('queued');
      expect(bucketStatus('pending')).toBe('queued');
    });

    it('maps retryable failures to failed', () => {
      expect(bucketStatus('failed')).toBe('failed');
      expect(bucketStatus('error')).toBe('failed');
    });

    it('maps clearance rejection to rejected', () => {
      expect(bucketStatus('rejected')).toBe('rejected');
    });

    it('treats unknown statuses as failed', () => {
      expect(bucketStatus('mystery')).toBe('failed');
    });
  });

  describe('pickCurrentAttempt', () => {
    it('prefers a cleared row over a later rejected attempt', () => {
      const current = pickCurrentAttempt([
        { id: 1, ownerId: 10, status: 'cleared' },
        { id: 2, ownerId: 10, status: 'rejected' },
      ]);
      expect(current).toEqual([{ id: 1, ownerId: 10, status: 'cleared' }]);
    });

    it('uses the latest id when nothing is cleared', () => {
      const current = pickCurrentAttempt([
        { id: 1, ownerId: 10, status: 'rejected' },
        { id: 2, ownerId: 10, status: 'pending' },
      ]);
      expect(current).toEqual([{ id: 2, ownerId: 10, status: 'pending' }]);
    });

    it('keeps one current row per owner', () => {
      const current = pickCurrentAttempt([
        { id: 1, ownerId: 10, status: 'rejected' },
        { id: 2, ownerId: 11, status: 'reported' },
        { id: 3, ownerId: 10, status: 'cleared' },
      ]);
      expect(current).toEqual(
        expect.arrayContaining([
          { id: 3, ownerId: 10, status: 'cleared' },
          { id: 2, ownerId: 11, status: 'reported' },
        ]),
      );
      expect(current).toHaveLength(2);
    });
  });

  describe('countBuckets / health', () => {
    it('counts each current status into a bucket', () => {
      expect(countBuckets(['reported', 'cleared', 'signed', 'failed', 'rejected'])).toEqual({
        submitted: 2,
        queued: 1,
        failed: 1,
        rejected: 1,
        total: 5,
      });
    });

    it('is ok when only submitted or queued', () => {
      expect(healthOf({ submitted: 3, queued: 1, failed: 0, rejected: 0, total: 4 })).toBe('ok');
    });

    it('needs attention when any current doc failed or was rejected', () => {
      expect(healthOf({ submitted: 1, queued: 0, failed: 1, rejected: 0, total: 2 })).toBe(
        'attention',
      );
      expect(healthOf({ submitted: 0, queued: 0, failed: 0, rejected: 1, total: 1 })).toBe(
        'attention',
      );
    });
  });

  describe('buildDocumentsSummary', () => {
    it('returns zeros and ok when there are no documents', () => {
      expect(buildDocumentsSummary([], [])).toEqual({
        invoices: { submitted: 0, queued: 0, failed: 0, rejected: 0, total: 0 },
        creditNotes: { submitted: 0, queued: 0, failed: 0, rejected: 0, total: 0 },
        overall: { submitted: 0, queued: 0, failed: 0, rejected: 0, total: 0, health: 'ok' },
      });
    });

    it('does not count a burned rejected invoice after a later cleared reissue', () => {
      const summary = buildDocumentsSummary(
        [
          { id: 1, ownerId: 10, status: 'rejected' },
          { id: 2, ownerId: 10, status: 'cleared' },
        ],
        [],
      );
      expect(summary.invoices).toEqual({
        submitted: 1,
        queued: 0,
        failed: 0,
        rejected: 0,
        total: 1,
      });
      expect(summary.overall.health).toBe('ok');
    });

    it('sums invoices and credit notes into overall', () => {
      const summary = buildDocumentsSummary(
        [{ id: 1, ownerId: 10, status: 'failed' }],
        [{ id: 2, ownerId: 20, status: 'reported' }],
      );
      expect(summary.overall).toEqual({
        submitted: 1,
        queued: 0,
        failed: 1,
        rejected: 0,
        total: 2,
        health: 'attention',
      });
    });

    it('sumCounts is used consistently for overall totals', () => {
      const a = countBuckets(['reported']);
      const b = countBuckets(['rejected']);
      expect(sumCounts(a, b)).toEqual({
        submitted: 1,
        queued: 0,
        failed: 0,
        rejected: 1,
        total: 2,
      });
    });
  });
});
