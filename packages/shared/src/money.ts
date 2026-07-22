/**
 * Money and VAT helpers.
 *
 * All monetary values are stored as integer halalas (SAR × 100).
 * VAT rates are expressed in basis points (1 bp = 0.01%, 1500 bp = 15%).
 *
 * Rounding strategy: **round-half-up** (JavaScript's Math.round default).
 * For exclusively positive amounts this is equivalent to "round half up".
 * All calculations stay well within IEEE 754 safe integer range (2^53).
 */

const HALALAS_PER_SAR = 100;
const BASIS_POINTS_PER_UNIT = 10000;

export interface VatDecomposition {
  /** VAT amount in halalas (integer). */
  vatHalalas: number;
  /** Price excluding VAT in halalas (integer). */
  priceExclHalalas: number;
}

/**
 * Convert a SAR float to integer halalas.
 * SAR values must have at most 2 decimal places.
 */
export function sarToHalalas(sar: number): number {
  if (!Number.isFinite(sar)) {
    throw new Error(`sarToHalalas: expected finite number, got ${sar}`);
  }
  return Math.round(sar * HALALAS_PER_SAR);
}

/**
 * Format integer halalas as a SAR display string (e.g. "12.50").
 */
export function halalasToSar(halalas: number): string {
  if (!Number.isInteger(halalas)) {
    throw new Error(`halalasToSar: expected integer, got ${halalas}`);
  }
  const sar = halalas / HALALAS_PER_SAR;
  return sar.toFixed(2);
}

/**
 * Decompose a VAT-inclusive price into the VAT amount and the price excluding VAT.
 *
 * Formula (integer-safe, round-half-up):
 *   vat = round(priceIncl × vatRateBp / (10000 + vatRateBp))
 *   priceExcl = priceIncl − vat
 *
 * @param priceInclHalalas — VAT-inclusive price in halalas (must be a non-negative integer)
 * @param vatRateBp — VAT rate in basis points (must be a non-negative integer)
 */
export function decomposeVat(
  priceInclHalalas: number,
  vatRateBp: number,
): VatDecomposition {
  if (!Number.isInteger(priceInclHalalas) || priceInclHalalas < 0) {
    throw new Error(
      `decomposeVat: priceInclHalalas must be a non-negative integer, got ${priceInclHalalas}`,
    );
  }
  if (!Number.isInteger(vatRateBp) || vatRateBp < 0) {
    throw new Error(
      `decomposeVat: vatRateBp must be a non-negative integer, got ${vatRateBp}`,
    );
  }

  if (vatRateBp === 0) {
    return { vatHalalas: 0, priceExclHalalas: priceInclHalalas };
  }

  const denominator = BASIS_POINTS_PER_UNIT + vatRateBp;

  // Math.round uses round-half-up for positive numbers.
  // Values are well within IEEE 754 exact integer range.
  const vatHalalas = Math.round((priceInclHalalas * vatRateBp) / denominator);
  const priceExclHalalas = priceInclHalalas - vatHalalas;

  return { vatHalalas, priceExclHalalas };
}

/**
 * Compute a VAT-inclusive price from a base (excl. VAT) price.
 *
 * Formula: round(priceExcl × (10000 + vatRateBp) / 10000)
 */
export function computeVatInclusive(
  priceExclHalalas: number,
  vatRateBp: number,
): number {
  if (!Number.isInteger(priceExclHalalas) || priceExclHalalas < 0) {
    throw new Error(
      `computeVatInclusive: priceExclHalalas must be a non-negative integer, got ${priceExclHalalas}`,
    );
  }
  if (!Number.isInteger(vatRateBp) || vatRateBp < 0) {
    throw new Error(
      `computeVatInclusive: vatRateBp must be a non-negative integer, got ${vatRateBp}`,
    );
  }

  if (vatRateBp === 0) {
    return priceExclHalalas;
  }

  const numerator = priceExclHalalas * (BASIS_POINTS_PER_UNIT + vatRateBp);
  return Math.round(numerator / BASIS_POINTS_PER_UNIT);
}

/**
 * Round-trip check: decompose then recompose and measure drift.
 *
 * Returns the absolute difference in halalas between the original
 * VAT-inclusive price and the recomposed price. Usually 0 or 1 halala.
 */
export function vatRoundTripError(
  priceInclHalalas: number,
  vatRateBp: number,
): number {
  const { priceExclHalalas } = decomposeVat(priceInclHalalas, vatRateBp);
  const recomposed = computeVatInclusive(priceExclHalalas, vatRateBp);
  return Math.abs(priceInclHalalas - recomposed);
}
