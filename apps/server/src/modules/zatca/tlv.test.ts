import { encodeZatcaTLV, TLVInput } from './tlv';

describe('ZATCA TLV Encoder', () => {
  const baseInput: TLVInput = {
    sellerName: 'SpicyHome Restaurant',
    vatNumber: '300123456789',
    timestamp: '2024-01-15T14:30:00+03:00',
    totalHalalas: 2300,
    vatHalalas: 300,
    invoiceHashBase64: 'dGVzdGhhc2g=', // "testhash"
    signatureBase64: 'dGVzdHNpZw==', // "testsig"
    publicKeyBase64: 'dGVzdHB1YmtleQ==', // "testpubkey"
  };

  it('produces a non-empty base64 string', () => {
    const result = encodeZatcaTLV(baseInput);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
    // Should be valid base64 (no padding issues for QR)
    expect(() => Buffer.from(result, 'base64')).not.toThrow();
  });

  it('produces consistent output for same input', () => {
    const a = encodeZatcaTLV(baseInput);
    const b = encodeZatcaTLV(baseInput);
    expect(a).toBe(b);
  });

  it('encodes monetary values as SAR decimal strings (halalas / 100)', () => {
    const input: TLVInput = {
      ...baseInput,
      totalHalalas: 12345,
      vatHalalas: 1600,
    };
    const tlvBase64 = encodeZatcaTLV(input);
    const tlv = Buffer.from(tlvBase64, 'base64');

    // Parse all TLV entries
    const entries = parseTLV(tlv);
    const byTag = new Map<number, string>();
    for (const e of entries) {
      byTag.set(e.tag, e.value);
    }

    expect(byTag.get(4)).toBe('123.45'); // total
    expect(byTag.get(5)).toBe('16.00'); // vat
  });

  it('encodes all 8 tags in order 1-8', () => {
    const tlvBase64 = encodeZatcaTLV(baseInput);
    const tlv = Buffer.from(tlvBase64, 'base64');

    const entries = parseTLV(tlv);
    expect(entries.length).toBe(8);

    const tags = entries.map((e) => e.tag);
    expect(tags).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('each TLV entry has correct tag-length-value structure', () => {
    const tlvBase64 = encodeZatcaTLV(baseInput);
    const tlv = Buffer.from(tlvBase64, 'base64');

    const entries = parseTLV(tlv);

    for (const entry of entries) {
      expect(entry.tag).toBeGreaterThanOrEqual(1);
      expect(entry.tag).toBeLessThanOrEqual(8);
      expect(entry.length).toBe(entry.valueBytes.length);
    }
  });

  it('seller name is in tag 1', () => {
    const tlvBase64 = encodeZatcaTLV({
      ...baseInput,
      sellerName: 'UniqueTestName_123',
    });
    const tlv = Buffer.from(tlvBase64, 'base64');
    const entries = parseTLV(tlv);
    const tag1 = entries.find((e) => e.tag === 1);
    expect(tag1).toBeDefined();
    expect(tag1!.value).toBe('UniqueTestName_123');
  });

  it('VAT number is in tag 2', () => {
    const tlvBase64 = encodeZatcaTLV({
      ...baseInput,
      vatNumber: '399999999999',
    });
    const tlv = Buffer.from(tlvBase64, 'base64');
    const entries = parseTLV(tlv);
    const tag2 = entries.find((e) => e.tag === 2);
    expect(tag2).toBeDefined();
    expect(tag2!.value).toBe('399999999999');
  });

  it('timestamp is in tag 3 with ISO 8601 format', () => {
    const input: TLVInput = {
      ...baseInput,
      timestamp: '2026-07-22T18:45:00+03:00',
    };
    const tlvBase64 = encodeZatcaTLV(input);
    const tlv = Buffer.from(tlvBase64, 'base64');
    const entries = parseTLV(tlv);
    const tag3 = entries.find((e) => e.tag === 3);
    expect(tag3).toBeDefined();
    expect(tag3!.value).toBe('2026-07-22T18:45:00+03:00');
  });

  it('handles amounts with edge-case rounding', () => {
    const input: TLVInput = {
      ...baseInput,
      totalHalalas: 1, // 0.01 SAR
      vatHalalas: 0, // 0.00 SAR
    };
    const tlvBase64 = encodeZatcaTLV(input);
    const tlv = Buffer.from(tlvBase64, 'base64');
    const entries = parseTLV(tlv);
    const byTag = new Map<number, string>();
    for (const e of entries) byTag.set(e.tag, e.value);
    expect(byTag.get(4)).toBe('0.01');
    expect(byTag.get(5)).toBe('0.00');
  });

  it('handles large amounts', () => {
    const input: TLVInput = {
      ...baseInput,
      totalHalalas: 9999999, // 99999.99 SAR
      vatHalalas: 1304347, // ~13043.47 SAR
    };
    const tlvBase64 = encodeZatcaTLV(input);
    const tlv = Buffer.from(tlvBase64, 'base64');
    const entries = parseTLV(tlv);
    const byTag = new Map<number, string>();
    for (const e of entries) byTag.set(e.tag, e.value);
    expect(byTag.get(4)).toBe('99999.99');
    expect(byTag.get(5)).toBe('13043.47');
  });
});

// ── Helper: parse TLV bytes into entries ──

interface TLVParsed {
  tag: number;
  length: number;
  value: string;
  valueBytes: Buffer;
}

function parseTLV(buffer: Buffer): TLVParsed[] {
  const entries: TLVParsed[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 3 > buffer.length) break;

    const tag = buffer[offset];
    const length = (buffer[offset + 1] << 8) | buffer[offset + 2];
    offset += 3;

    if (offset + length > buffer.length) break;

    const valueBytes = buffer.slice(offset, offset + length);
    const value = valueBytes.toString('utf8');
    offset += length;

    entries.push({ tag, length, value, valueBytes });
  }

  return entries;
}
