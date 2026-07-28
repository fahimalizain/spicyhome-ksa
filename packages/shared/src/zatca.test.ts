import { createHash } from 'crypto';

import {
  slugifyOrgUnit,
  zatcaKey,
  ZATCA_INITIAL_PIH,
  ZATCA_INVOICE_TYPE_CODES,
  ZATCA_SIMPLIFIED_SUBTYPES,
  ZATCA_STANDARD_SUBTYPES,
} from './zatca';

describe('ZATCA_INVOICE_TYPE_CODES', () => {
  it('has expected values', () => {
    expect(ZATCA_INVOICE_TYPE_CODES.invoice).toBe(388);
    expect(ZATCA_INVOICE_TYPE_CODES.credit_note).toBe(381);
    expect(ZATCA_INVOICE_TYPE_CODES.debit_note).toBe(383);
  });
});

describe('ZATCA_SIMPLIFIED_SUBTYPES', () => {
  it('returns correct subtypes', () => {
    expect(ZATCA_SIMPLIFIED_SUBTYPES.invoice).toBe('0200000');
    expect(ZATCA_SIMPLIFIED_SUBTYPES.credit_note).toBe('0200000');
    expect(ZATCA_SIMPLIFIED_SUBTYPES.debit_note).toBe('0211000');
  });
});

describe('ZATCA_STANDARD_SUBTYPES', () => {
  it('returns correct subtypes', () => {
    expect(ZATCA_STANDARD_SUBTYPES.invoice).toBe('0100000');
    expect(ZATCA_STANDARD_SUBTYPES.credit_note).toBe('0100000');
    expect(ZATCA_STANDARD_SUBTYPES.debit_note).toBe('0100000');
  });
});

describe('ZATCA_INITIAL_PIH', () => {
  const EXPECTED_PIH =
    'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

  it('equals the canonical ZATCA SDK initial PIH', () => {
    expect(ZATCA_INITIAL_PIH).toBe(EXPECTED_PIH);
  });

  it('equals computed base64(hex(SHA-256("0")))', () => {
    const expected = Buffer.from(createHash('sha256').update('0').digest('hex'), 'utf8').toString(
      'base64',
    );
    expect(ZATCA_INITIAL_PIH).toBe(expected);
  });

  it('is a non-empty string', () => {
    expect(typeof ZATCA_INITIAL_PIH).toBe('string');
    expect(ZATCA_INITIAL_PIH.length).toBeGreaterThan(0);
  });
});

describe('slugifyOrgUnit', () => {
  it('trims whitespace', () => {
    expect(slugifyOrgUnit('  SpicyHome  ')).toBe('spicyhome');
  });

  it('lowercases', () => {
    expect(slugifyOrgUnit('SpicyHome POS')).toBe('spicyhome-pos');
  });

  it('replaces runs of non-alphanumeric with single hyphen', () => {
    expect(slugifyOrgUnit('SpicyHome  POS')).toBe('spicyhome-pos');
    expect(slugifyOrgUnit('SpicyHome___POS')).toBe('spicyhome-pos');
    expect(slugifyOrgUnit('SpicyHome - POS')).toBe('spicyhome-pos');
    expect(slugifyOrgUnit('Branch #1')).toBe('branch-1');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugifyOrgUnit(' -SpicyHome- ')).toBe('spicyhome');
    expect(slugifyOrgUnit('!!!SpicyHome!!!')).toBe('spicyhome');
  });

  it('handles punctuation', () => {
    expect(slugifyOrgUnit('Riyadh Branch (Main)')).toBe('riyadh-branch-main');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(slugifyOrgUnit('   ')).toBe('');
    expect(slugifyOrgUnit('')).toBe('');
  });

  it('returns empty string for Arabic-only input (non-ASCII collapses)', () => {
    // Arabic characters don't match [a-z0-9], so they become hyphens
    // which are then stripped from start/end → empty string
    const result = slugifyOrgUnit('رياض');
    expect(result).toBe('');
  });

  it('returns empty string for emoji-only input', () => {
    const result = slugifyOrgUnit('🔥');
    expect(result).toBe('');
  });

  it('returns empty string for symbol-only input', () => {
    const result = slugifyOrgUnit('!!!');
    expect(result).toBe('');
  });

  it('preserves digits and mixed alphanumeric', () => {
    expect(slugifyOrgUnit('Branch 2 Floor 3')).toBe('branch-2-floor-3');
    expect(slugifyOrgUnit('Unit42')).toBe('unit42');
  });
});

describe('zatcaKey', () => {
  it('builds key with org unit slugified', () => {
    expect(zatcaKey('simulation', 'SpicyHome POS', 'last_icv')).toBe(
      'zatca_simulation_spicyhome-pos_last_icv',
    );
  });

  it('builds key for sandbox environment', () => {
    expect(zatcaKey('sandbox', 'Riyadh Branch', 'compliance_cert')).toBe(
      'zatca_sandbox_riyadh-branch_compliance_cert',
    );
  });

  it('builds key for production environment', () => {
    expect(zatcaKey('production', 'Main Branch', 'private_key_encrypted')).toBe(
      'zatca_production_main-branch_private_key_encrypted',
    );
  });

  it('different OUs produce different keys', () => {
    const keyA = zatcaKey('simulation', 'Branch A', 'last_icv');
    const keyB = zatcaKey('simulation', 'Branch B', 'last_icv');
    expect(keyA).not.toBe(keyB);
  });

  it('same OU with different casing/spacing produces same key after slugify', () => {
    const key1 = zatcaKey('simulation', 'SpicyHome POS', 'private_key_encrypted');
    const key2 = zatcaKey('simulation', '  spicyhome pos  ', 'private_key_encrypted');
    expect(key1).toBe(key2);
  });

  it('throws when org unit is empty string', () => {
    expect(() => zatcaKey('simulation', '', 'last_icv')).toThrow(
      'ZATCA org unit is required to build settings keys',
    );
  });

  it('throws when org unit is whitespace-only', () => {
    expect(() => zatcaKey('simulation', '   ', 'last_icv')).toThrow(
      'ZATCA org unit is required to build settings keys',
    );
  });

  it('throws when org unit slugifies to empty (Arabic-only)', () => {
    expect(() => zatcaKey('simulation', 'رياض', 'last_icv')).toThrow(
      'ZATCA org unit is required to build settings keys',
    );
  });

  it('throws when org unit slugifies to empty (symbols-only)', () => {
    expect(() => zatcaKey('simulation', '!!!', 'last_icv')).toThrow(
      'ZATCA org unit is required to build settings keys',
    );
  });
});
