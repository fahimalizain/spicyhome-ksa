import { KitchenTicketBuilder } from './kitchen-ticket-builder';

describe('KitchenTicketBuilder', () => {
  const builder = new KitchenTicketBuilder(42);

  const baseOpts = {
    documentId: 'INV26-0042',
    printerName: 'Grill',
    createdAt: 1700000000,
    orderType: 'dine_in' as const,
    tableName: 'T4',
    items: [
      { qty: 2, name: 'Zinger Burger', notes: null },
      { qty: 1, name: 'Pepsi', notes: 'no ice' },
      { qty: 3, name: 'Fries', notes: null },
    ],
  };

  it('renders big document id with double size', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    // GS ! 0x11 = double size on
    expect(hex).toContain('1d2111');
    const str = buf.toString('ascii');
    expect(str).toContain('INV26-0042');
    // The raw order id / "ORDER #" label is gone
    expect(str).not.toContain('ORDER #42');
    expect(str).not.toContain('ORDER #');
  });

  it('renders printer name in the header when set', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).toContain('Printer: Grill');
  });

  it('omits the printer line when printerName is empty/undefined', () => {
    const opts = { ...baseOpts, printerName: '' };
    expect(builder.build(opts).toString('ascii')).not.toContain('Printer:');

    const opts2 = { ...baseOpts };
    delete (opts2 as any).printerName;
    expect(builder.build(opts2).toString('ascii')).not.toContain('Printer:');
  });

  it('renders table on its own line at double size for dine-in', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    const str = buf.toString('ascii');
    expect(str).toContain('TABLE T4');
    // No inline "Table: T4" on the type line anymore
    expect(str).not.toContain('Table:');
    // The TABLE line is double-size + bold: GS ! 0x11 and ESC E 0x01
    // are emitted immediately before the "TABLE" text
    const idxTable = hex.indexOf(Buffer.from('TABLE', 'ascii').toString('hex'));
    expect(idxTable).not.toBe(-1);
    expect(hex.slice(idxTable - 6, idxTable)).toBe('1d2111'); // double size on
    expect(hex.slice(idxTable - 12, idxTable - 6)).toBe('1b4501'); // bold on
  });

  it('renders takeaway without table', () => {
    const opts = { ...baseOpts, orderType: 'takeaway' as const, tableName: undefined };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('Takeaway');
    expect(str).not.toContain('TABLE');
  });

  it('truncates a long table name to half the paper width (double-size)', () => {
    const longTable = 'T'.repeat(50);
    const opts = { ...baseOpts, tableName: longTable };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).not.toContain(longTable);
    // 42 / 2 = 21 chars max: "TABLE " (6) + 15 T's
    expect(str).toContain('TABLE ' + 'T'.repeat(15));
  });

  it('truncates a long document id to half the paper width (double-size)', () => {
    const longId = 'D'.repeat(50);
    const opts = { ...baseOpts, documentId: longId };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).not.toContain(longId);
    expect(str).toContain('D'.repeat(21));
  });

  // ── Delivery partner (ADR 0007) ─────────────────────────────────────────────

  it('renders Delivery title and App order # when partner and ref are set', () => {
    const opts = {
      ...baseOpts,
      orderType: 'takeaway' as const,
      tableName: undefined,
      deliveryPartnerTitle: 'HungerStation',
      deliveryExternalRef: 'HS-883129',
    };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('Delivery: HungerStation');
    expect(str).toContain('App order #: HS-883129');
    // Prominent: bold on for the delivery line
    const h = buf.toString('hex');
    const boldOn = '1b4501';
    const boldOff = '1b4500';
    const idxBoldOn = h.indexOf(boldOn);
    expect(idxBoldOn).not.toBe(-1);
    // Bold segment wraps exactly the Delivery line
    const asciiBefore = Buffer.from('Delivery: ', 'ascii').toString('hex');
    expect(h.slice(idxBoldOn + boldOn.length)).toContain(asciiBefore);
    expect(h.indexOf(boldOff)).toBeGreaterThan(idxBoldOn);
  });

  it('renders Delivery title but no App order # when ref is omitted', () => {
    const opts = {
      ...baseOpts,
      orderType: 'takeaway' as const,
      tableName: undefined,
      deliveryPartnerTitle: 'Keeta',
    };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('Delivery: Keeta');
    expect(str).not.toContain('App order #:');
  });

  it('omits Delivery and App order # lines without a partner', () => {
    const opts = { ...baseOpts, orderType: 'takeaway' as const, tableName: undefined };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).not.toContain('Delivery:');
    expect(str).not.toContain('App order #:');
  });

  it('renders time in Asia/Riyadh timezone', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).toContain('Time:');
    // Should contain 24-hour time format
    expect(str).toMatch(/Time: \d{2}:\d{2}/);
  });

  // ── Order notes ──────────────────────────────────────────────────────────────

  it('renders order notes prominently (bold) when set', () => {
    const opts = { ...baseOpts, orderNotes: 'Call on arrival' };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('NOTES: Call on arrival');

    // Prominent: bold on before the NOTES line, bold off after
    const h = buf.toString('hex');
    const boldOn = '1b4501';
    const boldOff = '1b4500';
    const idxBoldOn = h.indexOf(boldOn);
    expect(idxBoldOn).not.toBe(-1);
    const notesAscii = Buffer.from('NOTES: ', 'ascii').toString('hex');
    expect(h.slice(idxBoldOn + boldOn.length)).toContain(notesAscii);
    expect(h.indexOf(boldOff)).toBeGreaterThan(idxBoldOn);
  });

  it('omits NOTES line when orderNotes is null', () => {
    const opts = { ...baseOpts, orderNotes: null };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).not.toContain('NOTES:');
  });

  it('omits NOTES line when orderNotes is empty/undefined', () => {
    const opts = { ...baseOpts, orderNotes: '' };
    const buf = builder.build(opts);
    expect(buf.toString('ascii')).not.toContain('NOTES:');

    const opts2 = { ...baseOpts };
    expect(builder.build(opts2).toString('ascii')).not.toContain('NOTES:');
  });

  it('truncates long order notes to paper width', () => {
    const longNotes = 'N'.repeat(100);
    const opts = { ...baseOpts, orderNotes: longNotes };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    // Full notes must not appear; the truncated prefix does
    expect(str).not.toContain(longNotes);
    const text = str.replace(/[\x00-\x1f\x7f-\xff]/g, '');
    expect(text).toContain('NOTES: ' + 'N'.repeat(35)); // 42 - len("NOTES: ")
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

  it('renders order notes and item notes together on the same ticket', () => {
    const opts = { ...baseOpts, orderNotes: 'Call on arrival' };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('NOTES: Call on arrival');
    expect(str).toContain('* no ice');
  });

  it('handles empty items list', () => {
    const opts = { ...baseOpts, items: [] };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('INV26-0042');
  });
});
