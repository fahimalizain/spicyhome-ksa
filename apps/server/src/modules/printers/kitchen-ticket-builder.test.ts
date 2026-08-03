import { KitchenTicketBuilder } from './kitchen-ticket-builder';

/** Strip ESC/POS control bytes so raster tickets are readable in assertions. */
function printable(buf: Buffer): string {
  return buf.toString('latin1').replace(/[\x00-\x1f\x7f-\xff]/g, '');
}

describe('KitchenTicketBuilder', () => {
  const builder = new KitchenTicketBuilder(42);

  const baseOpts = {
    documentId: 'INV26-0042',
    printerName: 'Grill',
    createdAt: 1700000000,
    orderType: 'dine_in' as const,
    tableName: 'T4',
    items: [
      { qty: 2, name: 'Zinger Burger', notes: null as string | null },
      { qty: 1, name: 'Pepsi', notes: 'no ice' },
      { qty: 3, name: 'Fries', notes: null as string | null },
    ],
  };

  it('renders big document id with double size', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    expect(hex).toContain('1d2111'); // GS ! 0x11 double size
    const str = buf.toString('ascii');
    expect(str).toContain('INV26-0042');
    expect(str).not.toContain('ORDER #42');
    expect(str).not.toContain('ORDER #');
  });

  it('renders printer name under date/time when set', () => {
    const str = builder.build(baseOpts).toString('ascii');
    expect(str).toContain('Printer: Grill');
    expect(str.indexOf('Printer: Grill')).toBeGreaterThan(str.indexOf('Time:'));
  });

  it('omits the printer line when printerName is empty/undefined', () => {
    expect(builder.build({ ...baseOpts, printerName: '' }).toString('ascii')).not.toContain(
      'Printer:',
    );
    const opts2 = { ...baseOpts };
    delete (opts2 as { printerName?: string }).printerName;
    expect(builder.build(opts2).toString('ascii')).not.toContain('Printer:');
  });

  it('renders type banner and TABLE #N at double size for dine-in', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    const str = buf.toString('ascii');
    expect(str).toContain('>>>> Dine-in <<<<');
    expect(str).toContain('TABLE #4');
    expect(str).not.toContain('TABLE T4');
    expect(str).not.toContain('Table:');

    const idxTable = hex.indexOf(Buffer.from('TABLE', 'ascii').toString('hex'));
    expect(idxTable).not.toBe(-1);
    expect(hex.slice(idxTable - 6, idxTable)).toBe('1d2111'); // double size on
    expect(hex.slice(idxTable - 12, idxTable - 6)).toBe('1b4501'); // bold on
  });

  it('renders takeaway type banner at double size without table', () => {
    const opts = { ...baseOpts, orderType: 'takeaway' as const, tableName: undefined };
    const buf = builder.build(opts);
    const hex = buf.toString('hex');
    const str = buf.toString('ascii');
    expect(str).toContain('>>>> Takeaway <<<<');
    expect(str).not.toContain('TABLE');

    const idx = hex.indexOf(Buffer.from('>>>> Takeaway', 'ascii').toString('hex'));
    expect(idx).not.toBe(-1);
    expect(hex.slice(idx - 6, idx)).toBe('1d2111'); // double size on takeaway banner
  });

  it('truncates a long table name to half the paper width (double-size)', () => {
    const longTable = 'T'.repeat(50);
    const opts = { ...baseOpts, tableName: longTable };
    const str = builder.build(opts).toString('ascii');
    expect(str).not.toContain(longTable);
    // Leading T → "#"; "TABLE #" (7) + 14 T's = 21 (half of 42)
    expect(str).toContain('TABLE #' + 'T'.repeat(14));
  });

  it('truncates a long document id to half the paper width (double-size)', () => {
    const longId = 'D'.repeat(50);
    const str = builder.build({ ...baseOpts, documentId: longId }).toString('ascii');
    expect(str).not.toContain(longId);
    expect(str).toContain('D'.repeat(21));
  });

  // ── Delivery partner (ADR 0007) ─────────────────────────────────────────────

  it('renders centered "Title / ref" under the type banner when both are set', () => {
    const opts = {
      ...baseOpts,
      orderType: 'takeaway' as const,
      tableName: undefined,
      deliveryPartnerTitle: 'HungerStation',
      deliveryExternalRef: 'HS-883129',
    };
    const str = builder.build(opts).toString('ascii');
    expect(str).toContain('HungerStation / HS-883129');
    expect(str).not.toContain('Delivery:');
    expect(str).not.toContain('App order #:');
    // Under the takeaway banner
    expect(str.indexOf('HungerStation / HS-883129')).toBeGreaterThan(
      str.indexOf('>>>> Takeaway <<<<'),
    );
  });

  it('renders just the partner title when ref is omitted', () => {
    const opts = {
      ...baseOpts,
      orderType: 'takeaway' as const,
      tableName: undefined,
      deliveryPartnerTitle: 'Keeta',
    };
    const str = builder.build(opts).toString('ascii');
    expect(str).toContain('Keeta');
    expect(str).not.toContain('Delivery:');
    expect(str).not.toContain(' / ');
  });

  it('omits delivery line without a partner', () => {
    const opts = { ...baseOpts, orderType: 'takeaway' as const, tableName: undefined };
    const str = builder.build(opts).toString('ascii');
    expect(str).not.toContain('Delivery:');
    expect(str).not.toContain('App order #:');
    expect(str).not.toContain('HungerStation');
  });

  it('renders date (YYYY-MM-DD) and time in Asia/Riyadh', () => {
    const str = builder.build(baseOpts).toString('ascii');
    // 1700000000 → 2023-11-14 22:13 UTC → Asia/Riyadh 2023-11-15 01:13 AM
    expect(str).toContain('Date: 2023-11-15');
    expect(str).toContain('Time: 01:13 AM');
    expect(str).toMatch(/Time: \d{1,2}:\d{2} (AM|PM)/);
  });

  it('renders afternoon times as PM (not 24-hour)', () => {
    // 1700048700 → 2023-11-15 11:45 UTC → Asia/Riyadh 02:45 PM
    const str = builder.build({ ...baseOpts, createdAt: 1700048700 }).toString('ascii');
    expect(str).toContain('Time: 02:45 PM');
    expect(str).not.toContain('Time: 14:45');
  });

  // ── Order notes ──────────────────────────────────────────────────────────────

  it('renders order notes at the bottom in a dashed section (bold)', () => {
    const opts = { ...baseOpts, orderNotes: 'Call on arrival', totalHalalas: 5175 };
    const buf = builder.build(opts);
    const str = buf.toString('ascii');
    expect(str).toContain('NOTES: Call on arrival');
    // After items / total
    expect(str.indexOf('NOTES: Call on arrival')).toBeGreaterThan(str.indexOf('Total:'));

    const h = buf.toString('hex');
    const notesAscii = Buffer.from('NOTES: Call on arrival', 'ascii').toString('hex');
    const idxNotes = h.indexOf(notesAscii);
    expect(idxNotes).not.toBe(-1);
    expect(h.slice(idxNotes - 6, idxNotes)).toBe('1b4501'); // bold on
  });

  it('omits NOTES line when orderNotes is null/empty/undefined', () => {
    expect(builder.build({ ...baseOpts, orderNotes: null }).toString('ascii')).not.toContain(
      'NOTES:',
    );
    expect(builder.build({ ...baseOpts, orderNotes: '' }).toString('ascii')).not.toContain(
      'NOTES:',
    );
    expect(builder.build(baseOpts).toString('ascii')).not.toContain('NOTES:');
  });

  it('truncates long order notes to paper width', () => {
    const longNotes = 'N'.repeat(100);
    const str = builder.build({ ...baseOpts, orderNotes: longNotes }).toString('ascii');
    expect(str).not.toContain(longNotes);
    const text = printable(Buffer.from(str, 'latin1'));
    expect(text).toContain('NOTES: ' + 'N'.repeat(35)); // 42 - len("NOTES: ")
  });

  // ── Order total ──────────────────────────────────────────────────────────────

  it('renders right-aligned Total when totalHalalas is set', () => {
    const buf = builder.build({ ...baseOpts, totalHalalas: 5175 });
    const str = buf.toString('ascii');
    expect(str).toContain('Total: 51.75 SAR');
    const hex = buf.toString('hex');
    const totalHex = Buffer.from('Total: 51.75 SAR', 'ascii').toString('hex');
    const idx = hex.indexOf(totalHex);
    expect(idx).not.toBe(-1);
    // ESC a 2 (right align) immediately before the Total text (after bold on)
    expect(hex.slice(idx - 12, idx)).toBe('1b45011b6102');
  });

  it('omits Total when totalHalalas is unset', () => {
    expect(builder.build(baseOpts).toString('ascii')).not.toContain('Total:');
  });

  // ── Order creator ─────────────────────────────────────────────────────────────

  it('renders "Created By:" with the creator display name when createdByName is set', () => {
    const str = builder.build({ ...baseOpts, createdByName: 'Admin' }).toString('ascii');
    expect(str).toContain('Created By: Admin');
    expect(str.indexOf('Created By: Admin')).toBeGreaterThan(str.indexOf('Time:'));
  });

  it('omits the "Created By:" line when createdByName is missing/null/empty/whitespace', () => {
    expect(builder.build(baseOpts).toString('ascii')).not.toContain('Created By:');
    expect(builder.build({ ...baseOpts, createdByName: null }).toString('ascii')).not.toContain(
      'Created By:',
    );
    expect(builder.build({ ...baseOpts, createdByName: '' }).toString('ascii')).not.toContain(
      'Created By:',
    );
    expect(builder.build({ ...baseOpts, createdByName: '   ' }).toString('ascii')).not.toContain(
      'Created By:',
    );
  });

  it('truncates a long creator name to paper width', () => {
    const longName = 'A'.repeat(100);
    const str = builder.build({ ...baseOpts, createdByName: longName }).toString('ascii');
    expect(str).not.toContain(longName);
    const text = printable(Buffer.from(str, 'latin1'));
    expect(text).toContain('Created By: ' + 'A'.repeat(30)); // 42 - 12
  });

  // ── Items ────────────────────────────────────────────────────────────────────

  it('rasterizes item name lines via GS v 0 (atlas) and prints bold notes', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    const str = buf.toString('ascii');

    // Three item lines → three GS v 0 rasters when atlas is present
    let gsCount = 0;
    let idx = 0;
    while ((idx = hex.indexOf('1d7630', idx)) !== -1) {
      gsCount++;
      idx += 6;
    }
    expect(gsCount).toBe(3);

    // Item notes: bold, indented, no "Notes:" prefix
    expect(str).toContain('    no ice');
    expect(str).not.toContain('Notes: no ice');
    expect(str).not.toContain('Qty:');

    const notesHex = Buffer.from('    no ice', 'ascii').toString('hex');
    const notesIdx = hex.indexOf(notesHex);
    expect(notesIdx).not.toBe(-1);
    expect(hex.slice(notesIdx - 6, notesIdx)).toBe('1b4501'); // bold on
  });

  it('prints unit price left and line total right under each item when set', () => {
    const opts = {
      ...baseOpts,
      items: [
        {
          qty: 2,
          name: 'Zinger Burger',
          notes: null,
          unitPriceHalalas: 2300,
          totalHalalas: 4600,
        },
      ],
    };
    const str = builder.build(opts).toString('ascii');
    expect(str).toContain('23.00');
    expect(str).toContain('46.00');
  });

  it('does not show item notes for items without notes', () => {
    const opts = { ...baseOpts, items: [{ qty: 1, name: 'Plain Item', notes: null }] };
    const str = builder.build(opts).toString('ascii');
    expect(str).not.toContain('no ice');
    // One raster for the single item
    expect(opts.items).toHaveLength(1);
    const hex = builder.build(opts).toString('hex');
    expect(hex).toContain('1d7630');
  });

  it('does not include receipt-style VAT/subtotal labels', () => {
    const str = builder.build({ ...baseOpts, totalHalalas: 5175 }).toString('ascii');
    expect(str).not.toContain('Subtotal');
    expect(str).not.toContain('VAT');
    expect(str).toContain('Total: 51.75 SAR');
  });

  it('renders partial cut at end', () => {
    expect(builder.build(baseOpts).toString('hex')).toContain('1d564203');
  });

  it('initializes printer before content', () => {
    expect(builder.build(baseOpts).toString('hex').startsWith('1b40')).toBe(true);
  });

  it('prints leading blank spacer lines before the document id', () => {
    const buf = builder.build(baseOpts);
    const hex = buf.toString('hex');
    expect(hex.startsWith('1b40')).toBe(true);

    const str = buf.toString('ascii');
    const contentStart = str.indexOf('INV26-0042');
    expect(contentStart).toBeGreaterThan(-1);
    // After ESC @ (dropped in ascii as non-printable) we get LEADING_SPACER_LINES newlines
    // before the document id. Count LFs before content.
    const before = str.slice(0, contentStart);
    const lfCount = (before.match(/\n/g) || []).length;
    expect(lfCount).toBe(5);
  });

  it('does not emit the full long item name as ASCII (raster path)', () => {
    const longName = 'A'.repeat(100);
    const opts = { ...baseOpts, items: [{ qty: 1, name: longName, notes: null }] };
    const str = builder.build(opts).toString('ascii');
    expect(str).not.toContain(longName);
    // Raster still emitted
    expect(builder.build(opts).toString('hex')).toContain('1d7630');
  });

  it('renders order notes and item notes together on the same ticket', () => {
    const str = builder.build({ ...baseOpts, orderNotes: 'Call on arrival' }).toString('ascii');
    expect(str).toContain('NOTES: Call on arrival');
    expect(str).toContain('    no ice');
  });

  it('handles empty items list', () => {
    const str = builder.build({ ...baseOpts, items: [] }).toString('ascii');
    expect(str).toContain('INV26-0042');
    expect(str).toContain('>>>> Dine-in <<<<');
  });
});
