import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCart, computeTotals } from '../hooks/useCart';
import type { ItemResponse } from '@spicyhome/client-ts';

const mockItem: ItemResponse = {
  id: 1,
  categoryId: 1,
  name: 'Zinger Burger',
  priceHalalas: 2300,
  vatRateBp: 1500,
  sortOrder: 0,
  isActive: true,
  nameAr: null as any,
  createdAt: 1000,
  updatedAt: 1000,
  createdBy: null as any,
  updatedBy: null as any,
};

const mockItem2: ItemResponse = {
  ...mockItem,
  id: 2,
  name: 'Fries',
  priceHalalas: 1150,
};

describe('useCart', () => {
  it('starts with empty cart', () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.items).toHaveLength(0);
    expect(result.current.orderType).toBe('dine_in');
    expect(result.current.totals.totalHalalas).toBe(0);
  });

  it('adds item to cart', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('Zinger Burger');
    expect(result.current.items[0].qty).toBe(1);
    expect(result.current.items[0].unitPriceHalalas).toBe(2300);
  });

  it('increases qty when adding same item', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    act(() => {
      result.current.addItem(mockItem);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(2);
  });

  it('adds multiple different items', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    act(() => {
      result.current.addItem(mockItem2);
    });
    expect(result.current.items).toHaveLength(2);
  });

  it('removes item from cart', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    act(() => {
      result.current.addItem(mockItem2);
    });
    act(() => {
      result.current.removeItem(1);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('Fries');
  });

  it('updates qty', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    act(() => {
      result.current.updateQty(1, 3);
    });
    expect(result.current.items[0].qty).toBe(3);
  });

  it('removes item when qty set to 0', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    act(() => {
      result.current.updateQty(1, 0);
    });
    expect(result.current.items).toHaveLength(0);
  });

  it('updates notes', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    act(() => {
      result.current.updateNotes(1, 'no onion');
    });
    expect(result.current.items[0].notes).toBe('no onion');
  });

  it('sets order type to takeaway', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setOrderType('takeaway', null);
    });
    expect(result.current.orderType).toBe('takeaway');
    expect(result.current.tableId).toBeNull();
  });

  it('sets order type to dine_in with table', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setOrderType('dine_in', 3);
    });
    expect(result.current.orderType).toBe('dine_in');
    expect(result.current.tableId).toBe(3);
  });

  it('clears cart', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.items).toHaveLength(0);
  });
});

describe('computeTotals', () => {
  it('returns zero for empty cart', () => {
    const totals = computeTotals([]);
    expect(totals.totalHalalas).toBe(0);
    expect(totals.subtotalHalalas).toBe(0);
    expect(totals.vatHalalas).toBe(0);
  });

  it('computes single item totals', () => {
    const totals = computeTotals([
      { itemId: 1, name: 'Burger', unitPriceHalalas: 2300, vatRateBp: 1500, qty: 1, notes: '' },
    ]);
    expect(totals.totalHalalas).toBe(2300);
    expect(totals.subtotalHalalas).toBe(2000);
    expect(totals.vatHalalas).toBe(300);
  });

  it('computes multiple quantities', () => {
    const totals = computeTotals([
      { itemId: 1, name: 'Burger', unitPriceHalalas: 2300, vatRateBp: 1500, qty: 2, notes: '' },
    ]);
    expect(totals.totalHalalas).toBe(4600);
    expect(totals.subtotalHalalas).toBe(4000);
    expect(totals.vatHalalas).toBe(600);
  });

  it('computes mixed items with different VAT rates', () => {
    const totals = computeTotals([
      { itemId: 1, name: 'Burger', unitPriceHalalas: 2300, vatRateBp: 1500, qty: 1, notes: '' },
      { itemId: 2, name: 'Water', unitPriceHalalas: 100, vatRateBp: 0, qty: 1, notes: '' },
    ]);
    expect(totals.totalHalalas).toBe(2400);
    expect(totals.subtotalHalalas).toBe(2100);
    expect(totals.vatHalalas).toBe(300);
  });

  it('subtotal + VAT = total', () => {
    const totals = computeTotals([
      { itemId: 1, name: 'Burger', unitPriceHalalas: 2300, vatRateBp: 1500, qty: 3, notes: '' },
      { itemId: 2, name: 'Fries', unitPriceHalalas: 1150, vatRateBp: 1500, qty: 1, notes: '' },
    ]);
    expect(totals.subtotalHalalas + totals.vatHalalas).toBe(totals.totalHalalas);
  });
});
