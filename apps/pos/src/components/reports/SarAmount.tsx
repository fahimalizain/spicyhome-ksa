import { formatReportSarNumber } from '../../lib/format-report-sar';
import { SaudiRiyalSymbol } from './SaudiRiyalSymbol';

interface SarAmountProps {
  halalas: number;
}

/**
 * SAR-style amount for report tables: Unicode minus (U+2212) when negative,
 * the official Saudi riyal symbol, a space, then the grouped decimal amount.
 *
 * The `aria-label` uses the "SAR" code (e.g. "SAR 1,234.56" / "− SAR 23.00")
 * so tests and screen readers never depend on the SVG glyph. The flex row is
 * baseline-aligned and right-aligned by the caller's `justify-end` wrapper.
 */
export function SarAmount({ halalas }: SarAmountProps) {
  const { negative, amount } = formatReportSarNumber(halalas);
  const ariaLabel = negative ? `− SAR ${amount}` : `SAR ${amount}`;
  return (
    <span className="inline-flex items-baseline gap-1" aria-label={ariaLabel}>
      {negative && <span aria-hidden="true">−</span>}
      <SaudiRiyalSymbol />
      <span className="tabular-nums">{amount}</span>
    </span>
  );
}
