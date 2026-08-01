/**
 * Pure logic for the AddPaymentModal (ADR 0006) — the replacement for the
 * old finalize-style PayModal.
 *
 * The modal appends ONE signed payment line and never submits. Rules:
 * - amount 0 is rejected client-side
 * - sign toggle `+` / `−` produces negative correction lines
 * - negative lines never carry tendered/change
 * - cash tendered only on positive cash lines; when provided it must be
 *   >= amount (server rule); blank tendered is omitted (server defaults to
 *   amount)
 * - no clamping to outstanding — temporary overpay is allowed while `open`
 */

export interface PaymentMethod {
  id: string;
  title: string;
  /**
   * Derived server flag (ADR 0007): true when this method is owned by a
   * delivery partner (its id exists in delivery_partners).
   */
  isDeliveryPartner?: boolean;
}

/**
 * ADR 0007: restrict the enabled payment methods shown for an order.
 *
 * - Order has a delivery partner: only that partner's own method is visible
 *   (method id === partner id — shared slug namespace).
 * - Order has no partner: partner-owned methods are hidden; the normal
 *   methods only.
 */
export function filterMethodsForOrder(
  methods: PaymentMethod[],
  deliveryPartnerId: string | null,
): PaymentMethod[] {
  if (deliveryPartnerId != null) {
    return methods.filter((m) => m.id === deliveryPartnerId);
  }
  return methods.filter((m) => !m.isDeliveryPartner);
}

export interface AddPaymentDraft {
  methodId: string;
  /** Signed amount: positive = payment, negative = correction. Never 0. */
  amountHalalas: number;
  /** Cash tendered, positive cash lines only. */
  tenderedHalalas?: number;
}

/**
 * Convert a SAR display string (e.g. "12.50") to integer halalas,
 * using integer-only math to avoid floating-point errors.
 * Only accepts up to 2 decimal digits; anything else yields 0.
 */
export function sarDisplayToHalalas(value: string): number {
  if (!value || value === '.') return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(value)) return 0;
  const parts = value.split('.');
  const whole = parseInt(parts[0] || '0', 10);
  const frac = parts[1] ? parseInt((parts[1] + '00').slice(0, 2), 10) : 0;
  return whole * 100 + frac;
}

/** Signed amount from the display string + sign toggle. 0 stays 0. */
export function signedAmountHalalas(amountInput: string, sign: 1 | -1): number {
  const halalas = sarDisplayToHalalas(amountInput);
  if (halalas === 0) return 0;
  return sign === -1 ? -halalas : halalas;
}

/** Tendered halalas; undefined when the input is blank. */
export function tenderedToHalalas(tenderedInput: string): number | undefined {
  if (!tenderedInput) return undefined;
  return sarDisplayToHalalas(tenderedInput);
}

/**
 * Build the addPayment DTO from the modal state.
 * Returns null when the line is invalid (no method, zero amount, or
 * insufficient cash tendered). Never clamps to outstanding.
 */
export function buildAddPaymentDraft(args: {
  methodId: string | null;
  amountInput: string;
  sign: 1 | -1;
  tenderedInput: string;
}): AddPaymentDraft | null {
  const { methodId, amountInput, sign, tenderedInput } = args;
  if (!methodId) return null;

  const amountHalalas = signedAmountHalalas(amountInput, sign);
  if (amountHalalas === 0) return null;

  const draft: AddPaymentDraft = { methodId, amountHalalas };

  if (amountHalalas > 0 && methodId === 'cash') {
    const tenderedHalalas = tenderedToHalalas(tenderedInput);
    if (tenderedHalalas !== undefined) {
      if (tenderedHalalas < amountHalalas) return null; // insufficient tendered
      draft.tenderedHalalas = tenderedHalalas;
    }
  }

  return draft;
}

/** Confirm gating: valid non-zero draft and not already submitting. */
export function canConfirmAddPayment(draft: AddPaymentDraft | null, submitting: boolean): boolean {
  if (submitting || !draft) return false;
  return draft.amountHalalas !== 0;
}

/**
 * Change due for a positive cash line: tendered − amount.
 * Blank tendered defaults to amount (server semantics), change 0.
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
