import { describe, it, expect } from 'vitest';
import { calcOutstandingHalalas, calcPaymentsSumHalalas } from '../lib/order-payments';

describe('calcPaymentsSumHalalas', () => {
  it('returns 0 for an empty ledger', () => {
    expect(calcPaymentsSumHalalas([])).toBe(0);
  });

  it('sums positive payment lines', () => {
    expect(calcPaymentsSumHalalas([{ amountHalalas: 2300 }, { amountHalalas: 2300 }])).toBe(4600);
  });

  it('nets negative correction lines', () => {
    expect(calcPaymentsSumHalalas([{ amountHalalas: 4600 }, { amountHalalas: -1000 }])).toBe(3600);
  });
});

describe('calcOutstandingHalalas', () => {
  it('returns the full total when nothing is paid', () => {
    expect(calcOutstandingHalalas(4600, [])).toBe(4600);
  });

  it('returns 0 when payments exactly cover the total', () => {
    expect(calcOutstandingHalalas(4600, [{ amountHalalas: 4600 }])).toBe(0);
  });

  it('returns the remainder for a partial payment', () => {
    expect(calcOutstandingHalalas(4600, [{ amountHalalas: 2000 }])).toBe(2600);
  });

  it('returns a negative value for a temporary overpay', () => {
    expect(calcOutstandingHalalas(4600, [{ amountHalalas: 5000 }])).toBe(-400);
  });

  it('accounts for split tender', () => {
    expect(calcOutstandingHalalas(4600, [{ amountHalalas: 2300 }, { amountHalalas: 2000 }])).toBe(
      300,
    );
  });

  it('corrections (negative lines) increase outstanding', () => {
    expect(calcOutstandingHalalas(4600, [{ amountHalalas: 4600 }, { amountHalalas: -1000 }])).toBe(
      1000,
    );
  });
});
