import type { ZatcaConfigDto } from '@spicyhome/client-ts';

/**
 * Predefined ZATCA Fatoora developer-portal sandbox placeholders.
 * See docs/zatca/sandbox.md
 */
export const ZATCA_SANDBOX_DEFAULTS: ZatcaConfigDto = {
  sellerName: 'Test POS Sandbox',
  vatNumber: '399999999900003',
  crNumber: '1234567890',
  street: 'Test Street',
  building: '1234',
  city: 'Riyadh',
  postalCode: '12345',
  country: 'SA',
  orgUnit: 'Riyadh Branch',
  apiBaseUrl: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
};

export const ZATCA_SANDBOX_OTP = '123456';

export function useZatcaSandboxDefaults() {
  return {
    config: ZATCA_SANDBOX_DEFAULTS,
    otp: ZATCA_SANDBOX_OTP,
  };
}
