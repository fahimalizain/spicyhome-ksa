import {
  DEFAULT_ZATCA_PAYMENT_MEANS_CODE,
  isZatcaPaymentMeansCode,
  resolvePaymentMeansCode,
  ZATCA_PAYMENT_MEANS_CODE_LABELS,
  ZATCA_PAYMENT_MEANS_CODES,
} from './zatca-payment-means';

describe('ZATCA payment means codes', () => {
  it('allow-list is exactly the ZATCA schematron set', () => {
    expect([...ZATCA_PAYMENT_MEANS_CODES].sort()).toEqual(['1', '10', '30', '42', '48']);
  });

  it('does not include 54 or 55 (rejected by ZATCA)', () => {
    expect(ZATCA_PAYMENT_MEANS_CODES).not.toContain('54');
    expect(ZATCA_PAYMENT_MEANS_CODES).not.toContain('55');
  });

  it('default code is 10', () => {
    expect(DEFAULT_ZATCA_PAYMENT_MEANS_CODE).toBe('10');
  });

  it('labels cover every allowed code', () => {
    for (const code of ZATCA_PAYMENT_MEANS_CODES) {
      expect(typeof ZATCA_PAYMENT_MEANS_CODE_LABELS[code]).toBe('string');
    }
  });

  describe('isZatcaPaymentMeansCode', () => {
    it('accepts all allowed codes', () => {
      for (const code of ZATCA_PAYMENT_MEANS_CODES) {
        expect(isZatcaPaymentMeansCode(code)).toBe(true);
      }
    });

    it('rejects invalid codes', () => {
      for (const code of ['54', '55', '99', '10 ', '', 'cash', '0']) {
        expect(isZatcaPaymentMeansCode(code)).toBe(false);
      }
    });
  });
});

describe('resolvePaymentMeansCode', () => {
  it('returns default 10 for no payment lines', () => {
    expect(resolvePaymentMeansCode([])).toBe('10');
  });

  it('returns 10 for a single cash payment', () => {
    expect(
      resolvePaymentMeansCode([
        { amountHalalas: 5000, methodId: 'cash', zatcaPaymentMeansCode: '10' },
      ]),
    ).toBe('10');
  });

  it('returns 48 for a single card payment', () => {
    expect(
      resolvePaymentMeansCode([
        { amountHalalas: 5000, methodId: 'card', zatcaPaymentMeansCode: '48' },
      ]),
    ).toBe('48');
  });

  it('picks the code of the largest-amount line in split tender', () => {
    const lines = [
      { amountHalalas: 3000, methodId: 'cash', zatcaPaymentMeansCode: '10' },
      { amountHalalas: 7000, methodId: 'card', zatcaPaymentMeansCode: '48' },
    ];
    expect(resolvePaymentMeansCode(lines)).toBe('48');
  });

  it('picks the code of the largest-amount line regardless of order', () => {
    const lines = [
      { amountHalalas: 7000, methodId: 'card', zatcaPaymentMeansCode: '48' },
      { amountHalalas: 3000, methodId: 'cash', zatcaPaymentMeansCode: '10' },
    ];
    expect(resolvePaymentMeansCode(lines)).toBe('48');
  });

  it('breaks amount ties by lexicographically smallest methodId', () => {
    // card vs cash: 'card' < 'cash' lexicographically
    const lines = [
      { amountHalalas: 5000, methodId: 'cash', zatcaPaymentMeansCode: '10' },
      { amountHalalas: 5000, methodId: 'card', zatcaPaymentMeansCode: '48' },
    ];
    expect(resolvePaymentMeansCode(lines)).toBe('48');
  });

  it('tie-break is stable regardless of input order', () => {
    const lines = [
      { amountHalalas: 5000, methodId: 'card', zatcaPaymentMeansCode: '48' },
      { amountHalalas: 5000, methodId: 'cash', zatcaPaymentMeansCode: '10' },
    ];
    expect(resolvePaymentMeansCode(lines)).toBe('48');
  });

  it('tie-break uses methodId ASC among equal amounts with equal codes', () => {
    // mada and card both map to 48; 'card' wins the tie-break
    const lines = [
      { amountHalalas: 2500, methodId: 'mada', zatcaPaymentMeansCode: '48' },
      { amountHalalas: 2500, methodId: 'card', zatcaPaymentMeansCode: '48' },
      { amountHalalas: 2500, methodId: 'cash', zatcaPaymentMeansCode: '10' },
    ];
    expect(resolvePaymentMeansCode(lines)).toBe('48');
  });

  it('returns default 10 when the winning line has an invalid code', () => {
    const lines = [
      { amountHalalas: 9000, methodId: 'custom', zatcaPaymentMeansCode: '99' },
      { amountHalalas: 1000, methodId: 'cash', zatcaPaymentMeansCode: '10' },
    ];
    expect(resolvePaymentMeansCode(lines)).toBe('10');
  });

  it('returns default 10 when the winning line has an empty code', () => {
    const lines = [
      { amountHalalas: 9000, methodId: 'card', zatcaPaymentMeansCode: '' },
      { amountHalalas: 1000, methodId: 'cash', zatcaPaymentMeansCode: '10' },
    ];
    expect(resolvePaymentMeansCode(lines)).toBe('10');
  });

  it('returns default 10 when every line has an invalid code', () => {
    const lines = [
      { amountHalalas: 5000, methodId: 'cash', zatcaPaymentMeansCode: '55' },
      { amountHalalas: 5000, methodId: 'card', zatcaPaymentMeansCode: '54' },
    ];
    expect(resolvePaymentMeansCode(lines)).toBe('10');
  });

  it('valid codes lose to larger amounts', () => {
    // Larger cash amount wins over smaller card amount
    const lines = [
      { amountHalalas: 6000, methodId: 'cash', zatcaPaymentMeansCode: '10' },
      { amountHalalas: 4000, methodId: 'card', zatcaPaymentMeansCode: '48' },
    ];
    expect(resolvePaymentMeansCode(lines)).toBe('10');
  });
});
