import { ZReportBuilder } from './z-report-builder';

describe('ZReportBuilder', () => {
  it('produces a buffer with Z-report header', () => {
    const builder = new ZReportBuilder();
    const buffer = builder.build({
      businessDate: '2026-07-22',
      status: 'closed',
      openingCashHalalas: 50000,
      closingCashHalalas: 52300,
      totalSalesHalalas: 2300,
      totalVatHalalas: 300,
      paidOrderCount: 1,
      voidedOrderCount: 0,
      restaurantName: 'SpicyHome',
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('Z-REPORT');
    expect(text).toContain('SpicyHome');
    expect(text).toContain('2026-07-22');
    expect(text).toContain('Opening Cash');
    expect(text).toContain('Closing Cash');
    expect(text).toContain('Total Sales');
    expect(text).toContain('Total VAT');
    expect(text).toContain('500.00');
    expect(text).toContain('523.00');
    expect(text).toContain('23.00');
    expect(text).toContain('3.00');
    expect(text).toContain('Paid Orders');
  });

  it('produces X-report header for open status', () => {
    const builder = new ZReportBuilder();
    const buffer = builder.build({
      businessDate: '2026-07-22',
      status: 'open',
      openingCashHalalas: 50000,
      closingCashHalalas: 0,
      totalSalesHalalas: 0,
      totalVatHalalas: 0,
      paidOrderCount: 0,
      voidedOrderCount: 0,
      restaurantName: 'Test',
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('X-REPORT');
  });

  it('includes expected cash calculation', () => {
    const builder = new ZReportBuilder();
    const buffer = builder.build({
      businessDate: '2026-07-22',
      status: 'closed',
      openingCashHalalas: 50000,
      closingCashHalalas: 60000,
      totalSalesHalalas: 2300,
      totalVatHalalas: 300,
      paidOrderCount: 1,
      voidedOrderCount: 0,
      restaurantName: 'Test',
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('Expected');
    expect(text).toContain('523.00');
    expect(text).toContain('Difference');
  });

  it('includes voided count when present', () => {
    const builder = new ZReportBuilder();
    const buffer = builder.build({
      businessDate: '2026-07-22',
      status: 'closed',
      openingCashHalalas: 0,
      closingCashHalalas: 0,
      totalSalesHalalas: 2300,
      totalVatHalalas: 300,
      paidOrderCount: 1,
      voidedOrderCount: 3,
      restaurantName: 'Test',
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('Voided Orders');
    expect(text).toContain('3');
  });
});
