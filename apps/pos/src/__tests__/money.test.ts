import { describe, it, expect } from 'vitest';
import { halalasToSar, decomposeVat, computeVatInclusive } from '@spicyhome/shared';

describe('Money helpers (SAR display)', () => {
  it('formats 0 as 0.00', () => {
    expect(halalasToSar(0)).toBe('0.00');
  });

  it('formats 100 as 1.00', () => {
    expect(halalasToSar(100)).toBe('1.00');
  });

  it('formats 2300 as 23.00', () => {
    expect(halalasToSar(2300)).toBe('23.00');
  });

  it('formats 50 as 0.50', () => {
    expect(halalasToSar(50)).toBe('0.50');
  });

  it('formats 5 as 0.05', () => {
    expect(halalasToSar(5)).toBe('0.05');
  });

  it('throws on non-integer', () => {
    expect(() => halalasToSar(1.5)).toThrow();
  });
});

describe('VAT decomposition', () => {
  it('decomposes SAR 23 at 15% VAT', () => {
    const { vatHalalas, priceExclHalalas } = decomposeVat(2300, 1500);
    expect(priceExclHalalas).toBe(2000);
    expect(vatHalalas).toBe(300);
    expect(priceExclHalalas + vatHalalas).toBe(2300);
  });

  it('decomposes SAR 10 at 15% VAT', () => {
    const { vatHalalas, priceExclHalalas } = decomposeVat(1000, 1500);
    expect(priceExclHalalas).toBe(870);
    expect(vatHalalas).toBe(130);
  });

  it('handles zero VAT', () => {
    const { vatHalalas, priceExclHalalas } = decomposeVat(1000, 0);
    expect(priceExclHalalas).toBe(1000);
    expect(vatHalalas).toBe(0);
  });

  it('round trip error is at most 1 halala', () => {
    for (let price = 1; price <= 10000; price++) {
      const err = (() => {
        const { priceExclHalalas } = decomposeVat(price, 1500);
        const recomposed = computeVatInclusive(priceExclHalalas, 1500);
        return Math.abs(price - recomposed);
      })();
      expect(err).toBeLessThanOrEqual(1);
    }
  });
});
