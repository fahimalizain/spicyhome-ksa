import { ReceiptBuilder, ReceiptOptions } from './receipt-builder';
import { encodePc864, encodeUtf8 } from './arabic-encode';

describe('ReceiptBuilder', () => {
  const builder = new ReceiptBuilder(42);

  const baseOpts: ReceiptOptions = {
    documentId: 'INV26-0042',
    orderNo: 42,
    createdAt: 1700000000, // 2023-11-14T22:13:20Z = 2023-11-15T01:13:20+03
    sellerName: 'SpicyHome Restaurant',
    vatNumber: '300123456789',
    sellerStreet: 'King Fahd Rd',
    sellerBuilding: '1234',
    sellerCity: 'Riyadh',
    sellerPostal: '12211',
    sellerCountry: 'SA',
    orderType: 'dine_in',
    tableName: 'T4',
    items: [
      {
        qty: 2,
        name: 'Zinger Burger',
        nameAr: '\u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631', // زنجر برجر
        unitPriceHalalas: 2300,
        totalHalalas: 4600,
        vatRateBp: 1500,
      },
      {
        qty: 1,
        name: 'Pepsi',
        nameAr: null,
        unitPriceHalalas: 575,
        totalHalalas: 575,
        vatRateBp: 1500,
      },
    ],
    subtotalHalalas: 4500,
    vatHalalas: 675,
    totalHalalas: 5175,
    vatRateBp: 1500,
    // Keep ASCII-focused tests free of raster noise; logo covered separately.
    logo: false,
  };

  function str(buf: Buffer): string {
    return buf.toString('ascii');
  }

  function hex(buf: Buffer): string {
    return buf.toString('hex');
  }

  function findSequence(buf: Buffer, seq: number[]): boolean {
    const bufArray = Array.from(buf);
    for (let i = 0; i <= bufArray.length - seq.length; i++) {
      if (seq.every((b, j) => bufArray[i + j] === b)) {
        return true;
      }
    }
    return false;
  }

  it('renders SIMPLIFIED TAX INVOICE title', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('SIMPLIFIED TAX INVOICE');
  });

  it('renders Arabic title bytes with a configured Arabic encoding', () => {
    // فاتورة ضريبية مبسطة in PC864
    const arTitle =
      '\u0641\u0627\u062A\u0648\u0631\u0629 \u0636\u0631\u064A\u0628\u064A\u0629 \u0645\u0628\u0633\u0637\u0629';
    const buf = builder.build({
      ...baseOpts,
      arabic: { encoding: 'pc864', codePage: 22, visualRtl: false },
    });
    expect(findSequence(buf, encodePc864(arTitle))).toBe(true);
  });

  it('renders Arabic title as UTF-8 bytes with default (none) encoding', () => {
    const arTitle =
      '\u0641\u0627\u062A\u0648\u0631\u0629 \u0636\u0631\u064A\u0628\u064A\u0629 \u0645\u0628\u0633\u0637\u0629';
    const buf = builder.build(baseOpts); // default arabic = none → UTF-8 fallback
    expect(findSequence(buf, encodeUtf8(arTitle))).toBe(true);
  });

  it('renders Invoice # from documentId (not only order no)', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('Invoice #: INV26-0042');
  });

  it('renders Order ref line when orderNo provided', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('Order ref: #42');
  });

  it('does not render Order ref line when orderNo omitted', () => {
    const buf = builder.build({ ...baseOpts, orderNo: undefined });
    expect(str(buf)).not.toContain('Order ref:');
  });

  it('renders seller name and VAT number in header', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('SpicyHome Restaurant');
    expect(str(buf)).toContain('VAT: 300123456789');
  });

  it('renders seller address lines when provided', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('King Fahd Rd 1234');
    expect(str(buf)).toContain('Riyadh 12211');
    expect(str(buf)).toContain('SA');
  });

  it('skips empty seller address lines', () => {
    const buf = builder.build({
      ...baseOpts,
      sellerStreet: undefined,
      sellerBuilding: undefined,
      sellerCity: undefined,
      sellerPostal: undefined,
      sellerCountry: undefined,
    });
    const s = str(buf);
    expect(s).not.toContain('King Fahd Rd');
    expect(s).not.toContain('Riyadh 12211');
  });

  it('renders date in YYYY-MM-DD format (Asia/Riyadh)', () => {
    const buf = builder.build(baseOpts);
    const s = str(buf);
    // 1700000000 UTC = 2023-11-15T01:13:20+03
    expect(s).toContain('Date: 2023-11-15');
    expect(s).toMatch(/Date: \d{4}-\d{2}-\d{2}/);
    expect(s).toContain('Time: 01:13');
  });

  it('renders order type Dine-in with table', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('Type: Dine-in');
    expect(str(buf)).toContain('Table: T4');
  });

  it('renders order type Takeaway without table', () => {
    const opts = { ...baseOpts, orderType: 'takeaway' as const, tableName: undefined };
    const buf = builder.build(opts);
    expect(str(buf)).toContain('Type: Takeaway');
    expect(str(buf)).not.toContain('Table:');
  });

  it('renders Arabic item name as primary line with configured encoding', () => {
    const buf = builder.build({
      ...baseOpts,
      arabic: { encoding: 'pc864', codePage: 22, visualRtl: false },
    });
    // زنجر برجر in PC864 (prefixed with "2x ")
    expect(
      findSequence(buf, encodePc864('2x \u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631')),
    ).toBe(true);
  });

  it('renders Arabic item name as UTF-8 with default (none) encoding', () => {
    const buf = builder.build(baseOpts);
    expect(
      findSequence(buf, encodeUtf8('2x \u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631')),
    ).toBe(true);
  });

  it('renders English secondary line when Arabic name differs', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('Zinger Burger');
  });

  it('prints English name once when nameAr equals name', () => {
    const opts = {
      ...baseOpts,
      items: [
        {
          qty: 1,
          name: 'Pepsi',
          nameAr: 'Pepsi',
          unitPriceHalalas: 575,
          totalHalalas: 575,
          vatRateBp: 1500,
        },
      ],
      subtotalHalalas: 500,
      vatHalalas: 75,
      totalHalalas: 575,
    };
    const s = str(builder.build(opts));
    expect(s).toContain('1x Pepsi');
  });

  it('prints English-only lines when nameAr is null', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('1x Pepsi');
  });

  it('renders unit net price and line total (unit 2300 incl @15% → net 20.00)', () => {
    const buf = builder.build(baseOpts);
    const s = str(buf);
    // 2300 halalas incl. VAT @ 15% → 300 VAT, 2000 net = 20.00
    expect(s).toContain('@20.00');
    expect(s).toContain('46.00');
    expect(s).toContain('5.75');
  });

  it('renders totals block with correct money formatting', () => {
    const buf = builder.build(baseOpts);
    const s = str(buf);
    expect(s).toContain('SUBTOTAL (excl. VAT)');
    expect(s).toContain('45.00');
    expect(s).toContain('VAT (15.0%)');
    expect(s).toContain('6.75');
    expect(s).toContain('TOTAL (incl. VAT)');
    expect(s).toContain('51.75');
  });

  it('renders "VAT" without rate when vatRateBp omitted', () => {
    const opts = { ...baseOpts, vatRateBp: undefined };
    const s = str(builder.build(opts));
    expect(s).not.toContain('VAT (');
    expect(s).toContain('\nVAT');
  });

  it('renders Amount includes VAT (EN + AR)', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('Amount includes VAT');
    // المبلغ شامل ضريبة القيمة المضافة (UTF-8 fallback with default config)
    const arLine =
      '\u0627\u0644\u0645\u0628\u0644\u063A \u0634\u0627\u0645\u0644 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629';
    expect(findSequence(buf, encodeUtf8(arLine))).toBe(true);
  });

  it('renders SAR marker', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('SAR');
  });

  it('renders bold TOTAL line', () => {
    const buf = builder.build(baseOpts);
    const h = hex(buf);
    const boldOn = '1b4501';
    const boldOff = '1b4500';
    const idxBoldOn = h.indexOf(boldOn);
    const idxBoldOff = h.indexOf(boldOff);
    expect(idxBoldOn).not.toBe(-1);
    expect(idxBoldOff).not.toBe(-1);
  });

  it('renders default footer thank you message', () => {
    const buf = builder.build(baseOpts);
    expect(str(buf)).toContain('Thank you! Visit again.');
  });

  it('renders custom footer when provided', () => {
    const buf = builder.build({ ...baseOpts, footer: 'Custom footer' });
    expect(str(buf)).toContain('Custom footer');
  });

  // ── Credit note ─────────────────────────────────────────────────────────────

  describe('credit note', () => {
    const cnOpts: ReceiptOptions = {
      ...baseOpts,
      documentKind: 'credit_note',
      documentId: 'REF26-0001',
      originalDocumentId: 'INV26-0042',
      reason: 'Customer changed mind',
    };

    it('renders CREDIT NOTE titles (EN + AR) instead of invoice title', () => {
      const buf = builder.build(cnOpts);
      const s = str(buf);
      expect(s).toContain('CREDIT NOTE');
      expect(s).not.toContain('SIMPLIFIED TAX INVOICE');
      // إشعار دائن as UTF-8 fallback with default config
      expect(
        findSequence(buf, encodeUtf8('\u0625\u0634\u0639\u0627\u0631 \u062F\u0627\u0626\u0646')),
      ).toBe(true);
    });

    it('renders original invoice id and reason', () => {
      const buf = builder.build(cnOpts);
      const s = str(buf);
      expect(s).toContain('Invoice #: REF26-0001');
      expect(s).toContain('Original Invoice: INV26-0042');
      expect(s).toContain('Reason: Customer changed mind');
    });

    it('omits original invoice and reason when not provided', () => {
      const opts = { ...baseOpts, documentKind: 'credit_note' as const, documentId: 'REF26-0002' };
      const s = str(builder.build(opts));
      expect(s).not.toContain('Original Invoice:');
      expect(s).not.toContain('Reason:');
    });
  });

  // ── Logo ────────────────────────────────────────────────────────────────────

  it('emits GS v 0 raster before title when logo bitmap is injected', () => {
    // 8×8 checker: ink on even pixels of first row only
    const bits = new Uint8Array(64);
    bits[0] = 1;
    bits[2] = 1;
    const buf = builder.build({
      ...baseOpts,
      logo: { width: 8, height: 8, bits },
    });
    const h = hex(buf);
    // GS v 0 = 1d 76 30
    expect(h).toContain('1d7630');
    const rasterIdx = h.indexOf('1d7630');
    const titleIdx = h.indexOf(Buffer.from('SIMPLIFIED TAX INVOICE', 'ascii').toString('hex'));
    expect(rasterIdx).toBeGreaterThanOrEqual(0);
    expect(titleIdx).toBeGreaterThan(rasterIdx);
  });

  it('does not emit raster when logo is false', () => {
    const buf = builder.build({ ...baseOpts, logo: false });
    expect(hex(buf)).not.toContain('1d7630');
  });

  // ── Hardware ────────────────────────────────────────────────────────────────

  it('includes cash drawer kick when requested', () => {
    const buf = builder.build({ ...baseOpts, kickDrawer: true });
    expect(hex(buf)).toContain('1b70');
  });

  it('does not include cash drawer kick by default', () => {
    const buf = builder.build(baseOpts);
    expect(hex(buf).startsWith('1b40')).toBe(true);
  });

  it('renders QR code when qrTlvPayload is provided', () => {
    const buf = builder.build({ ...baseOpts, qrTlvPayload: 'TEST-TLV-DATA' });
    expect(hex(buf)).toContain('1d286b');
    expect(str(buf)).toContain('TEST-TLV-DATA');
  });

  it('does not render QR code without qrTlvPayload', () => {
    const buf = builder.build(baseOpts);
    expect(hex(buf)).not.toContain('1d286b040031413200');
  });

  it('renders partial cut at end', () => {
    const buf = builder.build(baseOpts);
    expect(hex(buf)).toContain('1d564203');
  });

  it('TOTAL line renders right-aligned money amount across widths', () => {
    const widths = [32, 42, 48];
    for (const w of widths) {
      const b = new ReceiptBuilder(w);
      const buf = b.build(baseOpts);
      const clean = str(buf)
        .split('\n')
        .map((l) => l.replace(/[\x00-\x1f\x7f-\xff]/g, ''))
        .join('\n');
      expect(clean).toContain('TOTAL (incl. VAT)');
      expect(clean).toContain('51.75');
    }
  });

  it('handles empty items list', () => {
    const opts = { ...baseOpts, items: [], subtotalHalalas: 0, vatHalalas: 0, totalHalalas: 0 };
    const buf = builder.build(opts);
    expect(str(buf)).toContain('TOTAL (incl. VAT)');
    expect(str(buf)).toContain('0.00');
  });

  it('restores code page 0 after Arabic blocks', () => {
    const buf = builder.build({
      ...baseOpts,
      arabic: { encoding: 'w1256', codePage: 50, visualRtl: false },
    });
    const h = hex(buf);
    // ESC t 50 used, and CP0 restore present after it
    expect(h).toContain('1b7432');
    expect(h).toContain('1b7400');
    const lastEscT = h.lastIndexOf('1b74');
    expect(h.slice(lastEscT).includes('1b7400')).toBe(true);
  });
});
