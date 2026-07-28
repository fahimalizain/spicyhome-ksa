export const ZATCA_INVOICE_TYPE_CODES = {
  invoice: 388,
  credit_note: 381,
  debit_note: 383,
} as const;

export type ZATCAInvoiceDocumentType = 'invoice' | 'credit_note' | 'debit_note';

/**
 * Compliance check document type keys — widened to include standard variants.
 * These are used as identifiers for compliance checks only.
 */
export type ZATCAComplianceDocumentType =
  ZATCAInvoiceDocumentType | 'standard_invoice' | 'standard_credit_note' | 'standard_debit_note';

export const ZATCA_STANDARD_COMPLIANCE_TYPES = [
  'standard_invoice',
  'standard_credit_note',
  'standard_debit_note',
] as const;

/** All valid compliance check document type keys. */
export const ZATCA_ALL_COMPLIANCE_DOC_TYPES: readonly ZATCAComplianceDocumentType[] = [
  'invoice',
  'credit_note',
  'debit_note',
  'standard_invoice',
  'standard_credit_note',
  'standard_debit_note',
] as const;

export function isStandardComplianceType(
  type: string,
): type is 'standard_invoice' | 'standard_credit_note' | 'standard_debit_note' {
  return (ZATCA_STANDARD_COMPLIANCE_TYPES as readonly string[]).includes(type);
}

export function standardComplianceToBaseType(
  type: 'standard_invoice' | 'standard_credit_note' | 'standard_debit_note',
): ZATCAInvoiceDocumentType {
  switch (type) {
    case 'standard_invoice':
      return 'invoice';
    case 'standard_credit_note':
      return 'credit_note';
    case 'standard_debit_note':
      return 'debit_note';
  }
}

export type ZATCAEnvironment = 'sandbox' | 'simulation' | 'production';

export const ZATCA_SIMPLIFIED_SUBTYPES: Record<ZATCAInvoiceDocumentType, string> = {
  invoice: '0200000',
  credit_note: '0200000',
  debit_note: '0211000',
};

export const ZATCA_STANDARD_SUBTYPES: Record<ZATCAInvoiceDocumentType, string> = {
  invoice: '0100000',
  credit_note: '0100000',
  debit_note: '0100000',
};

/**
 * ZATCA SDK initial Previous Invoice Hash for the first invoice in a chain.
 *
 * Computed as `base64(hex(SHA-256("0")))`. This is the canonical value used by
 * the ZATCA SDK for both compliance and production environments.
 *
 * See: tools/zatca-sdk/Data/PIH/pih.txt
 */
export const ZATCA_INITIAL_PIH =
  'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

/**
 * Slugify an org unit name for use in settings keys.
 *
 * Trims whitespace, lowercases, replaces runs of non-[a-z0-9] characters with
 * a single hyphen, and strips leading/trailing hyphens. Non-English characters
 * that lowercasing cannot map to [a-z0-9] become separators; an org unit
 * consisting entirely of such characters (e.g. Arabic-only) will slugify to an
 * empty string, which the caller must reject.
 */
export function slugifyOrgUnit(orgUnit: string): string {
  const trimmed = orgUnit.trim();
  const lower = trimmed.toLowerCase();
  // Replace any run of non-alphanumeric characters with a single hyphen
  const slug = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug;
}

/**
 * Build a per-environment, per-organizational-unit ZATCA settings key.
 *
 * Example: org unit "SpicyHome POS" + env "simulation" + suffix "last_icv"
 *   → `zatca_simulation_spicyhome-pos_last_icv`
 *
 * @throws {Error} if the org unit slugifies to an empty string.
 */
export function zatcaKey(env: ZATCAEnvironment, orgUnit: string, suffix: string): string {
  const slug = slugifyOrgUnit(orgUnit);
  if (!slug) {
    throw new Error('ZATCA org unit is required to build settings keys');
  }
  return `zatca_${env}_${slug}_${suffix}`;
}
