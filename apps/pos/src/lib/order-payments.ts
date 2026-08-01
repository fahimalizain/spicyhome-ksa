/**
 * Payment math over the append-only payment ledger (ADR 0006).
 *
 * `outstanding = order.totalHalalas − SUM(payment.amountHalalas)`.
 * Positive lines reduce outstanding, negative correction lines increase it.
 * All values are integer halalas — never floats.
 */

export interface PaymentLineLike {
  amountHalalas: number;
}

/** Sum of all payment line amounts (signed). */
export function calcPaymentsSumHalalas(payments: ReadonlyArray<PaymentLineLike>): number {
  return payments.reduce((sum, p) => sum + p.amountHalalas, 0);
}

/**
 * Outstanding amount from SERVER totals and the SERVER payment ledger.
 * Negative means the order is temporarily overpaid (allowed while `open`;
 * must be balanced to exactly 0 before Submit).
 */
export function calcOutstandingHalalas(
  totalHalalas: number,
  payments: ReadonlyArray<PaymentLineLike>,
): number {
  return totalHalalas - calcPaymentsSumHalalas(payments);
}
