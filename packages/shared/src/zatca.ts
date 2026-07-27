export const ZATCA_INVOICE_TYPE_CODES = {
  invoice: 388,
  credit_note: 381,
  debit_note: 383,
} as const;

export type ZATCAInvoiceDocumentType = 'invoice' | 'credit_note' | 'debit_note';

export type ZATCAEnvironment = 'sandbox' | 'simulation' | 'production';

export const ZATCA_SIMPLIFIED_SUBTYPES: Record<ZATCAInvoiceDocumentType, string> = {
  invoice: '0200000',
  credit_note: '0200000',
  debit_note: '0211000',
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
