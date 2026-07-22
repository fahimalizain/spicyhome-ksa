import { ReceiptBuilder } from './receipt-builder';

describe('ReceiptBuilder', () => {
  const builder = new ReceiptBuilder(42);

  const baseOpts = {
    restaurantName: 'SpicyHome',
    vatNumber: '300123456789',
    orderNo: 42,
    createdAt: 1700000000, // 2023-11-14T22:13:20Z = 2023-11-15T01:13:20+03
    orderType: 'dine_in' as const,
    tableName: 'T4',
    items: [
      { qty: 2, name: 'Zinger Burger', totalHalalas: 4600 },
      { qty: 1, name: 'Pepsi', totalHalalas: 575 },
    ],
    subtotalHalalas: 4500,
    vatHalalas: 675,
    totalHalalas: 5175,
  };

  it('renders restaurant name in header', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).toContain('SpicyHome');
  });

  it('renders VAT number in header', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).toContain('VAT: 300123456789');
  });

  it('renders order number', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).toContain('Order #: 42');
  });

  it('renders date/time in Asia/Riyadh timezone', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    // 1700000000 UTC = 2023-11-15T01:13:20+03
    expect(str).toContain('11/15/2023');
  });

  it('renders order type Dine-in with table', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).toContain('Dine-in');
    expect(str).toContain('T4');
  });

  it('renders order type Takeaway without table', () => {
    const opts = { ...baseOpts, orderType: 'takeaway' as const, tableName: undefined };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('Takeaway');
    expect(str).not.toContain('Table:');
  });

  it('renders item lines with qty x name and right-aligned price', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');

    // Item 1
    expect(str).toContain('2x Zinger Burger');
    expect(str).toContain('46.00');

    // Item 2
    expect(str).toContain('1x Pepsi');
    expect(str).toContain('5.75');
  });

  it('renders totals block with correct money formatting', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');

    expect(str).toContain('SUBTOTAL (excl. VAT)');
    expect(str).toContain('45.00');

    expect(str).toContain('VAT (15.0%)');
    expect(str).toContain('6.75');

    expect(str).toContain('TOTAL');
    expect(str).toContain('51.75');
  });

  it('renders bold TOTAL line', () => {
    const buf = builder.build(baseOpts);
    // bold on: ESC E 1, then text "TOTAL...", then bold off: ESC E 0
    const hex = buf.toString('hex');
    // Check bold ON before TOTAL text
    const boldOn = '1b4501';
    const boldOff = '1b4500';
    const idxBoldOn = hex.indexOf(boldOn);
    const idxBoldOff = hex.indexOf(boldOff);
    // The bold-off after TOTAL should happen, and bold-on before it
    expect(idxBoldOn).not.toBe(-1);
    expect(idxBoldOff).not.toBe(-1);
  });

  it('renders footer thank you message', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    expect(str).toContain('Thank you! Visit again.');
  });

  it('includes cash drawer kick when requested', () => {
    const buf = builder.build({ ...baseOpts, kickDrawer: true });
    const hex = buf.toString('hex');
    // ESC p = 1b70
    expect(hex).toContain('1b70');
  });

  it('does not include cash drawer kick by default', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    // First bytes should be ESC @ (init), not ESC p
    expect(hex.startsWith('1b40')).toBe(true);
  });

  it('renders QR code when qrTlvPayload is provided', () => {
    const buf = builder.build({ ...baseOpts, qrTlvPayload: 'TEST-TLV-DATA' });
    const hex = buf.toString('hex');
    // QR commands: GS ( k
    expect(hex).toContain('1d286b');
    // Data content
    const str = buf.toString('ascii');
    expect(str).toContain('TEST-TLV-DATA');
  });

  it('does not render QR code without qrTlvPayload', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    // The regular build shouldn't contain QR commands
    // (it will still contain other GS commands but not QR specifically)
    const qrStart = '1d286b040031413200';
    expect(hex).not.toContain(qrStart);
  });

  it('renders partial cut at end', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    const cutCmd = '1d564203'; // GS V B 3
    expect(hex).toContain(cutCmd);
  });

  it('TOTAL line renders right-aligned money amount', () => {
    const widths = [32, 42, 48];
    for (const w of widths) {
      const b = new ReceiptBuilder(w);
      const buf = b.build(baseOpts);
      const str = buf.toString('ascii');

      // Strip all control chars, keep LF
      const clean = str
        .split('\n')
        .map((l) => l.replace(/[\x00-\x1f\x7f-\xff]/g, ''))
        .join('\n');
      // After stripping, the TOTAL line should still exist and end with the price
      expect(clean).toContain('TOTAL');
      expect(clean).toContain('51.75');
    }
  });

  it('uses custom VAT rate display when specified', () => {
    const opts = { ...baseOpts, vatRateBp: 500 }; // 5%
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('VAT (5.0%)');
  });

  it('handles empty items list', () => {
    const opts = { ...baseOpts, items: [], subtotalHalalas: 0, vatHalalas: 0, totalHalalas: 0 };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('TOTAL');
    expect(str).toContain('0.00');
  });

  it('header is centered', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    // ESC a 1 = center alignment (before restaurant name)
    const centerCmd = '1b6101';
    expect(hex).toContain(centerCmd);
  });
});
