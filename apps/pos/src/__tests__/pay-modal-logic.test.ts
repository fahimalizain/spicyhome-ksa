import { describe, it, expect } from 'vitest';
import {
  calcOutstanding,
  canPay,
  tapToFill,
  stripZeroPayments,
  calcCashChange,
  type PayModalState,
  type PaymentMethod,
} from '../components/orders/pay-modal-logic';

function makeState(
  overrides: Partial<PayModalState> = {},
): PayModalState {
  const methods: PaymentMethod[] = [
    { id: 'cash', title: 'Cash' },
    { id: 'card', title: 'Card' },
    { id: 'mada', title: 'mada' },
  ];
  const amounts: Record<string, number> = {};
  methods.forEach((m) => (amounts[m.id] = 0));
  return {
    orderTotalHalalas: 4600,
    methods,
    selectedMethodIndex: null,
    amounts,
    tenderedHalalas: undefined,
    numpadActive: false,
    ...overrides,
  };
}

describe('calcOutstanding', () => {
  it('returns order total when no amounts entered', () => {
    const state = makeState();
    expect(calcOutstanding(state.orderTotalHalalas, state.amounts)).toBe(4600);
  });

  it('returns 0 when amounts sum to total', () => {
    const amounts = { cash: 2300, card: 2300, mada: 0 };
    expect(calcOutstanding(4600, amounts)).toBe(0);
  });

  it('returns remaining when partial amounts entered', () => {
    const amounts = { cash: 2000, card: 0, mada: 0 };
    expect(calcOutstanding(4600, amounts)).toBe(2600);
  });

  it('returns negative for overpayment', () => {
    const amounts = { cash: 5000, card: 0, mada: 0 };
    expect(calcOutstanding(4600, amounts)).toBe(-400);
  });
});

describe('canPay', () => {
  it('returns false when outstanding > 0', () => {
    const state = makeState({ amounts: { cash: 2000, card: 0, mada: 0 } });
    expect(canPay(state)).toBe(false);
  });

  it('returns true when outstanding === 0', () => {
    const state = makeState({ amounts: { cash: 4600, card: 0, mada: 0 } });
    expect(canPay(state)).toBe(true);
  });

  it('returns true for split-tender with sum = total', () => {
    const state = makeState({ amounts: { cash: 2300, card: 2300, mada: 0 } });
    expect(canPay(state)).toBe(true);
  });

  it('returns false when all amounts are zero', () => {
    const state = makeState({ amounts: { cash: 0, card: 0, mada: 0 } });
    // outstanding = 4600 for zero-amounts? Wait, all amounts are 0, outstanding = 4600
    // So canPay returns false because outstanding !== 0
    expect(canPay(state)).toBe(false);
  });

  it('returns false when total is 0 (no items)', () => {
    const state = makeState({ orderTotalHalalas: 0, amounts: { cash: 0, card: 0, mada: 0 } });
    expect(canPay(state)).toBe(false);
  });
});

describe('tapToFill', () => {
  it('fills the remaining outstanding into the selected method', () => {
    const state = makeState({ amounts: { cash: 2000, card: 0, mada: 0 } });
    const newAmounts = tapToFill(state, 'card');
    expect(newAmounts.card).toBe(2600);
    expect(newAmounts.cash).toBe(2000);
  });

  it('does nothing if outstanding is 0', () => {
    const state = makeState({ amounts: { cash: 4600, card: 0, mada: 0 } });
    const newAmounts = tapToFill(state, 'card');
    expect(newAmounts.card).toBe(0);
  });

  it('fills from scratch when no amounts entered', () => {
    const state = makeState();
    const newAmounts = tapToFill(state, 'cash');
    expect(newAmounts.cash).toBe(4600);
  });
});

describe('stripZeroPayments', () => {
  it('removes zero-amount methods', () => {
    const lines = stripZeroPayments({ cash: 4600, card: 0, mada: 0 });
    expect(lines).toHaveLength(1);
    expect(lines[0].methodId).toBe('cash');
    expect(lines[0].amountHalalas).toBe(4600);
  });

  it('preserves all non-zero methods for split-tender', () => {
    const lines = stripZeroPayments({ cash: 3000, card: 1600, mada: 0 });
    expect(lines).toHaveLength(2);
    expect(lines[0].methodId).toBe('cash');
    expect(lines[0].amountHalalas).toBe(3000);
    expect(lines[1].methodId).toBe('card');
    expect(lines[1].amountHalalas).toBe(1600);
  });

  it('includes tenderedHalalas for cash method', () => {
    const lines = stripZeroPayments({ cash: 3250, card: 0, mada: 0 }, 10000);
    expect(lines).toHaveLength(1);
    expect(lines[0].methodId).toBe('cash');
    expect(lines[0].amountHalalas).toBe(3250);
    expect(lines[0].tenderedHalalas).toBe(10000);
  });

  it('defaults tenderedHalalas to amount for cash if not provided', () => {
    const lines = stripZeroPayments({ cash: 3250, card: 0, mada: 0 });
    expect(lines[0].tenderedHalalas).toBe(3250);
  });

  it('returns empty array when all amounts are zero', () => {
    const lines = stripZeroPayments({ cash: 0, card: 0, mada: 0 });
    expect(lines).toHaveLength(0);
  });
});

describe('calcCashChange', () => {
  it('returns 0 when tendered equals amount', () => {
    expect(calcCashChange(4600, 4600)).toBe(0);
  });

  it('returns positive change when tendered > amount', () => {
    expect(calcCashChange(3250, 10000)).toBe(6750);
  });

  it('returns negative when tendered < amount', () => {
    expect(calcCashChange(5000, 3000)).toBe(-2000);
  });

  it('defaults tendered to amount when not provided', () => {
    expect(calcCashChange(4600)).toBe(0);
  });
});
