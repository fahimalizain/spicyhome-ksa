/**
 * ZATCA Payment Means type code — UBL `cac:PaymentMeans/cbc:PaymentMeansCode`
 * (EN 16931 business term **BT-81**, "Payment means type code").
 *
 * Sources (all checked into the repo):
 * - Data dictionary (`docs/zatca/20230519_EInvoice_Data_Dictionary vF.xlsx`,
 *   BT-81): optional on all invoice profiles; resolution field **9.1** maps
 *   "cash, credit/debit cards, bank transfer, credit, and/or others"; code
 *   list is a "subset of UNTDID 4461". UBL/EN 16931 cardinality is `1..n`
 *   (this codebase emits a single `cac:PaymentMeans` — see below).
 * - XML Implementation Standard
 *   (`docs/zatca/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_ vF.pdf`,
 *   §11.2.5): payment means type code from a subset of UN/CEFACT 4461 D.16B.
 *   **BR-KSA-16**: if BT-81 is present it must be one of the subset values.
 * - Schematron (runtime enforcement):
 *   `tools/zatca-sdk/Data/Rules/schematrons/20210819_ZATCA_E-invoice_Validation_Rules.xsl`
 *   accepts codes `10`, `30`, `42`, `48`, `1` only.
 *
 * Codes `54` (Credit card) and `55` (Debit card) exist in the full UN/ECE 4461
 * registry but are **excluded** from ZATCA's subset — card payments must use
 * `48` (Bank card), which is how the seeded `card`/`mada` methods are mapped.
 */
export const ZATCA_PAYMENT_MEANS_CODES = ['10', '30', '42', '48', '1'] as const;

export type ZatcaPaymentMeansCode = (typeof ZATCA_PAYMENT_MEANS_CODES)[number];

/** Fallback code used when no payment lines exist or a snapshot is invalid. */
export const DEFAULT_ZATCA_PAYMENT_MEANS_CODE: ZatcaPaymentMeansCode = '10';

/**
 * Short admin-UI labels, tracking the resolution field 9.1 categories
 * (cash / credit & debit cards / bank transfer / other).
 */
export const ZATCA_PAYMENT_MEANS_CODE_LABELS: Record<ZatcaPaymentMeansCode, string> = {
  '10': 'Cash',
  '30': 'Credit transfer (bank transfer)',
  '42': 'Payment to bank account',
  '48': 'Bank card (credit/debit)',
  '1': 'Instrument not defined (other)',
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
 * BT-81 cardinality is `1..n` in UBL/EN 16931, so multiple `cac:PaymentMeans`
 * blocks would be valid; v1 intentionally emits a single block for the
 * dominant tender.
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
