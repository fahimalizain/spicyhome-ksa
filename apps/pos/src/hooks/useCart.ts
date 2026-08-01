import { useReducer, useCallback } from 'react';
import { decomposeVat } from '@spicyhome/shared';
import type { ItemResponse, OrderResponse } from '@spicyhome/client-ts';

export interface CartItem {
  itemId: number; // menu item ID
  orderItemId?: number; // order_items.id — set after server creates it
  name: string;
  unitPriceHalalas: number;
  vatRateBp: number;
  qty: number;
  notes: string;
}

export interface CartState {
  items: CartItem[];
  orderType: 'dine_in' | 'takeaway';
  tableId: number | null;
  /** Delivery partner slug (ADR 0007). Null for dine-in / walk-in takeaway. */
  deliveryPartnerId: string | null;
  /** Delivery partner title for display (hydrated from the server). */
  deliveryPartnerTitle: string | null;
  /** Delivery app's order number for reconciliation (only with a partner). */
  deliveryExternalRef: string | null;
  /**
   * Order-level notes ("Order notes"). Pre-create: staged locally and sent
   * with the create DTO. Open order: hydrated from `order.notes`; saved via
   * immediate PATCH /orders/:id (NOT part of the item dirty comparison).
   */
  orderNotes: string;
  /** Server snapshot items (null = no order loaded yet). */
  snapshotItems: CartItem[] | null;
  /** Server updatedAt when last hydrated. */
  snapshotUpdatedAt: number | null;
}

type CartAction =
  | { type: 'ADD_ITEM'; item: CartItem }
  | { type: 'REMOVE_ITEM'; itemId: number }
  | { type: 'UPDATE_QTY'; itemId: number; qty: number }
  | { type: 'UPDATE_NOTES'; itemId: number; notes: string }
  | { type: 'SET_ORDER_TYPE'; orderType: 'dine_in' | 'takeaway'; tableId: number | null }
  /** Stage order-level notes (pre-create only; open orders PATCH immediately). */
  | { type: 'SET_ORDER_NOTES'; notes: string }
  /**
   * ADR 0007: set/clear the delivery partner staging (pre-create only).
   * Fields may be omitted to keep the current value.
   */
  | {
      type: 'SET_DELIVERY_PARTNER';
      deliveryPartnerId?: string | null;
      deliveryPartnerTitle?: string | null;
      deliveryExternalRef?: string | null;
    }
  | { type: 'CLEAR' }
  | {
      type: 'LOAD_ORDER';
      items: CartItem[];
      orderType: 'dine_in' | 'takeaway';
      tableId: number | null;
      deliveryPartnerId: string | null;
      deliveryPartnerTitle: string | null;
      deliveryExternalRef: string | null;
      orderNotes: string;
      snapshotUpdatedAt: number;
    }
  | { type: 'MARK_CLEAN' };

export interface CartTotals {
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
}

export function computeTotals(items: CartItem[]): CartTotals {
  let totalHalalas = 0;
  for (const item of items) {
    totalHalalas += item.unitPriceHalalas * item.qty;
  }
  const { vatHalalas, priceExclHalalas } = decomposeTotalVat(items);
  return {
    subtotalHalalas: priceExclHalalas,
    vatHalalas,
    totalHalalas,
  };
}

function decomposeTotalVat(items: CartItem[]): { vatHalalas: number; priceExclHalalas: number } {
  let totalIncl = 0;
  const vatRates = new Map<number, number>();

  for (const item of items) {
    const lineTotal = item.unitPriceHalalas * item.qty;
    totalIncl += lineTotal;
    vatRates.set(item.vatRateBp, (vatRates.get(item.vatRateBp) || 0) + lineTotal);
  }

  if (totalIncl === 0) {
    return { vatHalalas: 0, priceExclHalalas: 0 };
  }

  let totalExcl = 0;
  for (const [rateBp, amountIncl] of vatRates) {
    const { priceExclHalalas } = decomposeVat(amountIncl, rateBp);
    totalExcl += priceExclHalalas;
  }

  return {
    priceExclHalalas: totalExcl,
    vatHalalas: totalIncl - totalExcl,
  };
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.itemId === action.item.itemId);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.itemId === action.item.itemId ? { ...i, qty: i.qty + action.item.qty } : i,
          ),
        };
      }
      return { ...state, items: [...state.items, action.item] };
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((i) => i.itemId !== action.itemId),
      };
    case 'UPDATE_QTY': {
      if (action.qty <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.itemId !== action.itemId),
        };
      }
      return {
        ...state,
        items: state.items.map((i) => (i.itemId === action.itemId ? { ...i, qty: action.qty } : i)),
      };
    }
    case 'UPDATE_NOTES':
      return {
        ...state,
        items: state.items.map((i) =>
          i.itemId === action.itemId ? { ...i, notes: action.notes } : i,
        ),
      };
    case 'SET_ORDER_TYPE':
      return {
        ...state,
        orderType: action.orderType,
        tableId: action.tableId,
        // A partner only exists on takeaway (ADR 0007) — switching the
        // pre-create cart to dine_in clears the staged partner/ref.
        ...(action.orderType === 'dine_in'
          ? { deliveryPartnerId: null, deliveryPartnerTitle: null, deliveryExternalRef: null }
          : {}),
      };
    case 'SET_DELIVERY_PARTNER':
      return {
        ...state,
        ...(action.deliveryPartnerId !== undefined
          ? { deliveryPartnerId: action.deliveryPartnerId }
          : {}),
        ...(action.deliveryPartnerTitle !== undefined
          ? { deliveryPartnerTitle: action.deliveryPartnerTitle }
          : {}),
        ...(action.deliveryExternalRef !== undefined
          ? { deliveryExternalRef: action.deliveryExternalRef }
          : {}),
      };
    case 'SET_ORDER_NOTES':
      return {
        ...state,
        orderNotes: action.notes,
      };
    case 'CLEAR':
      return {
        ...state,
        items: [],
        snapshotItems: null,
        snapshotUpdatedAt: null,
        deliveryPartnerId: null,
        deliveryPartnerTitle: null,
        deliveryExternalRef: null,
        orderNotes: '',
      };
    case 'LOAD_ORDER':
      return {
        ...state,
        items: action.items,
        orderType: action.orderType,
        tableId: action.tableId,
        deliveryPartnerId: action.deliveryPartnerId,
        deliveryPartnerTitle: action.deliveryPartnerTitle,
        deliveryExternalRef: action.deliveryExternalRef,
        orderNotes: action.orderNotes,
        snapshotItems: action.items,
        snapshotUpdatedAt: action.snapshotUpdatedAt,
      };
    case 'MARK_CLEAN':
      return {
        ...state,
        snapshotItems: state.items,
      };
    default:
      return state;
  }
}

/**
 * Compare two cart item arrays for equality based on identity fields
 * (itemId/qty/notes — ignores orderItemId for line comparison).
 */
function cartItemsEqual(a: CartItem[], b: CartItem[]): boolean {
  if (a.length !== b.length) return false;

  const sortKey = (item: CartItem) => item.itemId;
  const sortedA = [...a].sort((x, y) => sortKey(x) - sortKey(y));
  const sortedB = [...b].sort((x, y) => sortKey(x) - sortKey(y));

  for (let i = 0; i < sortedA.length; i++) {
    if (
      sortedA[i].itemId !== sortedB[i].itemId ||
      sortedA[i].qty !== sortedB[i].qty ||
      sortedA[i].notes !== sortedB[i].notes
    ) {
      return false;
    }
  }
  return true;
}

const initialCart: CartState = {
  items: [],
  orderType: 'dine_in',
  tableId: null,
  deliveryPartnerId: null,
  deliveryPartnerTitle: null,
  deliveryExternalRef: null,
  orderNotes: '',
  snapshotItems: null,
  snapshotUpdatedAt: null,
};

export function useCart() {
  const [state, dispatch] = useReducer(cartReducer, initialCart);

  const addItem = useCallback((item: ItemResponse, qty = 1) => {
    dispatch({
      type: 'ADD_ITEM',
      item: {
        itemId: item.id,
        name: item.name,
        unitPriceHalalas: item.priceHalalas,
        vatRateBp: item.vatRateBp,
        qty,
        notes: '',
      },
    });
  }, []);

  const removeItem = useCallback((itemId: number) => {
    dispatch({ type: 'REMOVE_ITEM', itemId });
  }, []);

  const updateQty = useCallback((itemId: number, qty: number) => {
    dispatch({ type: 'UPDATE_QTY', itemId, qty });
  }, []);

  const updateNotes = useCallback((itemId: number, notes: string) => {
    dispatch({ type: 'UPDATE_NOTES', itemId, notes });
  }, []);

  const setOrderType = useCallback((orderType: 'dine_in' | 'takeaway', tableId: number | null) => {
    dispatch({ type: 'SET_ORDER_TYPE', orderType, tableId });
  }, []);

  /**
   * Stage a delivery partner selection on a pre-create cart (ADR 0007).
   * Existing open orders go through PATCH /orders/:id/partner instead.
   */
  const setDeliveryPartner = useCallback(
    (
      deliveryPartnerId: string | null,
      deliveryPartnerTitle: string | null,
      deliveryExternalRef: string | null,
    ) => {
      dispatch({
        type: 'SET_DELIVERY_PARTNER',
        deliveryPartnerId,
        deliveryPartnerTitle,
        deliveryExternalRef,
      });
    },
    [],
  );

  /** Stage only the external ref on a pre-create cart (partner already set). */
  const setDeliveryExternalRef = useCallback((deliveryExternalRef: string | null) => {
    dispatch({ type: 'SET_DELIVERY_PARTNER', deliveryExternalRef });
  }, []);

  /** Stage order-level notes (pre-create cart). Open orders PATCH immediately. */
  const setOrderNotes = useCallback((notes: string) => {
    dispatch({ type: 'SET_ORDER_NOTES', notes });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const loadOrder = useCallback((order: OrderResponse) => {
    const items: CartItem[] = (order.items || []).map((oi) => ({
      itemId: oi.itemId ?? 0,
      orderItemId: oi.id,
      name: oi.itemName,
      unitPriceHalalas: oi.unitPriceHalalas,
      vatRateBp: oi.vatRateBp,
      qty: oi.qty,
      notes: oi.notes ?? '',
    }));
    dispatch({
      type: 'LOAD_ORDER',
      items,
      orderType: order.type as 'dine_in' | 'takeaway',
      tableId: order.tableId,
      deliveryPartnerId: order.deliveryPartnerId ?? null,
      deliveryPartnerTitle: order.deliveryPartnerTitle ?? null,
      deliveryExternalRef: order.deliveryExternalRef ?? null,
      orderNotes: order.notes ?? '',
      snapshotUpdatedAt: order.updatedAt,
    });
  }, []);

  /** Whether the local cart differs from the server snapshot. */
  const isDirty = state.snapshotItems !== null && !cartItemsEqual(state.items, state.snapshotItems);

  const totals = computeTotals(state.items);

  return {
    items: state.items,
    orderType: state.orderType,
    tableId: state.tableId,
    deliveryPartnerId: state.deliveryPartnerId,
    deliveryPartnerTitle: state.deliveryPartnerTitle,
    deliveryExternalRef: state.deliveryExternalRef,
    orderNotes: state.orderNotes,
    totals,
    isDirty,
    /** Last known server updatedAt, or null if no order is loaded. */
    serverUpdatedAt: state.snapshotUpdatedAt,
    addItem,
    removeItem,
    updateQty,
    updateNotes,
    setOrderType,
    setDeliveryPartner,
    setDeliveryExternalRef,
    setOrderNotes,
    clear,
    loadOrder,
    /** Reset isDirty by accepting the current cart as new snapshot. */
    markClean: () => {
      dispatch({ type: 'MARK_CLEAN' });
    },
    /** Discard local changes: restore to snapshot. */
    discard: () => {
      if (state.snapshotItems) {
        dispatch({
          type: 'LOAD_ORDER',
          items: state.snapshotItems,
          orderType: state.orderType,
          tableId: state.tableId,
          deliveryPartnerId: state.deliveryPartnerId,
          deliveryPartnerTitle: state.deliveryPartnerTitle,
          deliveryExternalRef: state.deliveryExternalRef,
          orderNotes: state.orderNotes,
          snapshotUpdatedAt: state.snapshotUpdatedAt ?? 0,
        });
      }
    },
  };
}
