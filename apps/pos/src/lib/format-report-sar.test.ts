import { describe, it, expect } from 'vitest';
import { formatReportSarNumber } from './format-report-sar';

describe('formatReportSarNumber', () => {
  it('formats zero', () => {
    expect(formatReportSarNumber(0)).toEqual({ negative: false, amount: '0.00' });
  });

  it('formats single halala', () => {
    expect(formatReportSarNumber(1)).toEqual({ negative: false, amount: '0.01' });
  });

  it('formats 99 halalas', () => {
    expect(formatReportSarNumber(99)).toEqual({ negative: false, amount: '0.99' });
  });

  it('formats 2300 halalas without grouping', () => {
    expect(formatReportSarNumber(2300)).toEqual({ negative: false, amount: '23.00' });
  });

  it('groups thousands (123456 halalas)', () => {
    expect(formatReportSarNumber(123456)).toEqual({ negative: false, amount: '1,234.56' });
  });

  it('marks negative values and keeps the amount unsigned', () => {
    expect(formatReportSarNumber(-2300)).toEqual({ negative: true, amount: '23.00' });
  });

  it('groups large negative values', () => {
    expect(formatReportSarNumber(-123456)).toEqual({ negative: true, amount: '1,234.56' });
  });

  it('throws on non-integer halalas', () => {
    expect(() => formatReportSarNumber(1.5)).toThrow('expected integer, got 1.5');
  });

  it('throws on non-finite halalas', () => {
    expect(() => formatReportSarNumber(NaN)).toThrow('expected integer');
    expect(() => formatReportSarNumber(Infinity)).toThrow('expected integer');
  });
});
