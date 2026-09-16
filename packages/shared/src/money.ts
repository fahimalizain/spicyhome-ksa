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
export function decomposeVat(priceInclHalalas: number, vatRateBp: number): VatDecomposition {
  if (!Number.isInteger(priceInclHalalas) || priceInclHalalas < 0) {
    throw new Error(
      `decomposeVat: priceInclHalalas must be a non-negative integer, got ${priceInclHalalas}`,
    );
  }
  if (!Number.isInteger(vatRateBp) || vatRateBp < 0) {
    throw new Error(`decomposeVat: vatRateBp must be a non-negative integer, got ${vatRateBp}`);
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
export function computeVatInclusive(priceExclHalalas: number, vatRateBp: number): number {
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
export function vatRoundTripError(priceInclHalalas: number, vatRateBp: number): number {
  const { priceExclHalalas } = decomposeVat(priceInclHalalas, vatRateBp);
  const recomposed = computeVatInclusive(priceExclHalalas, vatRateBp);
  return Math.abs(priceInclHalalas - recomposed);
}

export interface PromotionBreakdown {
  /** VAT-inclusive Discount in halalas. */
  discountHalalas: number;
  /** What the guest pays: grossIncl − discount. */
  payableHalalas: number;
  /** VAT-exclusive Allowance (ZATCA view) in halalas. */
  allowanceHalalas: number;
  /** Post-Allowance VAT in halalas (decomposed from payable). */
  vatHalalas: number;
}

/**
 * Apply a storewide percentage Promotion to a VAT-inclusive gross total.
 *
 * Amount rule (this is the one to keep — NOT round(gross × percent)):
 *   payable = round(grossIncl × (10000 − percentBp) / 10000)
 *   discount = grossIncl − payable
 *
 * Allowance / post-VAT are derived at `vatRateBp` (restaurant-normal 1500):
 *   allowance = decomposeVat(gross, vatRateBp).priceExclHalalas
 *             − decomposeVat(payable, vatRateBp).priceExclHalalas
 *   vat = decomposeVat(payable, vatRateBp).vatHalalas
 *
 * Mixed 0% + 15% bills still pass vatRateBp = 1500 (whole Allowance on the
 * 15% pot). Documented in ADR 0009. Do not invent per-line allocation here.
 *
 * @param grossInclHalalas — VAT-inclusive gross in halalas (non-negative integer)
 * @param percentBp — Promotion percent in basis points, 0–10000 (0%–100%)
 * @param vatRateBp — VAT rate in basis points (default 1500 = 15%)
 */
export function applyPromotionPercent(
  grossInclHalalas: number,
  percentBp: number,
  vatRateBp: number = 1500,
): PromotionBreakdown {
  if (!Number.isInteger(grossInclHalalas) || grossInclHalalas < 0) {
    throw new Error(
      `applyPromotionPercent: grossInclHalalas must be a non-negative integer, got ${grossInclHalalas}`,
    );
  }
  if (!Number.isInteger(percentBp) || percentBp < 0 || percentBp > BASIS_POINTS_PER_UNIT) {
    throw new Error(
      `applyPromotionPercent: percentBp must be an integer in [0, ${BASIS_POINTS_PER_UNIT}], got ${percentBp}`,
    );
  }
  if (!Number.isInteger(vatRateBp) || vatRateBp < 0) {
    throw new Error(
      `applyPromotionPercent: vatRateBp must be a non-negative integer, got ${vatRateBp}`,
    );
  }

  // payable-first: round the kept portion, then Discount is the residual.
  // Do NOT use round(gross × percent) — that yields a different 1-halala
  // trap on some amounts (e.g. 115 / 10% → 12 vs correct 11).
  const payableHalalas = Math.round(
    (grossInclHalalas * (BASIS_POINTS_PER_UNIT - percentBp)) / BASIS_POINTS_PER_UNIT,
  );
  const discountHalalas = grossInclHalalas - payableHalalas;

  const grossDecomp = decomposeVat(grossInclHalalas, vatRateBp);
  const payableDecomp = decomposeVat(payableHalalas, vatRateBp);
  const allowanceHalalas = grossDecomp.priceExclHalalas - payableDecomp.priceExclHalalas;

  return {
    discountHalalas,
    payableHalalas,
    allowanceHalalas,
    vatHalalas: payableDecomp.vatHalalas,
  };
}
