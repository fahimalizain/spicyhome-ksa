/**
 * Report-money formatting: integer halalas in, grouped SAR display out.
 *
 * Mirrors the integer guard of `halalasToSar` in @spicyhome/shared: non-integer
 * input throws. Grouping is done by hand (regex) so results are not
 * locale-flaky; `toLocaleString` is deliberately avoided.
 */

const HALALAS_PER_SAR = 100;

/** Insert thousands separators into the integer part of a decimal string. */
function groupThousands(decimal: string): string {
  return decimal.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface ReportSarNumber {
  /** True when the halala value is negative (the amount itself stays unsigned). */
  negative: boolean;
  /** Absolute amount as a grouped decimal string, always 2 places (e.g. "1,234.56"). */
  amount: string;
}

/**
 * Format integer halalas as `{ negative, amount }` for report tables.
 * The caller composes the display (minus + symbol + amount) and the aria-label.
 */
export function formatReportSarNumber(halalas: number): ReportSarNumber {
  if (!Number.isInteger(halalas)) {
    throw new Error(`formatReportSarNumber: expected integer, got ${halalas}`);
  }
  const negative = halalas < 0;
  const sar = Math.abs(halalas) / HALALAS_PER_SAR;
  return { negative, amount: groupThousands(sar.toFixed(2)) };
}
