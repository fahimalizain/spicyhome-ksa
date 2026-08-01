import { describe, it, expect } from 'vitest';
import {
  getPrintedQtyFromEvents,
  hasUnsentKitchenDeltas,
  type KitchenEventLike,
} from '../lib/kitchen-printed';

function event(type: string, payload: unknown): KitchenEventLike {
  return { type, payload: JSON.stringify(payload) };
}

function itemAdded(orderItemId: number, kitchenPrintedQty: number): KitchenEventLike {
  return event('item_added', { orderItemId, kitchenPrintedQty });
}

function itemUpdated(orderItemId: number, kitchenPrintedQty: number): KitchenEventLike {
  return event('item_updated', { orderItemId, kitchenPrintedQty });
}

function enqueued(orderItemId: number, printedQty: number): KitchenEventLike {
  return event('kitchen_print_enqueued', {
    printer: 'Kitchen A',
    printerId: 1,
    items: [{ orderItemId, itemName: 'Burger', printedQty }],
  });
}

describe('getPrintedQtyFromEvents', () => {
  it('returns 0 for no events', () => {
    expect(getPrintedQtyFromEvents([], 5)).toBe(0);
  });

  it('legacy double-write: enqueued is authoritative, no double counting', () => {
    // Pre-ADR auto-print wrote BOTH item kitchenPrintedQty AND an enqueued
    // line in the same transaction — summing both would double-count.
    const events = [itemAdded(5, 5), enqueued(5, 5)];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(5);
  });

  it('enqueued-only: sums printedQty across multiple sends', () => {
    const events = [enqueued(5, 3), enqueued(5, 5)];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(8);
  });

  it('item-only (printer-less legacy): sums kitchenPrintedQty from item events', () => {
    const events = [itemAdded(5, 5), itemUpdated(5, 3)];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(8);
  });

  it('ADR 0006 path: item events carry 0, enqueued deltas accumulate', () => {
    const events = [itemAdded(5, 0), enqueued(5, 2), enqueued(5, 3)];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(5);
  });

  it('treats missing kitchenPrintedQty as 0', () => {
    expect(getPrintedQtyFromEvents([event('item_added', { orderItemId: 5 })], 5)).toBe(0);
  });

  it('separates quantities per order item id', () => {
    const events = [itemAdded(5, 5), itemAdded(99, 10)];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(5);
    expect(getPrintedQtyFromEvents(events, 99)).toBe(10);
  });

  it('falls back to item events when enqueued mentions only other items', () => {
    const events = [itemAdded(5, 5), enqueued(99, 7)];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(5);
    expect(getPrintedQtyFromEvents(events, 99)).toBe(7);
  });

  it('ignores non-print event types (item_removed, payment_added)', () => {
    const events = [
      itemAdded(5, 5),
      event('item_removed', { orderItemId: 5, kitchenPrintedQty: 999 }),
      event('payment_added', { paymentId: 1, amountHalalas: 100 }),
    ];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(5);
  });

  it('treats malformed JSON payloads as 0', () => {
    const events: KitchenEventLike[] = [
      { type: 'item_added', payload: 'not-json' },
      { type: 'kitchen_print_enqueued', payload: '{broken' },
    ];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(0);
  });

  it('treats enqueued payload without items array as 0 and allows item fallback', () => {
    const events = [
      itemAdded(5, 5),
      event('kitchen_print_enqueued', { printer: 'A', printerId: 1 }),
    ];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(5);
  });

  it('ignores malformed entries in the enqueued items array', () => {
    const events = [
      event('kitchen_print_enqueued', {
        printer: 'A',
        printerId: 1,
        items: [{ orderItemId: 5, itemName: 'x', printedQty: 'nope' }],
      }),
    ];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(0);
  });

  it('enqueued events for the item block the item-event fallback entirely', () => {
    // Enqueued exists but carries 0 for this item (e.g. malformed): the
    // enqueued branch is still authoritative — no fallback to items.
    const events = [
      itemAdded(5, 7),
      event('kitchen_print_enqueued', {
        printer: 'A',
        printerId: 1,
        items: [{ orderItemId: 5, itemName: 'x', printedQty: 0 }],
      }),
    ];
    expect(getPrintedQtyFromEvents(events, 5)).toBe(0);
  });
});

describe('hasUnsentKitchenDeltas', () => {
  it('false with no items', () => {
    expect(hasUnsentKitchenDeltas([], [])).toBe(false);
  });

  it('true when qty above printed (enqueued ledger)', () => {
    const events = [enqueued(101, 1)];
    expect(hasUnsentKitchenDeltas([{ orderItemId: 101, qty: 2 }], events)).toBe(true);
  });

  it('false when qty equals printed', () => {
    const events = [enqueued(101, 2)];
    expect(hasUnsentKitchenDeltas([{ orderItemId: 101, qty: 2 }], events)).toBe(false);
  });

  it('true when qty above printed (legacy item-only ledger)', () => {
    const events = [itemAdded(101, 1)];
    expect(hasUnsentKitchenDeltas([{ orderItemId: 101, qty: 2 }], events)).toBe(true);
  });

  it('true across multiple sends (multi-send accumulation)', () => {
    const events = [enqueued(101, 2), enqueued(101, 2)];
    expect(hasUnsentKitchenDeltas([{ orderItemId: 101, qty: 5 }], events)).toBe(true);
    expect(hasUnsentKitchenDeltas([{ orderItemId: 101, qty: 4 }], events)).toBe(false);
  });

  it('ignores items without orderItemId (pre-create staging / unsaved lines)', () => {
    // The helper signature only accepts orderItemId/qty — an unsaved line
    // simply has no orderItemId, so it can never be an unsent kitchen delta.
    expect(hasUnsentKitchenDeltas([{ qty: 3 }], [])).toBe(false);
  });

  it('true when ANY item has deltas', () => {
    const events = [enqueued(101, 1), enqueued(102, 5)];
    const items = [
      { orderItemId: 101, qty: 1 },
      { orderItemId: 102, qty: 6 },
    ];
    expect(hasUnsentKitchenDeltas(items, events)).toBe(true);
  });

  it('false when all items are caught up', () => {
    const events = [enqueued(101, 2), enqueued(102, 5)];
    const items = [
      { orderItemId: 101, qty: 2 },
      { orderItemId: 102, qty: 5 },
    ];
    expect(hasUnsentKitchenDeltas(items, events)).toBe(false);
  });
});
