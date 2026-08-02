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

  it('renders time in Asia/Riyadh timezone as 12-hour with AM/PM', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    // baseOpts.createdAt = 1700000000 → 2023-11-14 22:13 UTC → Asia/Riyadh 01:13 AM
    expect(str).toContain('Time: 01:13 AM');
    // 12-hour format with explicit AM/PM marker
    expect(str).toMatch(/Time: \d{1,2}:\d{2} (AM|PM)/);
  });

  it('renders afternoon times as PM (not 24-hour)', () => {
    // 1700048700 → 2023-11-15 11:45 UTC → Asia/Riyadh 02:45 PM
    const opts = { ...baseOpts, createdAt: 1700048700 };
    const str = builder.build(opts).toString('ascii');
    expect(str).toContain('Time: 02:45 PM');
    // Not pure 24h — "14:45" without AM/PM must not appear
    expect(str).not.toContain('Time: 14:45');
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

  // ── Order creator ─────────────────────────────────────────────────────────────

  it('renders "Created By:" with the creator display name when createdByName is set', () => {
    const opts = { ...baseOpts, createdByName: 'Admin' };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('Created By: Admin');
    // Between the Time line and the NOTES section
    expect(str.indexOf('Created By: Admin')).toBeGreaterThan(str.indexOf('Time:'));
  });

  it('omits the "Created By:" line when createdByName is missing/null/empty/whitespace', () => {
    expect(builder.build(baseOpts).toString('ascii')).not.toContain('Created By:');

    const optsNull = { ...baseOpts, createdByName: null };
    expect(builder.build(optsNull).toString('ascii')).not.toContain('Created By:');

    const optsEmpty = { ...baseOpts, createdByName: '' };
    expect(builder.build(optsEmpty).toString('ascii')).not.toContain('Created By:');

    const optsBlank = { ...baseOpts, createdByName: '   ' };
    expect(builder.build(optsBlank).toString('ascii')).not.toContain('Created By:');

    const optsUndefined = { ...baseOpts };
    expect(builder.build(optsUndefined).toString('ascii')).not.toContain('Created By:');
  });

  it('truncates a long creator name to paper width', () => {
    const longName = 'A'.repeat(100);
    const opts = { ...baseOpts, createdByName: longName };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    // Full name must not appear; the truncated "Created By: " + name prefix does
    expect(str).not.toContain(longName);
    const text = str.replace(/[\x00-\x1f\x7f-\xff]/g, '');
    expect(text).toContain('Created By: ' + 'A'.repeat(30)); // 42 - 12 (len of "Created By: ")
  });

  it('renders items as name/Qty/Notes blocks with name, Qty and optional Notes', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');

    // Dash-prefixed name line, indented Qty line, optional indented Notes line
    expect(str).toContain('- Zinger Burger');
    expect(str).toContain('    Qty: 2x');
    expect(str).toContain('- Pepsi');
    expect(str).toContain('    Qty: 1x');
    expect(str).toContain('    Notes: no ice');
    expect(str).toContain('- Fries');
    expect(str).toContain('    Qty: 3x');

    // No old "qty name" single-line format, no old "  * notes" format
    expect(str).not.toContain('2 Zinger Burger');
    expect(str).not.toContain('* no ice');

    // Item names are bold only, at normal size: ESC E 0x01 immediately before
    // the name line (including its "- " prefix), with no double-height
    // (GS ! 0x10) and no full double size (GS ! 0x11) emitted for the text.
    const hex = buf.toString('hex');
    const itemHex = Buffer.from('- Zinger Burger', 'ascii').toString('hex');
    const idx = hex.indexOf(itemHex);
    expect(idx).not.toBe(-1);
    // Bold on immediately before the full "- Name" line; no character-size commands.
    expect(hex.slice(idx - 6, idx)).toBe('1b4501'); // bold on
    expect(hex.slice(idx - 6, idx)).not.toBe('1d2110'); // NOT double height
    expect(hex.slice(idx - 6, idx)).not.toBe('1d2111'); // NOT full double size

    // Second item name line follows the same pattern (after off/reset + blank line).
    const pepsiHex = Buffer.from('- Pepsi', 'ascii').toString('hex');
    const idxPepsi = hex.indexOf(pepsiHex);
    expect(idxPepsi).not.toBe(-1);
    expect(hex.slice(idxPepsi - 6, idxPepsi)).toBe('1b4501'); // bold on
    expect(hex.slice(idxPepsi - 6, idxPepsi)).not.toBe('1d2110'); // NOT double height
  });

  it('adds a blank line between item blocks', () => {
    const buf = builder.build(baseOpts);
    const str = buf.toString('ascii');
    const countLf = (s: string) => (s.match(/\n/g) || []).length;

    // Item without notes: name LF + Qty LF + blank line LF (blank separates
    // item blocks).
    const noNotesBlock = str.slice(
      str.indexOf('- Zinger Burger') + '- Zinger Burger'.length,
      str.indexOf('- Pepsi'),
    );
    expect(countLf(noNotesBlock)).toBe(3);

    // Item with notes: name LF + Qty LF + Notes LF + blank line LF — no blank
    // line between Qty and Notes (notes stay attached to their item).
    const qtyToNotes = str.slice(str.indexOf('Qty: 1x'), str.indexOf('Notes: no ice'));
    expect(countLf(qtyToNotes)).toBe(1);

    const notesBlock = str.slice(str.indexOf('- Pepsi') + '- Pepsi'.length, str.indexOf('- Fries'));
    expect(countLf(notesBlock)).toBe(4);

    // Blank line after the last item block before the bottom separator as well.
    const beforeSep = str.slice(str.indexOf('- Fries') + '- Fries'.length, str.lastIndexOf('===='));
    expect(countLf(beforeSep)).toBe(3);
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
    expect(str).toContain('    Notes: no ice');
  });

  it('does not show notes for items without notes', () => {
    const opts = { ...baseOpts, items: [{ qty: 1, name: 'Plain Item', notes: null }] };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');

    expect(str).not.toContain('Notes:');
    // Single plain item still renders its dash-prefixed name + Qty block
    expect(str).toContain('- Plain Item');
    expect(str).toContain('    Qty: 1x');
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

  it('prints a leading dashed spacer with blank lines before content', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    // init first
    expect(hex.startsWith('1b40')).toBe(true);

    const str = buf.toString('ascii');
    const dashLine = '-'.repeat(42);
    const firstDash = str.indexOf(dashLine);
    const secondDash = str.indexOf(dashLine, firstDash + dashLine.length);
    const contentStart = str.indexOf('INV26-0042');

    expect(firstDash).toBeGreaterThan(-1);
    expect(secondDash).toBeGreaterThan(firstDash);
    expect(contentStart).toBeGreaterThan(secondDash);

    // Between the two dashed lines: exactly LEADING_SPACER_LINES newlines
    // (separator itself ends with LF, so the gap between end of first dash
    // line content and start of second is: LF from first sep + N blank LFs)
    const between = str.slice(firstDash + dashLine.length, secondDash);
    const lfCount = (between.match(/\n/g) || []).length;
    expect(lfCount).toBe(1 + 5); // trailing LF of first separator + 5 blank lines
  });

  it('truncates long item names to fit paper width', () => {
    const longName = 'A'.repeat(100);
    const opts = { ...baseOpts, items: [{ qty: 1, name: longName, notes: null }] };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');

    // The full longName should NOT appear in the output (should be truncated)
    expect(str).not.toContain(longName);
    // "- " (2 chars) + name truncated to 42 chars total, so the name part is
    // 40 A's after the prefix: ("- " + "A"*100).slice(0, 42).
    const text = str.replace(/[\x00-\x1f\x7f-\xff]/g, '');
    expect(text).toContain('- ' + 'A'.repeat(40)); // 42 - len("- ")
  });

  it('renders order notes and item notes together on the same ticket', () => {
    const opts = { ...baseOpts, orderNotes: 'Call on arrival' };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('NOTES: Call on arrival');
    expect(str).toContain('    Notes: no ice');
  });

  it('handles empty items list', () => {
    const opts = { ...baseOpts, items: [] };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('INV26-0042');
    // Leading tear-off spacer is still present without any items
    expect(str.indexOf('-'.repeat(42))).toBeGreaterThan(-1);
  });
});
