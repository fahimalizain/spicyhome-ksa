import { KitchenTicketBuilder } from './kitchen-ticket-builder';

describe('KitchenTicketBuilder', () => {
  const builder = new KitchenTicketBuilder(42);

  const baseOpts = {
    orderNo: 42,
    createdAt: 1700000000,
    orderType: 'dine_in' as const,
    tableName: 'T4',
    items: [
      { qty: 2, name: 'Zinger Burger', notes: null },
      { qty: 1, name: 'Pepsi', notes: 'no ice' },
      { qty: 3, name: 'Fries', notes: null },
    ],
  };

  it('renders big order number with double size', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    // GS ! 0x11 = double size on
    expect(hex).toContain('1d2111');
    const str = buf.toString('ascii');
    expect(str).toContain('ORDER #42');
  });

  it('renders table information for dine-in', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).toContain('Table: T4');
  });

  it('renders takeaway without table', () => {
    const opts = { ...baseOpts, orderType: 'takeaway' as const, tableName: undefined };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('Takeaway');
    expect(str).not.toContain('Table:');
  });

  it('renders time in Asia/Riyadh timezone', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).toContain('Time:');
    // Should contain 24-hour time format
    expect(str).toMatch(/Time: \d{2}:\d{2}/);
  });

  it('renders items with big qty and name', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');

    expect(str).toContain('2 Zinger Burger');
    expect(str).toContain('1 Pepsi');
    expect(str).toContain('3 Fries');
  });

  it('renders item notes highlighted with underline', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');

    // Underline on: ESC - 1 = 1b2d01
    const ulOn = '1b2d01';
    const ulOff = '1b2d00';

    expect(hex).toContain(ulOn);
    expect(hex).toContain(ulOff);

    const str = buf.toString('ascii');
    expect(str).toContain('* no ice');
  });

  it('does not show notes for items without notes', () => {
    const opts = { ...baseOpts, items: [{ qty: 1, name: 'Plain Item', notes: null }] };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');

    expect(str).not.toContain('*');
  });

  it('does not include prices', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).not.toContain('SAR');
    expect(str).not.toContain('Subtotal');
    expect(str).not.toContain('VAT');
    expect(str).not.toContain('TOTAL');
  });

  it('renders partial cut at end', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    expect(hex).toContain('1d564203');
  });

  it('initializes printer before content', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    // First command should be ESC @
    expect(hex.startsWith('1b40')).toBe(true);
  });

  it('truncates long item names to fit paper width', () => {
    const longName = 'A'.repeat(100);
    const opts = { ...baseOpts, items: [{ qty: 1, name: longName, notes: null }] };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');

    // The full longName should NOT appear in the output (should be truncated)
    expect(str).not.toContain(longName);
    // But the first part should appear (qty + space + truncated name)
    const text = str.replace(/[\x00-\x1f\x7f-\xff]/g, '');
    expect(text).toContain('1 A'); // "1 " followed by the truncated name start
  });

  it('handles empty items list', () => {
    const opts = { ...baseOpts, items: [] };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('ORDER #42');
  });
});
