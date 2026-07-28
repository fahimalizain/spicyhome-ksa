import {
  zatcaBuyerDetailsSchema,
  parseZatcaBuyerDetails,
  requireZatcaBuyerDetails,
  formatZatcaBuyerDetailsErrors,
} from './zatca-buyer';

const validBuyer = {
  name: 'Abdullah Al-Otaibi Est.',
  vatNumber: '300123456789012',
  street: 'King Fahd Road',
  buildingNumber: '7845',
  citySubdivision: 'Al-Olaya',
  city: 'Riyadh',
  postalCode: '12271',
  country: 'SA',
};

describe('zatcaBuyerDetailsSchema', () => {
  it('validates a complete valid object', () => {
    const result = zatcaBuyerDetailsSchema.safeParse(validBuyer);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Abdullah Al-Otaibi Est.');
      expect(result.data.vatNumber).toBe('300123456789012');
      expect(result.data.street).toBe('King Fahd Road');
      expect(result.data.buildingNumber).toBe('7845');
      expect(result.data.citySubdivision).toBe('Al-Olaya');
      expect(result.data.city).toBe('Riyadh');
      expect(result.data.postalCode).toBe('12271');
      expect(result.data.country).toBe('SA');
    }
  });

  it('country defaults to SA when omitted', () => {
    const { country: _country, ...rest } = validBuyer;
    const result = zatcaBuyerDetailsSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('SA');
    }
  });

  it('uppercases lowercase country code', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      country: 'sa',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('SA');
    }
  });

  it('rejects empty name', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only name', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      name: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid VAT — too short', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      vatNumber: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid VAT — non-digits', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      vatNumber: '30012345678901A',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid VAT — 16 digits', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      vatNumber: '3001234567890123',
    });
    expect(result.success).toBe(false);
  });

  it('accepts leading zeros in VAT', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      vatNumber: '000123456789012',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty street', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      street: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty buildingNumber', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      buildingNumber: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty citySubdivision', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      citySubdivision: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty city', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      city: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty postalCode', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      postalCode: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid country — too long', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      country: 'SAU',
    });
    expect(result.success).toBe(false);
  });

  it('rejects country with digits', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      country: 'S1',
    });
    expect(result.success).toBe(false);
  });
});

describe('parseZatcaBuyerDetails', () => {
  it('parses a plain object successfully', () => {
    const result = parseZatcaBuyerDetails(validBuyer);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Abdullah Al-Otaibi Est.');
    }
  });

  it('parses a JSON string successfully', () => {
    const result = parseZatcaBuyerDetails(JSON.stringify(validBuyer));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Abdullah Al-Otaibi Est.');
    }
  });

  it('returns error for invalid JSON string', () => {
    const result = parseZatcaBuyerDetails('not json');
    expect(result.success).toBe(false);
  });

  it('returns error for null', () => {
    const result = parseZatcaBuyerDetails(null);
    expect(result.success).toBe(false);
  });

  it('returns error for undefined', () => {
    const result = parseZatcaBuyerDetails(undefined);
    expect(result.success).toBe(false);
  });

  it('round-trips: parse → serialize → parse matches', () => {
    const round1 = parseZatcaBuyerDetails(validBuyer);
    expect(round1.success).toBe(true);
    if (round1.success) {
      const json = JSON.stringify(round1.data);
      const round2 = parseZatcaBuyerDetails(json);
      expect(round2.success).toBe(true);
      if (round2.success) {
        expect(round2.data).toEqual(round1.data);
      }
    }
  });
});

describe('requireZatcaBuyerDetails', () => {
  it('returns data for valid input', () => {
    const data = requireZatcaBuyerDetails(validBuyer);
    expect(data.name).toBe('Abdullah Al-Otaibi Est.');
  });

  it('throws ZodError for invalid input', () => {
    expect(() => requireZatcaBuyerDetails({ ...validBuyer, name: '' })).toThrow();
  });
});

describe('formatZatcaBuyerDetailsErrors', () => {
  it('returns an empty object for valid input', () => {
    const result = zatcaBuyerDetailsSchema.safeParse(validBuyer);
    if (!result.success) {
      const formatted = formatZatcaBuyerDetailsErrors(result.error);
      expect(Object.keys(formatted).length).toBe(0);
    }
  });

  it('returns field→message map for invalid input', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      name: '',
      vatNumber: 'abc',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZatcaBuyerDetailsErrors(result.error);
      expect(formatted.name).toBeDefined();
      expect(formatted.vatNumber).toBeDefined();
    }
  });

  it('returns only first error per field', () => {
    const result = zatcaBuyerDetailsSchema.safeParse({
      ...validBuyer,
      name: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZatcaBuyerDetailsErrors(result.error);
      expect(typeof formatted.name).toBe('string');
      // Only one entry per field
      expect(Object.keys(formatted).filter((k) => k === 'name')).toHaveLength(1);
    }
  });
});
