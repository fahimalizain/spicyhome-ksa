import { decomposeVat } from '@spicyhome/shared';

describe('Order Totals Computation', () => {
  function recomputeOrderTotals(items: Array<{ totalHalalas: number; vatRateBp: number }>) {
    let subtotal = 0;
    let vat = 0;
    let total = 0;
    for (const item of items) {
      const d = decomposeVat(item.totalHalalas, item.vatRateBp);
      subtotal += d.priceExclHalalas;
      vat += d.vatHalalas;
      total += item.totalHalalas;
    }
    return { subtotalHalalas: subtotal, vatHalalas: vat, totalHalalas: total };
  }

  it('computes correct totals for single item', () => {
    const items = [{ totalHalalas: 2300, vatRateBp: 1500 }];
    const totals = recomputeOrderTotals(items);
    expect(totals.totalHalalas).toBe(2300);
    expect(totals.subtotalHalalas + totals.vatHalalas).toBe(totals.totalHalalas);
    expect(totals.vatHalalas).toBeGreaterThan(0);
  });

  it('computes correct totals for multiple items with same VAT', () => {
    const items = [
      { totalHalalas: 2300, vatRateBp: 1500 },
      { totalHalalas: 1150, vatRateBp: 1500 },
    ];
    const totals = recomputeOrderTotals(items);
    expect(totals.totalHalalas).toBe(3450);
    expect(totals.subtotalHalalas + totals.vatHalalas).toBe(totals.totalHalalas);
  });

  it('handles empty items list', () => {
    const totals = recomputeOrderTotals([]);
    expect(totals.subtotalHalalas).toBe(0);
    expect(totals.vatHalalas).toBe(0);
    expect(totals.totalHalalas).toBe(0);
  });

  it('handles 0% VAT items', () => {
    const items = [{ totalHalalas: 1000, vatRateBp: 0 }];
    const totals = recomputeOrderTotals(items);
    expect(totals.subtotalHalalas).toBe(1000);
    expect(totals.vatHalalas).toBe(0);
    expect(totals.totalHalalas).toBe(1000);
  });

  it('handles mixed VAT rates', () => {
    const items = [
      { totalHalalas: 2300, vatRateBp: 1500 },
      { totalHalalas: 1000, vatRateBp: 0 },
    ];
    const totals = recomputeOrderTotals(items);
    expect(totals.totalHalalas).toBe(3300);
    expect(totals.subtotalHalalas + totals.vatHalalas).toBe(totals.totalHalalas);
  });

  it('round-trip consistency: subtotal + vat = total', () => {
    for (let i = 1; i <= 100; i++) {
      const price = i * 100;
      const items = [{ totalHalalas: price, vatRateBp: 1500 }];
      const totals = recomputeOrderTotals(items);
      expect(totals.subtotalHalalas + totals.vatHalalas).toBe(totals.totalHalalas);
    }
  });
});
