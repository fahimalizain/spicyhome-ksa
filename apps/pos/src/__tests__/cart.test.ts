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
    documentId: 'INV26-0042',
    uuid: 'test-uuid',
    type: 'dine_in',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 0,
    vatHalalas: 0,
    totalHalalas: 0,
    discountHalalas: 0,
    isStandardInvoice: false,
    zatcaBuyerDetails: null,
    deliveryPartnerId: null,
    deliveryPartnerTitle: null,
    deliveryExternalRef: null,
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
    items: [],
    events: [],
    payments: [],
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
    expect(result.current.isDirty).toBe(false);
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

  it('merges same menu itemId (D11)', () => {
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

  it('clears cart and resets snapshot', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addItem(mockItem);
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.items).toHaveLength(0);
    expect(result.current.isDirty).toBe(false);
  });

  // ---- loadOrder & snapshot ----

  it('loadOrder sets items and stores serverSnapshot', () => {
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
      ],
    });

    act(() => {
      result.current.loadOrder(order);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].orderItemId).toBe(101);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.serverUpdatedAt).toBe(order.updatedAt);
  });

  // ---- Delivery partner (ADR 0007) ----

  it('loadOrder hydrates delivery partner fields from the order', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      type: 'takeaway',
      tableId: null,
      deliveryPartnerId: 'hungerstation',
      deliveryPartnerTitle: 'HungerStation',
      deliveryExternalRef: 'HS-883129',
    });

    act(() => {
      result.current.loadOrder(order);
    });

    expect(result.current.deliveryPartnerId).toBe('hungerstation');
    expect(result.current.deliveryPartnerTitle).toBe('HungerStation');
    expect(result.current.deliveryExternalRef).toBe('HS-883129');
  });

  it('loadOrder with no partner hydrates null partner fields', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setDeliveryPartner('keeta', 'Keeta', 'K-1');
    });

    act(() => {
      result.current.loadOrder(makeOrderResponse({ type: 'takeaway', tableId: null }));
    });

    expect(result.current.deliveryPartnerId).toBeNull();
    expect(result.current.deliveryPartnerTitle).toBeNull();
    expect(result.current.deliveryExternalRef).toBeNull();
  });

  it('setDeliveryPartner stages a pre-create selection', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setDeliveryPartner('hungerstation', 'HungerStation', 'HS-42');
    });
    expect(result.current.deliveryPartnerId).toBe('hungerstation');
    expect(result.current.deliveryPartnerTitle).toBe('HungerStation');
    expect(result.current.deliveryExternalRef).toBe('HS-42');
  });

  it('setDeliveryPartner with null clears partner and ref', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setDeliveryPartner('hungerstation', 'HungerStation', 'HS-42');
    });
    act(() => {
      result.current.setDeliveryPartner(null, null, null);
    });
    expect(result.current.deliveryPartnerId).toBeNull();
    expect(result.current.deliveryPartnerTitle).toBeNull();
    expect(result.current.deliveryExternalRef).toBeNull();
  });

  it('setDeliveryExternalRef stages only the ref', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setDeliveryPartner('hungerstation', 'HungerStation', null);
    });
    act(() => {
      result.current.setDeliveryExternalRef('HS-99');
    });
    expect(result.current.deliveryPartnerId).toBe('hungerstation');
    expect(result.current.deliveryPartnerTitle).toBe('HungerStation');
    expect(result.current.deliveryExternalRef).toBe('HS-99');
  });

  it('switching the pre-create cart to dine_in clears the staged partner', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setOrderType('takeaway', null);
    });
    act(() => {
      result.current.setDeliveryPartner('hungerstation', 'HungerStation', 'HS-42');
    });
    act(() => {
      result.current.setOrderType('dine_in', 3);
    });
    expect(result.current.orderType).toBe('dine_in');
    expect(result.current.tableId).toBe(3);
    expect(result.current.deliveryPartnerId).toBeNull();
    expect(result.current.deliveryPartnerTitle).toBeNull();
    expect(result.current.deliveryExternalRef).toBeNull();
  });

  // ---- Order-level notes ----

  it('starts with empty order notes', () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.orderNotes).toBe('');
  });

  it('setOrderNotes stages order notes on a pre-create cart', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setOrderNotes('Call on arrival');
    });
    expect(result.current.orderNotes).toBe('Call on arrival');
    // Order notes are NOT part of the item dirty comparison
    expect(result.current.isDirty).toBe(false);
  });

  it('loadOrder hydrates order notes from the order', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      type: 'takeaway',
      tableId: null,
      notes: 'Keep it hot',
      items: [makeOrderItem({ id: 101, itemId: 1, qty: 1 })],
    });

    act(() => {
      result.current.loadOrder(order);
    });

    expect(result.current.orderNotes).toBe('Keep it hot');
  });

  it('loadOrder without notes hydrates empty string', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setOrderNotes('stale staged value');
    });
    act(() => {
      result.current.loadOrder(makeOrderResponse({ type: 'takeaway', tableId: null, notes: null }));
    });
    expect(result.current.orderNotes).toBe('');
  });

  it('clear resets order notes', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setOrderNotes('Call on arrival');
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.orderNotes).toBe('');
  });

  it('switching to takeaway keeps the staged partner (no auto-set)', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setOrderType('takeaway', null);
    });
    expect(result.current.deliveryPartnerId).toBeNull();
  });

  it('clear resets delivery partner fields', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.setDeliveryPartner('hungerstation', 'HungerStation', 'HS-42');
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.deliveryPartnerId).toBeNull();
    expect(result.current.deliveryPartnerTitle).toBeNull();
    expect(result.current.deliveryExternalRef).toBeNull();
  });

  it('discard preserves hydrated delivery partner fields', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      type: 'takeaway',
      tableId: null,
      deliveryPartnerId: 'hungerstation',
      deliveryPartnerTitle: 'HungerStation',
      deliveryExternalRef: 'HS-883129',
      items: [makeOrderItem({ id: 101, itemId: 1, qty: 2 })],
    });

    act(() => {
      result.current.loadOrder(order);
    });
    act(() => {
      result.current.updateQty(1, 5);
    });
    act(() => {
      result.current.discard();
    });

    expect(result.current.deliveryPartnerId).toBe('hungerstation');
    expect(result.current.deliveryPartnerTitle).toBe('HungerStation');
    expect(result.current.deliveryExternalRef).toBe('HS-883129');
  });

  // ---- isDirty detection ----

  it('isDirty becomes true after local mutation', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [makeOrderItem({ id: 101, itemId: 5, qty: 1 })],
    });

    act(() => {
      result.current.loadOrder(order);
    });
    expect(result.current.isDirty).toBe(false);

    // Add a new item locally
    act(() => {
      result.current.addItem(mockItem);
    });
    expect(result.current.isDirty).toBe(true);
  });

  it('isDirty becomes true after qty change', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [makeOrderItem({ id: 101, itemId: 1, qty: 1 })],
    });

    act(() => {
      result.current.loadOrder(order);
    });
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.updateQty(1, 3);
    });
    expect(result.current.isDirty).toBe(true);
  });

  it('isDirty becomes true after remove', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [makeOrderItem({ id: 101, itemId: 1, qty: 1 })],
    });

    act(() => {
      result.current.loadOrder(order);
    });
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.removeItem(1);
    });
    expect(result.current.isDirty).toBe(true);
  });

  it('isDirty becomes true after notes change', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [makeOrderItem({ id: 101, itemId: 1, qty: 1, notes: null })],
    });

    act(() => {
      result.current.loadOrder(order);
    });
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.updateNotes(1, 'extra salt');
    });
    expect(result.current.isDirty).toBe(true);
  });

  // ---- Discard ----

  it('discard restores server snapshot', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [makeOrderItem({ id: 101, itemId: 1, qty: 2, notes: 'original' })],
    });

    act(() => {
      result.current.loadOrder(order);
    });

    // Make changes
    act(() => {
      result.current.updateQty(1, 5);
      result.current.updateNotes(1, 'changed');
    });
    expect(result.current.isDirty).toBe(true);

    // Discard
    act(() => {
      result.current.discard();
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.items[0].qty).toBe(2);
    expect(result.current.items[0].notes).toBe('original');
  });

  // ---- markClean ----

  it('markClean resets isDirty without changing items', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      items: [makeOrderItem({ id: 101, itemId: 1, qty: 1 })],
    });

    act(() => {
      result.current.loadOrder(order);
    });

    act(() => {
      result.current.updateQty(1, 3);
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.markClean();
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.items[0].qty).toBe(3); // items unchanged
  });

  // ---- isDirty false after loadOrder called again (e.g. after sync) ----

  it('isDirty false after loadOrder called with updated server state', () => {
    const { result } = renderHook(() => useCart());
    const order = makeOrderResponse({
      updatedAt: 1000,
      items: [makeOrderItem({ id: 101, itemId: 1, qty: 1 })],
    });

    act(() => {
      result.current.loadOrder(order);
    });
    expect(result.current.isDirty).toBe(false);

    // Simulate sync success — load updated order
    const updatedOrder = makeOrderResponse({
      updatedAt: 2000,
      items: [makeOrderItem({ id: 101, itemId: 1, qty: 3 })],
    });
    act(() => {
      result.current.loadOrder(updatedOrder);
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.items[0].qty).toBe(3);
    expect(result.current.serverUpdatedAt).toBe(2000);
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

  it('subtotal + VAT = total', () => {
    const totals = computeTotals([
      { itemId: 1, name: 'Burger', unitPriceHalalas: 2300, vatRateBp: 1500, qty: 3, notes: '' },
      { itemId: 2, name: 'Fries', unitPriceHalalas: 1150, vatRateBp: 1500, qty: 1, notes: '' },
    ]);
    expect(totals.subtotalHalalas + totals.vatHalalas).toBe(totals.totalHalalas);
  });
});
