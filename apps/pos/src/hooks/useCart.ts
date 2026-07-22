import { useReducer, useCallback } from 'react';
import { decomposeVat } from '@spicyhome/shared';
import type { ItemResponse, OrderResponse } from '@spicyhome/client-ts';

export interface CartItem {
  itemId: number;
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
}

type CartAction =
  | { type: 'ADD_ITEM'; item: CartItem }
  | { type: 'REMOVE_ITEM'; itemId: number }
  | { type: 'UPDATE_QTY'; itemId: number; qty: number }
  | { type: 'UPDATE_NOTES'; itemId: number; notes: string }
  | { type: 'SET_ORDER_TYPE'; orderType: 'dine_in' | 'takeaway'; tableId: number | null }
  | { type: 'CLEAR' }
  | {
      type: 'LOAD_ORDER';
      items: CartItem[];
      orderType: 'dine_in' | 'takeaway';
      tableId: number | null;
    };

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
      return { ...state, orderType: action.orderType, tableId: action.tableId };
    case 'CLEAR':
      return { items: [], orderType: 'dine_in', tableId: null };
    case 'LOAD_ORDER':
      return { items: action.items, orderType: action.orderType, tableId: action.tableId };
    default:
      return state;
  }
}

const initialCart: CartState = { items: [], orderType: 'dine_in', tableId: null };

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

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const loadOrder = useCallback((order: OrderResponse) => {
    const items: CartItem[] = (order.items || []).map((oi) => ({
      itemId: (oi.itemId as unknown as number) || 0,
      name: oi.itemName,
      unitPriceHalalas: oi.unitPriceHalalas,
      vatRateBp: oi.vatRateBp,
      qty: oi.qty,
      notes: (oi.notes as unknown as string) || '',
    }));
    dispatch({
      type: 'LOAD_ORDER',
      items,
      orderType: order.type as 'dine_in' | 'takeaway',
      tableId: (order.tableId as unknown as number) || null,
    });
  }, []);

  const totals = computeTotals(state.items);

  return {
    items: state.items,
    orderType: state.orderType,
    tableId: state.tableId,
    totals,
    addItem,
    removeItem,
    updateQty,
    updateNotes,
    setOrderType,
    clear,
    loadOrder,
  };
}
