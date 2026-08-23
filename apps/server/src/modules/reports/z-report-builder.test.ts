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
      expectedCashHalalas: 52300,
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('Z-REPORT');
    expect(text).toContain('SpicyHome');
    expect(text).toContain('2026-07-22');
    expect(text).toContain('Opening Cash');
    expect(text).toContain('Closing Cash');
    expect(text).toContain('Total Sales');
    expect(text).toContain('Total VAT');
    expect(text).not.toContain('SALES BY PAYMENT METHOD');
    expect(text).not.toContain('SALES BY CATEGORY');
    expect(text).not.toContain('CANCELLATIONS AFTER KITCHEN PRINT');
    expect(text).not.toContain('HungerStation');
    expect(text).not.toContain('Keeta');
    expect(text).toContain('500.00');
    expect(text).toContain('523.00');
    expect(text).toContain('23.00');
    expect(text).toContain('3.00');
    expect(text).toContain('Paid Orders');
  });

  it('prints a Sales by Payment Method section from the provided totals', () => {
    const builder = new ZReportBuilder();
    const buffer = builder.build({
      businessDate: '2026-07-22',
      status: 'closed',
      openingCashHalalas: 0,
      closingCashHalalas: 0,
      totalSalesHalalas: 9200,
      totalVatHalalas: 1200,
      paidOrderCount: 3,
      voidedOrderCount: 0,
      restaurantName: 'SpicyHome',
      expectedCashHalalas: 0,
      paymentTotals: [
        { methodId: 'cash', methodTitle: 'Cash', totalHalalas: 2300 },
        { methodId: 'card', methodTitle: 'Card', totalHalalas: 2300 },
        { methodId: 'hungerstation', methodTitle: 'HungerStation', totalHalalas: 4600 },
      ],
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('SALES BY PAYMENT METHOD');
    expect(text).toContain('Cash');
    expect(text).toContain('Card');
    expect(text).toContain('HungerStation');
    expect(text).toContain('23.00');
    expect(text).toContain('46.00');
    expect(text).not.toContain('Keeta');
    const section = text.indexOf('SALES BY PAYMENT METHOD');
    expect(section).toBeGreaterThan(text.indexOf('Total VAT'));
    expect(text.indexOf('Cash', section)).toBeLessThan(text.indexOf('Card', section));
    expect(text.indexOf('Card', section)).toBeLessThan(text.indexOf('HungerStation', section));
  });

  it('prints a Sales by Category section above SALES', () => {
    const builder = new ZReportBuilder();
    const buffer = builder.build({
      businessDate: '2026-07-22',
      status: 'closed',
      openingCashHalalas: 0,
      closingCashHalalas: 0,
      totalSalesHalalas: 6900,
      totalVatHalalas: 900,
      paidOrderCount: 2,
      voidedOrderCount: 0,
      restaurantName: 'SpicyHome',
      expectedCashHalalas: 0,
      salesByCategory: [
        { categoryName: 'Breads', itemCount: 12, totalHalalas: 2300 },
        { categoryName: 'Starters', itemCount: 5, totalHalalas: 4600 },
      ],
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('SALES BY CATEGORY');
    expect(text).toContain('Breads');
    expect(text).toContain('x12');
    expect(text).toContain('23.00');
    expect(text).toContain('Starters');
    expect(text).toContain('x5');
    expect(text).toContain('46.00');
    expect(text.indexOf('SALES BY CATEGORY')).toBeGreaterThan(text.indexOf('CASH'));
    expect(text.indexOf('SALES BY CATEGORY')).toBeLessThan(text.indexOf('Total Sales'));
    expect(text.indexOf('Breads')).toBeLessThan(text.indexOf('Starters'));
  });

  it('prints cancellations after kitchen print between category sales and SALES', () => {
    const builder = new ZReportBuilder();
    const buffer = builder.build({
      businessDate: '2026-07-22',
      status: 'closed',
      openingCashHalalas: 0,
      closingCashHalalas: 0,
      totalSalesHalalas: 6900,
      totalVatHalalas: 900,
      paidOrderCount: 2,
      voidedOrderCount: 0,
      restaurantName: 'SpicyHome',
      expectedCashHalalas: 0,
      salesByCategory: [{ categoryName: 'Breads', itemCount: 12, totalHalalas: 2300 }],
      kitchenCancelledByCategory: [
        { categoryName: 'Breads', itemCount: 3, totalHalalas: 1500 },
        { categoryName: 'Starters', itemCount: 1, totalHalalas: 800 },
      ],
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('CANCELLATIONS AFTER KITCHEN PRINT');
    expect(text).toContain('x3');
    expect(text).toContain('15.00');
    expect(text).toContain('x1');
    expect(text).toContain('8.00');
    expect(text.indexOf('SALES BY CATEGORY')).toBeLessThan(
      text.indexOf('CANCELLATIONS AFTER KITCHEN PRINT'),
    );
    expect(text.indexOf('CANCELLATIONS AFTER KITCHEN PRINT')).toBeLessThan(
      text.indexOf('Total Sales'),
    );
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
      expectedCashHalalas: 50000,
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('X-REPORT');
  });

  it('includes expected cash calculation using explicit expectedCashHalalas', () => {
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
      expectedCashHalalas: 50000 + 500, // opening + cash payments (not total sales)
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('Expected');
    expect(text).toContain('505.00'); // 500.00 + 5.00 = 505.00 SAR
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
      expectedCashHalalas: 0,
    });

    const text = buffer.toString('ascii');
    expect(text).toContain('Voided Orders');
    expect(text).toContain('3');
  });
});
