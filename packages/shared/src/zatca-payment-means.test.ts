import {
  buildCreditNotePaymentMeans,
  buildInvoicePaymentMeans,
  clampInstructionNote,
  DEFAULT_ZATCA_PAYMENT_MEANS_CODE,
  isZatcaPaymentMeansCode,
  MAX_INSTRUCTION_NOTE_LENGTH,
  netPaymentMeansLines,
  ZATCA_PAYMENT_MEANS_CODE_LABELS,
  ZATCA_PAYMENT_MEANS_CODES,
} from './zatca-payment-means';

describe('ZATCA payment means codes', () => {
  it('allow-list is exactly the ZATCA schematron set', () => {
    expect([...ZATCA_PAYMENT_MEANS_CODES].sort()).toEqual(['1', '10', '30', '42', '48']);
  });

  it('does not include 54 or 55 (rejected by ZATCA)', () => {
    expect(ZATCA_PAYMENT_MEANS_CODES).not.toContain('54');
    expect(ZATCA_PAYMENT_MEANS_CODES).not.toContain('55');
  });

  it('default code is 10', () => {
    expect(DEFAULT_ZATCA_PAYMENT_MEANS_CODE).toBe('10');
  });

  it('labels cover every allowed code', () => {
    for (const code of ZATCA_PAYMENT_MEANS_CODES) {
      expect(typeof ZATCA_PAYMENT_MEANS_CODE_LABELS[code]).toBe('string');
    }
  });

  describe('isZatcaPaymentMeansCode', () => {
    it('accepts all allowed codes', () => {
      for (const code of ZATCA_PAYMENT_MEANS_CODES) {
        expect(isZatcaPaymentMeansCode(code)).toBe(true);
      }
    });

    it('rejects invalid codes', () => {
      for (const code of ['54', '55', '99', '10 ', '', 'cash', '0']) {
        expect(isZatcaPaymentMeansCode(code)).toBe(false);
      }
    });
  });
});

describe('clampInstructionNote', () => {
  it('keeps notes within the limit untouched', () => {
    const note = 'x'.repeat(1000);
    expect(clampInstructionNote(note)).toBe(note);
  });

  it('truncates notes over 1000 chars with a trailing ellipsis', () => {
    const note = 'a'.repeat(1500);
    const clamped = clampInstructionNote(note);
    expect(clamped).toHaveLength(MAX_INSTRUCTION_NOTE_LENGTH);
    expect(clamped.endsWith('...')).toBe(true);
    // Reason prefix (leading content) is preserved
    expect(clamped.startsWith('aaa')).toBe(true);
  });
});

describe('buildInvoicePaymentMeans', () => {
  it('returns an empty array for no payment lines (builder falls back to 10)', () => {
    expect(buildInvoicePaymentMeans([])).toEqual([]);
  });

  it('builds one block for a single cash payment with note format {title} | {amount} SAR', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 11500, zatcaPaymentMeansCode: '10' },
    ]);
    expect(result).toEqual([{ code: '10', instructionNote: 'Cash | 115.00 SAR' }]);
  });

  it('builds one block for a single card payment', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'card', methodTitle: 'Card', amountHalalas: 11500, zatcaPaymentMeansCode: '48' },
    ]);
    expect(result).toEqual([{ code: '48', instructionNote: 'Card | 115.00 SAR' }]);
  });

  it('builds one block per line for split tender, sorted by methodId ASC', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 4500, zatcaPaymentMeansCode: '10' },
      { methodId: 'card', methodTitle: 'Card', amountHalalas: 7000, zatcaPaymentMeansCode: '48' },
    ]);
    expect(result).toEqual([
      { code: '48', instructionNote: 'Card | 70.00 SAR' },
      { code: '10', instructionNote: 'Cash | 45.00 SAR' },
    ]);
  });

  it('sort is stable regardless of input order', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'card', methodTitle: 'Card', amountHalalas: 7000, zatcaPaymentMeansCode: '48' },
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 4500, zatcaPaymentMeansCode: '10' },
    ]);
    expect(result.map((m) => m.code)).toEqual(['48', '10']);
  });

  it('keeps both lines with equal amounts (no winner selection)', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 5750, zatcaPaymentMeansCode: '10' },
      { methodId: 'card', methodTitle: 'Card', amountHalalas: 5750, zatcaPaymentMeansCode: '48' },
    ]);
    expect(result.map((m) => m.code)).toEqual(['48', '10']);
    expect(result).toHaveLength(2);
  });

  it('coerces an invalid code per line to 10 but still emits the line', () => {
    const result = buildInvoicePaymentMeans([
      {
        methodId: 'custom',
        methodTitle: 'Custom',
        amountHalalas: 9000,
        zatcaPaymentMeansCode: '99',
      },
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 1000, zatcaPaymentMeansCode: '10' },
    ]);
    // 'cash' < 'custom' → cash block first, custom line still emitted (coerced to 10)
    expect(result).toEqual([
      { code: '10', instructionNote: 'Cash | 10.00 SAR' },
      { code: '10', instructionNote: 'Custom | 90.00 SAR' },
    ]);
  });

  it('falls back to methodId when the method title is blank', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'cash', methodTitle: '   ', amountHalalas: 5000, zatcaPaymentMeansCode: '10' },
    ]);
    expect(result[0].instructionNote).toBe('cash | 50.00 SAR');
  });
});

describe('netPaymentMeansLines / multi-line netting (ADR 0006)', () => {
  it('nets two cash lines +100 / −20 into one means with 80', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 100, zatcaPaymentMeansCode: '10' },
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: -20, zatcaPaymentMeansCode: '10' },
    ]);
    expect(result).toEqual([{ code: '10', instructionNote: 'Cash | 0.80 SAR' }]);
  });

  it('keeps one block per method for cash + card', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 100, zatcaPaymentMeansCode: '10' },
      { methodId: 'card', methodTitle: 'Card', amountHalalas: 50, zatcaPaymentMeansCode: '48' },
    ]);
    expect(result).toEqual([
      { code: '48', instructionNote: 'Card | 0.50 SAR' },
      { code: '10', instructionNote: 'Cash | 1.00 SAR' },
    ]);
  });

  it('drops a method whose lines net to exactly zero (+100 / −100)', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 100, zatcaPaymentMeansCode: '10' },
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: -100, zatcaPaymentMeansCode: '10' },
    ]);
    // All lines netted away — the XML builder falls back to a single 10 block
    expect(result).toEqual([]);
  });

  it('drops negative nets (should never reach the invoice; submit rejects them)', () => {
    const result = buildInvoicePaymentMeans([
      { methodId: 'card', methodTitle: 'Card', amountHalalas: -50, zatcaPaymentMeansCode: '48' },
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 100, zatcaPaymentMeansCode: '10' },
    ]);
    expect(result).toEqual([{ code: '10', instructionNote: 'Cash | 1.00 SAR' }]);
  });

  it('keeps the snapshot fields of the latest line per method', () => {
    const result = buildInvoicePaymentMeans([
      {
        methodId: 'cash',
        methodTitle: 'Cash (old title)',
        amountHalalas: 100,
        zatcaPaymentMeansCode: '10',
      },
      {
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: -20,
        zatcaPaymentMeansCode: '10',
      },
    ]);
    expect(result[0].instructionNote).toBe('Cash | 0.80 SAR');
  });

  it('netPaymentMeansLines is a pure helper sorted by methodId ASC', () => {
    const result = netPaymentMeansLines([
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: -20, zatcaPaymentMeansCode: '10' },
      { methodId: 'card', methodTitle: 'Card', amountHalalas: 50, zatcaPaymentMeansCode: '48' },
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 100, zatcaPaymentMeansCode: '10' },
    ]);
    expect(result).toEqual([
      { methodId: 'card', methodTitle: 'Card', amountHalalas: 50, zatcaPaymentMeansCode: '48' },
      { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 80, zatcaPaymentMeansCode: '10' },
    ]);
  });
});

describe('buildCreditNotePaymentMeans', () => {
  it('builds a single block with reason + method', () => {
    const result = buildCreditNotePaymentMeans({
      methodId: 'card',
      methodTitle: 'Card',
      zatcaPaymentMeansCode: '48',
      reason: 'Item was cold',
    });
    expect(result).toEqual([{ code: '48', instructionNote: 'Item was cold | Card' }]);
  });

  it('appends the refund amount when known: reason | method | amount SAR', () => {
    const result = buildCreditNotePaymentMeans({
      methodId: 'card',
      methodTitle: 'Card',
      zatcaPaymentMeansCode: '48',
      reason: 'Item was cold',
      amountHalalas: 11500,
    });
    expect(result).toEqual([{ code: '48', instructionNote: 'Item was cold | Card | 115.00 SAR' }]);
  });

  it('defaults an empty reason to Refund (BR-KSA-F-06-C13 min length)', () => {
    const result = buildCreditNotePaymentMeans({
      methodId: 'cash',
      methodTitle: 'Cash',
      zatcaPaymentMeansCode: '10',
      reason: '   ',
      amountHalalas: 5750,
    });
    expect(result[0].instructionNote).toBe('Refund | Cash | 57.50 SAR');
  });

  it('coerces an invalid refund code to 10', () => {
    const result = buildCreditNotePaymentMeans({
      methodId: 'card',
      methodTitle: 'Card',
      zatcaPaymentMeansCode: '55',
      reason: 'Refund',
    });
    expect(result[0].code).toBe('10');
  });

  it('clamps a long reason but keeps the reason prefix', () => {
    const longReason = 'r'.repeat(1500);
    const result = buildCreditNotePaymentMeans({
      methodId: 'card',
      methodTitle: 'Card',
      zatcaPaymentMeansCode: '48',
      reason: longReason,
    });
    expect(result[0].instructionNote).toHaveLength(MAX_INSTRUCTION_NOTE_LENGTH);
    expect(result[0].instructionNote.startsWith('rrr')).toBe(true);
  });
});
