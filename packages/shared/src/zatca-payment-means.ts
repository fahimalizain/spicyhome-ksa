/**
 * ZATCA-accepted UN/ECE 4461 Payment Means codes.
 *
 * The allow-list comes from the KSA schematron
 * (tools/zatca-sdk/Data/Rules/schematrons/20210819_ZATCA_E-invoice_Validation_Rules.xsl),
 * which accepts codes `10`, `30`, `42`, `48`, `1` only. In particular codes
 * `54` / `55` (credit-transfer / card variants in the full UN/ECE registry)
 * are rejected by ZATCA validation and must never be emitted.
 */
export const ZATCA_PAYMENT_MEANS_CODES = ['10', '30', '42', '48', '1'] as const;

export type ZatcaPaymentMeansCode = (typeof ZATCA_PAYMENT_MEANS_CODES)[number];

/** Fallback code used when no payment lines exist or a snapshot is invalid. */
export const DEFAULT_ZATCA_PAYMENT_MEANS_CODE: ZatcaPaymentMeansCode = '10';

export const ZATCA_PAYMENT_MEANS_CODE_LABELS: Record<ZatcaPaymentMeansCode, string> = {
  '10': 'Cash',
  '30': 'Credit transfer',
  '42': 'Payment to bank account',
  '48': 'Bank card',
  '1': 'Instrument not defined',
};

export function isZatcaPaymentMeansCode(value: string): value is ZatcaPaymentMeansCode {
  return (ZATCA_PAYMENT_MEANS_CODES as readonly string[]).includes(value);
}

/** One payment line as consumed by `resolvePaymentMeansCode`. */
export interface PaymentMeansCodeLine {
  amountHalalas: number;
  methodId: string;
  /** Snapshot of the payment method's ZATCA code at pay/refund time. */
  zatcaPaymentMeansCode: string;
}

/**
 * Resolve the single `cbc:PaymentMeansCode` for a document from its payment
 * lines (v1 split-tender resolution: one PaymentMeans block only).
 *
 * Rules:
 * - No lines → default `10`.
 * - Sort lines by `amountHalalas` DESC, then `methodId` ASC (stable tie-break).
 * - Use the top line's snapshot code; invalid/missing code → default `10`.
 */
export function resolvePaymentMeansCode(
  lines: ReadonlyArray<PaymentMeansCodeLine>,
): ZatcaPaymentMeansCode {
  if (lines.length === 0) return DEFAULT_ZATCA_PAYMENT_MEANS_CODE;

  const [top] = [...lines].sort((a, b) => {
    if (b.amountHalalas !== a.amountHalalas) return b.amountHalalas - a.amountHalalas;
    if (a.methodId < b.methodId) return -1;
    if (a.methodId > b.methodId) return 1;
    return 0;
  });

  return isZatcaPaymentMeansCode(top.zatcaPaymentMeansCode)
    ? top.zatcaPaymentMeansCode
    : DEFAULT_ZATCA_PAYMENT_MEANS_CODE;
}
