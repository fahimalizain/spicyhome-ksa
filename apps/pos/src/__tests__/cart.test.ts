import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCart, computeTotals } from '../hooks/useCart';
import type { ItemResponse, OrderResponse } from '@spicyhome/client-ts';

const mockItem: ItemResponse = {
  id: 1,
  categoryId: 1,
  name: 'Zinger Burger',
  priceHalalas: 2300,
  vatRateBp: 1500,
  sortOrder: 0,
  isActive: true,
  nameAr: null,
  createdAt: 1000,
  updatedAt: 1000,
  createdBy: null,
  updatedBy: null,
};

const mockItem2: ItemResponse = {
  ...mockItem,
  id: 2,
  name: 'Fries',
  priceHalalas: 1150,
};

function makeOrderResponse(overrides: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: 1,
    orderNo: 42,
    uuid: 'test-uuid',
    type: 'dine_in',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 0,
    vatHalalas: 0,
    totalHalalas: 0,
    discountHalalas: 0,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
    items: [],
    events: [],
    ...overrides,
  };
}

function makeOrderItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orderId: 1,
    itemId: 1,
    itemName: 'Burger',
    unitPriceHalalas: 2300,
    vatRateBp: 1500,
    qty: 2,
    totalHalalas: 4600,
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

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

  // ---- Pre-order merge behavior ----

  it('pre-order: addItem merges same menu itemId into one line', () => {
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

  // ---- loadOrder ----

  it('loadOrder sets orderItemId from oi.id and itemId from oi.itemId', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      type: 'takeaway',
      tableId: null,
      items: [
        makeOrderItem({
          id: 101,
          itemId: 5,
          itemName: 'Burger',
          unitPriceHalalas: 2300,
          vatRateBp: 1500,
          qty: 3,
          notes: 'extra cheese',
        }),
        makeOrderItem({
          id: 102,
          itemId: 7,
          itemName: 'Fries',
          unitPriceHalalas: 1150,
          vatRateBp: 1500,
          qty: 1,
          notes: null,
        }),
      ],
    });

    act(() => {
      result.current.loadOrder(order);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].orderItemId).toBe(101);
    expect(result.current.items[0].itemId).toBe(5);
    expect(result.current.items[0].name).toBe('Burger');
    expect(result.current.items[0].unitPriceHalalas).toBe(2300);
    expect(result.current.items[0].vatRateBp).toBe(1500);
    expect(result.current.items[0].qty).toBe(3);
    expect(result.current.items[0].notes).toBe('extra cheese');

    expect(result.current.items[1].orderItemId).toBe(102);
    expect(result.current.items[1].itemId).toBe(7);
    expect(result.current.items[1].name).toBe('Fries');
    expect(result.current.items[1].qty).toBe(1);

    expect(result.current.orderType).toBe('takeaway');
  });

  it('loadOrder handles empty items array', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({ items: [] });

    act(() => {
      result.current.loadOrder(order);
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('loadOrder handles null tableId', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({ tableId: null });

    act(() => {
      result.current.loadOrder(order);
    });

    expect(result.current.tableId).toBeNull();
  });

  // ---- appendItem (post-order, always new line) ----

  it('appendItem always appends a new line, never merges', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.appendItem(mockItem);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('Zinger Burger');
    expect(result.current.items[0].qty).toBe(1);
    expect(result.current.items[0].orderItemId).toBeUndefined();

    // Append same menu item again — should be a new line
    act(() => {
      result.current.appendItem(mockItem);
    });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].name).toBe('Zinger Burger');
    expect(result.current.items[1].name).toBe('Zinger Burger');
    expect(result.current.items[0].qty).toBe(1);
    expect(result.current.items[1].qty).toBe(1);
  });

  it('appendItem adds multiple different items', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.appendItem(mockItem);
    });
    act(() => {
      result.current.appendItem(mockItem2);
    });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].name).toBe('Zinger Burger');
    expect(result.current.items[1].name).toBe('Fries');
  });

  // ---- updateQtyByOrderItem ----

  it('updateQtyByOrderItem updates qty of the matching orderItemId', () => {
    const { result } = renderHook(() => useCart());
    // Set up via loadOrder so items have orderItemIds
    const order = makeOrderResponse({
      items: [
        makeOrderItem({
          id: 201,
          itemId: 1,
          itemName: 'Burger',
          qty: 2,
        }),
        makeOrderItem({
          id: 202,
          itemId: 2,
          itemName: 'Fries',
          qty: 1,
        }),
      ],
    });
    act(() => {
      result.current.loadOrder(order);
    });

    act(() => {
      result.current.updateQtyByOrderItem(201, 5);
    });

    expect(result.current.items[0].qty).toBe(5);
    expect(result.current.items[1].qty).toBe(1); // unchanged
    expect(result.current.items).toHaveLength(2);
  });

  it('updateQtyByOrderItem removes item when qty <= 0', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [
        makeOrderItem({
          id: 301,
          itemId: 1,
          itemName: 'Burger',
          qty: 1,
        }),
      ],
    });
    act(() => {
      result.current.loadOrder(order);
    });

    act(() => {
      result.current.updateQtyByOrderItem(301, 0);
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('updateQtyByOrderItem does not affect other orderItemIds', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [
        makeOrderItem({
          id: 401,
          itemId: 1,
          itemName: 'Burger',
          qty: 2,
        }),
        makeOrderItem({
          id: 402,
          itemId: 1,
          itemName: 'Burger',
          qty: 3,
        }),
      ],
    });
    act(() => {
      result.current.loadOrder(order);
    });

    act(() => {
      result.current.updateQtyByOrderItem(401, 1);
    });

    expect(result.current.items[0].qty).toBe(1);
    expect(result.current.items[1].qty).toBe(3);
  });

  // ---- removeByOrderItem ----

  it('removeByOrderItem removes the matching line', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [
        makeOrderItem({
          id: 501,
          itemId: 1,
          itemName: 'Burger',
          qty: 1,
        }),
        makeOrderItem({
          id: 502,
          itemId: 2,
          itemName: 'Fries',
          qty: 1,
        }),
        makeOrderItem({
          id: 503,
          itemId: 3,
          itemName: 'Cola',
          qty: 1,
        }),
      ],
    });
    act(() => {
      result.current.loadOrder(order);
    });

    act(() => {
      result.current.removeByOrderItem(502);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].orderItemId).toBe(501);
    expect(result.current.items[1].orderItemId).toBe(503);
  });

  it('removeByOrderItem does nothing for non-existent id', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [
        makeOrderItem({
          id: 601,
          itemId: 1,
          itemName: 'Burger',
          qty: 1,
        }),
      ],
    });
    act(() => {
      result.current.loadOrder(order);
    });

    act(() => {
      result.current.removeByOrderItem(999);
    });

    expect(result.current.items).toHaveLength(1);
  });

  // ---- updateNotesByOrderItem ----

  it('updateNotesByOrderItem updates notes on matching line', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [
        makeOrderItem({
          id: 701,
          itemId: 1,
          itemName: 'Burger',
          qty: 1,
          notes: null,
        }),
        makeOrderItem({
          id: 702,
          itemId: 2,
          itemName: 'Fries',
          qty: 1,
          notes: 'no salt',
        }),
      ],
    });
    act(() => {
      result.current.loadOrder(order);
    });

    act(() => {
      result.current.updateNotesByOrderItem(701, 'no onions');
    });

    expect(result.current.items[0].notes).toBe('no onions');
    expect(result.current.items[1].notes).toBe('no salt'); // unchanged
  });

  // ---- CartItem has optional orderItemId ----

  it('CartItem has orderItemId as optional field', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    expect(result.current.items[0].orderItemId).toBeUndefined();
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

  it('computes single item totals with orderItemId', () => {
    const totals = computeTotals([
      {
        itemId: 1,
        orderItemId: 101,
        name: 'Burger',
        unitPriceHalalas: 2300,
        vatRateBp: 1500,
        qty: 1,
        notes: '',
      },
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
