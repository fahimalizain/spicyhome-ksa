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

/** A payment ledger line that also carries its payment-method identity. */
export interface PaymentMethodLineLike {
  methodId: string;
  methodTitle: string;
  amountHalalas: number;
}

/** Net total for one payment method over the ledger. */
export interface PaymentMethodTotal {
  methodId: string;
  methodTitle: string;
  /** Net sum of signed amountHalalas for this method. */
  totalHalalas: number;
}

/** Sum of all payment line amounts (signed). */
export function calcPaymentsSumHalalas(payments: ReadonlyArray<PaymentLineLike>): number {
  return payments.reduce((sum, p) => sum + p.amountHalalas, 0);
}

/**
 * Aggregate ledger lines by methodId.
 * - Sum signed amounts (corrections net against the method).
 * - Order: first appearance of each methodId in the input array (oldest-first ledger order).
 * - methodTitle: use the title from the first line for that methodId (snapshot at first pay).
 * - Empty input → [].
 * - Skip nothing: a method that nets to 0 still appears (corrections fully offsetting prior pays is useful to see).
 */
export function summarizePaymentsByMethod(
  payments: ReadonlyArray<PaymentMethodLineLike>,
): PaymentMethodTotal[] {
  const totalsByMethod = new Map<string, PaymentMethodTotal>();
  for (const p of payments) {
    let total = totalsByMethod.get(p.methodId);
    if (total === undefined) {
      total = { methodId: p.methodId, methodTitle: p.methodTitle, totalHalalas: 0 };
      totalsByMethod.set(p.methodId, total);
    }
    total.totalHalalas += p.amountHalalas;
  }
  return [...totalsByMethod.values()];
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
