import { describe, it, expect } from 'vitest';
import {
  calcOutstandingHalalas,
  calcPaymentsSumHalalas,
  summarizePaymentsByMethod,
} from '../lib/order-payments';

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

describe('summarizePaymentsByMethod', () => {
  it('returns [] for an empty ledger', () => {
    expect(summarizePaymentsByMethod([])).toEqual([]);
  });

  it('single method with multiple lines → one row with the summed amount', () => {
    expect(
      summarizePaymentsByMethod([
        { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 2300 },
        { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 2300 },
      ]),
    ).toEqual([{ methodId: 'cash', methodTitle: 'Cash', totalHalalas: 4600 }]);
  });

  it('two methods → both rows in first-appearance order', () => {
    expect(
      summarizePaymentsByMethod([
        { methodId: 'card', methodTitle: 'Card', amountHalalas: 5000 },
        { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 4600 },
        { methodId: 'card', methodTitle: 'Card', amountHalalas: -1000 },
      ]),
    ).toEqual([
      { methodId: 'card', methodTitle: 'Card', totalHalalas: 4000 },
      { methodId: 'cash', methodTitle: 'Cash', totalHalalas: 4600 },
    ]);
  });

  it('negative correction nets against the same method', () => {
    expect(
      summarizePaymentsByMethod([
        { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 4600 },
        { methodId: 'cash', methodTitle: 'Cash', amountHalalas: -1000 },
      ]),
    ).toEqual([{ methodId: 'cash', methodTitle: 'Cash', totalHalalas: 3600 }]);
  });

  it('a method that nets to 0 still appears', () => {
    expect(
      summarizePaymentsByMethod([
        { methodId: 'card', methodTitle: 'Card', amountHalalas: 3000 },
        { methodId: 'card', methodTitle: 'Card', amountHalalas: -3000 },
      ]),
    ).toEqual([{ methodId: 'card', methodTitle: 'Card', totalHalalas: 0 }]);
  });

  it('methodTitle is taken from the first line (later title changes ignored)', () => {
    expect(
      summarizePaymentsByMethod([
        { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 2300 },
        { methodId: 'cash', methodTitle: 'CASH (renamed)', amountHalalas: 2300 },
      ]),
    ).toEqual([{ methodId: 'cash', methodTitle: 'Cash', totalHalalas: 4600 }]);
  });
});
