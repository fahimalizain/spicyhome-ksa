import { describe, it, expect } from 'vitest';
import {
  ZATCA_SANDBOX_DEFAULTS,
  ZATCA_SANDBOX_OTP,
  useZatcaSandboxDefaults,
} from '../hooks/useZatcaSandboxDefaults';

// Server validation regexes from apps/server/src/modules/zatca/dto/zatca-config.dto.ts
const VAT_REGEX = /^3\d{13}3$/;
const CR_REGEX = /^\d{10}$/;
const POSTAL_CODE_REGEX = /^\d{5}$/;
const COUNTRY_REGEX = /^[A-Z]{2}$/;

describe('ZATCA sandbox defaults', () => {
  // ── Constants ──

  it('has the correct sandbox VAT number', () => {
    expect(ZATCA_SANDBOX_DEFAULTS.vatNumber).toBe('399999999900003');
  });

  it('has the correct sandbox CR number', () => {
    expect(ZATCA_SANDBOX_DEFAULTS.crNumber).toBe('1234567890');
  });

  it('has the correct sandbox country', () => {
    expect(ZATCA_SANDBOX_DEFAULTS.country).toBe('SA');
  });

  it('has the correct sandbox OTP', () => {
    expect(ZATCA_SANDBOX_OTP).toBe('123456');
  });

  // ── Server validation regex compliance ──

  it('VAT number passes the server regex (15 digits, starts and ends with 3)', () => {
    expect(ZATCA_SANDBOX_DEFAULTS.vatNumber).toMatch(VAT_REGEX);
  });

  it('CR number passes the server regex (exactly 10 digits)', () => {
    expect(ZATCA_SANDBOX_DEFAULTS.crNumber).toMatch(CR_REGEX);
  });

  it('postal code passes the server regex (exactly 5 digits)', () => {
    expect(ZATCA_SANDBOX_DEFAULTS.postalCode).toMatch(POSTAL_CODE_REGEX);
  });

  it('country passes the server regex (2-letter ISO code)', () => {
    expect(ZATCA_SANDBOX_DEFAULTS.country).toMatch(COUNTRY_REGEX);
  });

  // ── All required string fields are non-empty (MinLength(1)) ──

  it('all required string fields are non-empty (server MinLength(1))', () => {
    const required = [
      'sellerName',
      'vatNumber',
      'crNumber',
      'street',
      'building',
      'city',
      'postalCode',
      'country',
      'orgUnit',
    ] as const;

    for (const field of required) {
      expect(ZATCA_SANDBOX_DEFAULTS[field], `${field} should be non-empty`).toBeTruthy();
    }
  });

  // ── Sandbox API URL ──

  it('has the correct sandbox API base URL', () => {
    expect(ZATCA_SANDBOX_DEFAULTS.apiBaseUrl).toBe(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
    );
  });

  // ── Hook ──

  it('useZatcaSandboxDefaults hook returns correct config and otp', () => {
    const { config, otp } = useZatcaSandboxDefaults();
    expect(config).toEqual(ZATCA_SANDBOX_DEFAULTS);
    expect(otp).toBe(ZATCA_SANDBOX_OTP);
  });

  it('useZatcaSandboxDefaults hook returns the same object references', () => {
    const { config, otp } = useZatcaSandboxDefaults();
    expect(config).toBe(ZATCA_SANDBOX_DEFAULTS);
    expect(otp).toBe(ZATCA_SANDBOX_OTP);
  });
});
