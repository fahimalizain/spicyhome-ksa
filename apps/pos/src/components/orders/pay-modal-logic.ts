export interface PaymentMethod {
  id: string;
  title: string;
}

export interface PaymentLine {
  methodId: string;
  amountHalalas: number;
  tenderedHalalas?: number;
}

export interface PayModalState {
  /** Total order amount to pay */
  orderTotalHalalas: number;
  /** Available payment methods */
  methods: PaymentMethod[];
  /** Currently selected method index */
  selectedMethodIndex: number | null;
  /** Amount entered for each method (keyed by methodId) */
  amounts: Record<string, number>;
  /** Tendered amount for cash (only for methodId === 'cash') */
  tenderedHalalas: number | undefined;
  /** Whether the numpad is active */
  numpadActive: boolean;
}

/**
 * Calculate outstanding amount: total - sum of all entered amounts.
 */
export function calcOutstanding(
  orderTotalHalalas: number,
  amounts: Record<string, number>,
): number {
  const sum = Object.values(amounts).reduce((a, b) => a + b, 0);
  return orderTotalHalalas - sum;
}

/**
 * Check if payment is ready to submit:
 * - Outstanding === 0
 * - At least one non-zero payment line
 */
export function canPay(state: PayModalState): boolean {
  const outstanding = calcOutstanding(state.orderTotalHalalas, state.amounts);
  if (outstanding !== 0) return false;

  // Must have at least one non-zero payment line
  const hasNonZero = Object.values(state.amounts).some((a) => a > 0);
  return hasNonZero;
}

/**
 * Apply tap-to-fill: set the selected method's amount to the remaining outstanding.
 */
export function tapToFill(state: PayModalState, methodId: string): Record<string, number> {
  const outstanding = calcOutstanding(state.orderTotalHalalas, state.amounts);
  if (outstanding <= 0) return { ...state.amounts };

  const newAmounts = { ...state.amounts };
  newAmounts[methodId] = (newAmounts[methodId] || 0) + outstanding;
  return newAmounts;
}

/**
 * Strip zero-amount methods before submitting.
 */
export function stripZeroPayments(
  amounts: Record<string, number>,
  tenderedHalalas?: number,
): PaymentLine[] {
  const lines: PaymentLine[] = [];
  for (const [methodId, amount] of Object.entries(amounts)) {
    if (amount > 0) {
      const line: PaymentLine = { methodId, amountHalalas: amount };
      if (methodId === 'cash') {
        line.tenderedHalalas = tenderedHalalas ?? amount;
      }
      lines.push(line);
    }
  }
  return lines;
}

/**
 * Compute change for cash: tendered - amount.
 */
export function calcCashChange(amountHalalas: number, tenderedHalalas?: number): number {
  return (tenderedHalalas ?? amountHalalas) - amountHalalas;
}

/**
 * Append a numpad key to a SAR display string.
 * Returns the next display string, or null if the key is rejected.
 *
 * Rules:
 * - C → ''
 * - ⌫ → remove last character
 * - '.' only if no '.' already exists
 * - Digits: max 2 decimal places after '.'
 * - Allows leading empty string + digits
 */
export function applyNumpadKey(current: string, key: string): string | null {
  if (key === 'C') return '';
  if (key === '⌫') return current.slice(0, -1);
  if (key === '.') {
    if (current.includes('.')) return null;
    return current + '.';
  }
  // Digit key (0-9)
  const next = current + key;
  const dotIndex = next.indexOf('.');
  if (dotIndex >= 0) {
    const decimalPlaces = next.length - dotIndex - 1;
    if (decimalPlaces > 2) return null;
  }
  return next;
}
