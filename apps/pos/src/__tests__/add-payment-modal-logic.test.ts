import { describe, it, expect } from 'vitest';
import {
  applyNumpadKey,
  buildAddPaymentDraft,
  calcCashChange,
  canConfirmAddPayment,
  sarDisplayToHalalas,
  signedAmountHalalas,
  tenderedToHalalas,
  type AddPaymentDraft,
} from '../components/orders/add-payment-modal-logic';

describe('sarDisplayToHalalas', () => {
  it('converts whole + fraction', () => {
    expect(sarDisplayToHalalas('12.50')).toBe(1250);
  });

  it('converts whole-only', () => {
    expect(sarDisplayToHalalas('12')).toBe(1200);
  });

  it('treats a trailing dot as whole halalas', () => {
    expect(sarDisplayToHalalas('12.')).toBe(1200);
  });

  it('handles leading zeros', () => {
    expect(sarDisplayToHalalas('0.5')).toBe(50);
    expect(sarDisplayToHalalas('05')).toBe(500);
  });

  it('returns 0 for empty / dot-only input', () => {
    expect(sarDisplayToHalalas('')).toBe(0);
    expect(sarDisplayToHalalas('.')).toBe(0);
  });

  it('returns 0 for invalid input (more than 2 decimals, letters)', () => {
    expect(sarDisplayToHalalas('12.345')).toBe(0);
    expect(sarDisplayToHalalas('abc')).toBe(0);
    expect(sarDisplayToHalalas('-5')).toBe(0);
  });
});

describe('signedAmountHalalas', () => {
  it('positive sign keeps the amount positive', () => {
    expect(signedAmountHalalas('12.50', 1)).toBe(1250);
  });

  it('negative sign produces a correction line', () => {
    expect(signedAmountHalalas('12.50', -1)).toBe(-1250);
  });

  it('zero stays zero regardless of sign', () => {
    expect(signedAmountHalalas('', -1)).toBe(0);
    expect(signedAmountHalalas('0', -1)).toBe(0);
  });
});

describe('tenderedToHalalas', () => {
  it('returns undefined for blank input', () => {
    expect(tenderedToHalalas('')).toBeUndefined();
  });

  it('converts a tendered value', () => {
    expect(tenderedToHalalas('100')).toBe(10000);
  });
});

describe('buildAddPaymentDraft', () => {
  it('returns null without a method', () => {
    expect(
      buildAddPaymentDraft({ methodId: null, amountInput: '10', sign: 1, tenderedInput: '' }),
    ).toBeNull();
  });

  it('rejects a zero amount client-side', () => {
    expect(
      buildAddPaymentDraft({ methodId: 'cash', amountInput: '', sign: 1, tenderedInput: '' }),
    ).toBeNull();
    expect(
      buildAddPaymentDraft({ methodId: 'cash', amountInput: '0', sign: -1, tenderedInput: '' }),
    ).toBeNull();
  });

  it('positive cash with blank tendered omits tendered (server defaults to amount)', () => {
    const draft = buildAddPaymentDraft({
      methodId: 'cash',
      amountInput: '46',
      sign: 1,
      tenderedInput: '',
    });
    expect(draft).toEqual({ methodId: 'cash', amountHalalas: 4600 });
  });

  it('positive cash with tendered >= amount includes tendered', () => {
    const draft = buildAddPaymentDraft({
      methodId: 'cash',
      amountInput: '46',
      sign: 1,
      tenderedInput: '50',
    });
    expect(draft).toEqual({ methodId: 'cash', amountHalalas: 4600, tenderedHalalas: 5000 });
  });

  it('rejects insufficient tendered (tendered < amount)', () => {
    const draft = buildAddPaymentDraft({
      methodId: 'cash',
      amountInput: '46',
      sign: 1,
      tenderedInput: '40',
    });
    expect(draft).toBeNull();
  });

  it('negative cash never carries tendered even when tendered input exists', () => {
    const draft = buildAddPaymentDraft({
      methodId: 'cash',
      amountInput: '46',
      sign: -1,
      tenderedInput: '50',
    });
    expect(draft).toEqual({ methodId: 'cash', amountHalalas: -4600 });
  });

  it('non-cash lines ignore tendered input', () => {
    const draft = buildAddPaymentDraft({
      methodId: 'card',
      amountInput: '46',
      sign: 1,
      tenderedInput: '50',
    });
    expect(draft).toEqual({ methodId: 'card', amountHalalas: 4600 });
  });

  it('never clamps to outstanding — temporary overpay passes through', () => {
    // The draft builder has no knowledge of outstanding: a full-total line on
    // a 4600 order is 4600, and more than that is allowed.
    const draft = buildAddPaymentDraft({
      methodId: 'card',
      amountInput: '100',
      sign: 1,
      tenderedInput: '',
    });
    expect(draft).toEqual({ methodId: 'card', amountHalalas: 10000 });
  });
});

describe('canConfirmAddPayment', () => {
  it('false for a null draft (zero amount / no method)', () => {
    expect(canConfirmAddPayment(null, false)).toBe(false);
  });

  it('false while submitting', () => {
    const draft: AddPaymentDraft = { methodId: 'cash', amountHalalas: 4600 };
    expect(canConfirmAddPayment(draft, true)).toBe(false);
  });

  it('true for a valid draft', () => {
    const draft: AddPaymentDraft = { methodId: 'cash', amountHalalas: 4600 };
    expect(canConfirmAddPayment(draft, false)).toBe(true);
  });

  it('true for a negative correction line', () => {
    const draft: AddPaymentDraft = { methodId: 'cash', amountHalalas: -1000 };
    expect(canConfirmAddPayment(draft, false)).toBe(true);
  });
});

describe('calcCashChange', () => {
  it('defaults tendered to amount (change 0)', () => {
    expect(calcCashChange(4600)).toBe(0);
  });

  it('computes tendered − amount', () => {
    expect(calcCashChange(3250, 10000)).toBe(6750);
  });

  it('negative when tendered < amount', () => {
    expect(calcCashChange(5000, 3000)).toBe(-2000);
  });
});

describe('applyNumpadKey', () => {
  it('C clears the input', () => {
    expect(applyNumpadKey('12.50', 'C')).toBe('');
    expect(applyNumpadKey('', 'C')).toBe('');
  });

  it('⌫ removes the last character', () => {
    expect(applyNumpadKey('12.50', '⌫')).toBe('12.5');
    expect(applyNumpadKey('1', '⌫')).toBe('');
    expect(applyNumpadKey('', '⌫')).toBe('');
  });

  it('appends digits', () => {
    expect(applyNumpadKey('', '1')).toBe('1');
    expect(applyNumpadKey('1', '2')).toBe('12');
  });

  it('allows a single decimal point', () => {
    expect(applyNumpadKey('12', '.')).toBe('12.');
    expect(applyNumpadKey('12.', '5')).toBe('12.5');
  });

  it('rejects a second decimal point', () => {
    expect(applyNumpadKey('12.50', '.')).toBeNull();
  });

  it('caps decimal places at 2', () => {
    expect(applyNumpadKey('12.50', '1')).toBeNull();
    expect(applyNumpadKey('12.5', '0')).toBe('12.50');
  });
});
