import { describe, it, expect } from 'vitest';
import { getPreviousInvoiceDocumentIds } from '../lib/order-events';

function event(type: string, payload: Record<string, unknown>) {
  return { type, payload: JSON.stringify(payload) };
}

describe('getPreviousInvoiceDocumentIds', () => {
  it('returns unique burned invoice document IDs different from current', () => {
    const events = [
      event('zatca_clearance_rejected', {
        documentKind: 'invoice',
        documentId: 'INV26-0001',
        cbcId: 'INV26-0001',
      }),
      event('zatca_clearance_approved', {
        documentKind: 'invoice',
        documentId: 'INV26-0003',
        cbcId: 'INV26-0003',
      }),
      event('zatca_clearance_rejected', {
        documentKind: 'invoice',
        documentId: 'INV26-0002',
        cbcId: 'INV26-0002',
      }),
      // Duplicate burn of the same document — should be collapsed
      event('zatca_clearance_rejected', {
        documentKind: 'invoice',
        documentId: 'INV26-0002',
        cbcId: 'INV26-0002',
      }),
      // Credit note burns are not order-level invoice IDs
      event('zatca_clearance_rejected', {
        documentKind: 'credit_note',
        documentId: 'REF26-0001',
        cbcId: 'REF26-0001',
        refundId: 1,
      }),
    ];
    expect(getPreviousInvoiceDocumentIds(events, 'INV26-0003')).toEqual([
      'INV26-0001',
      'INV26-0002',
    ]);
  });

  it('treats missing documentKind as invoice', () => {
    const events = [event('zatca_clearance_rejected', { documentId: 'INV26-0001' })];
    expect(getPreviousInvoiceDocumentIds(events, 'INV26-0002')).toEqual(['INV26-0001']);
  });

  it('falls back to cbcId when documentId is missing', () => {
    const events = [event('zatca_clearance_rejected', { cbcId: 'INV26-0001' })];
    expect(getPreviousInvoiceDocumentIds(events, 'INV26-0002')).toEqual(['INV26-0001']);
  });

  it('excludes the current documentId', () => {
    const events = [
      event('zatca_clearance_rejected', { documentId: 'INV26-0001' }),
      event('zatca_clearance_rejected', { documentId: 'INV26-0002' }),
    ];
    expect(getPreviousInvoiceDocumentIds(events, 'INV26-0002')).toEqual(['INV26-0001']);
  });

  it('returns empty array for no events, non-rejected events, or malformed payloads', () => {
    expect(getPreviousInvoiceDocumentIds([], 'INV26-0001')).toEqual([]);
    expect(getPreviousInvoiceDocumentIds([event('paid', {})], 'INV26-0001')).toEqual([]);
    expect(
      getPreviousInvoiceDocumentIds(
        [{ type: 'zatca_clearance_rejected', payload: 'not json' }],
        'INV26-0001',
      ),
    ).toEqual([]);
    expect(
      getPreviousInvoiceDocumentIds([event('zatca_clearance_rejected', { icv: 1 })], 'INV26-0001'),
    ).toEqual([]);
  });
});
