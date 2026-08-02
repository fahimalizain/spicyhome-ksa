import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { halalasToSar } from '@spicyhome/shared';
import { OrderPageItems, type OrderPageItemsProps } from '../components/orders/OrderPageItems';
import type { CartItem } from '../hooks/useCart';

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    itemId: 1,
    orderItemId: 1,
    name: 'Burger',
    unitPriceHalalas: 1500,
    vatRateBp: 1500,
    qty: 2,
    notes: '',
    ...overrides,
  };
}

const burger = makeItem();
const fries = makeItem({
  itemId: 2,
  orderItemId: 2,
  name: 'Fries',
  unitPriceHalalas: 800,
  qty: 1,
});

function renderItems(items: CartItem[], overrides: Partial<OrderPageItemsProps> = {}) {
  const onUpdateQty = vi.fn();
  const onRemove = vi.fn();
  const onEditNotes = vi.fn();
  const makeElement = (list: CartItem[]) => (
    <OrderPageItems
      items={list}
      readonly={false}
      disabled={false}
      canRemove={true}
      onUpdateQty={onUpdateQty}
      onRemove={onRemove}
      onEditNotes={onEditNotes}
      {...overrides}
    />
  );
  const utils = render(makeElement(items));
  return { ...utils, makeElement, onUpdateQty, onRemove, onEditNotes };
}

describe('OrderPageItems', () => {
  // ── Test 1: Empty state ──
  it('renders the empty state when there are no items', () => {
    renderItems([]);

    expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Expand|Collapse/ })).not.toBeInTheDocument();
  });

  // ── Test 2: All rows collapsed, unit rate + line total visible ──
  it('renders multiple items collapsed with unit rate and line total', () => {
    renderItems([burger, fries]);

    expect(screen.getByText('Burger')).toBeInTheDocument();
    expect(screen.getByText('Fries')).toBeInTheDocument();
    expect(screen.getByText('@15.00')).toBeInTheDocument();
    expect(screen.getByText('@8.00')).toBeInTheDocument();
    expect(screen.getByText(halalasToSar(1500 * 2))).toBeInTheDocument(); // 30.00
    expect(screen.getByText(halalasToSar(800 * 1))).toBeInTheDocument(); // 8.00

    // All collapsed — no visible edit controls
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
  });

  // ── Test 3: Accordion — only one row expanded at a time ──
  it('expanding a second row collapses the first (only one expanded)', () => {
    renderItems([burger, fries]);

    // Expand Burger
    fireEvent.click(screen.getByRole('button', { name: 'Expand Burger' }));
    expect(screen.getByRole('button', { name: 'Collapse Burger' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Expand Fries' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    // Expand Fries → Burger collapses
    fireEvent.click(screen.getByRole('button', { name: 'Expand Fries' }));
    expect(screen.getByRole('button', { name: 'Collapse Fries' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Expand Burger' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // Exactly one set of visible controls (the Fries row)
    expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✕' })).toBeInTheDocument();
  });

  // ── Test 4: Toggling the expanded row collapses it ──
  it('toggling the expanded row collapses it', () => {
    renderItems([burger, fries]);

    fireEvent.click(screen.getByRole('button', { name: 'Expand Burger' }));
    expect(screen.getByRole('button', { name: 'Collapse Burger' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Burger' }));
    expect(screen.getByRole('button', { name: 'Expand Burger' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
  });

  // ── Test 5: Callbacks wired through to the expanded row ──
  it('wires onUpdateQty from the expanded row to the parent handler', () => {
    const { onUpdateQty } = renderItems([burger, fries]);

    fireEvent.click(screen.getByRole('button', { name: 'Expand Burger' }));
    fireEvent.click(screen.getByRole('button', { name: '+' }));

    expect(onUpdateQty).toHaveBeenCalledTimes(1);
    expect(onUpdateQty).toHaveBeenCalledWith(burger, 3);
  });

  // ── Test 6: Expansion cleared when the expanded item disappears ──
  it('clears expansion when the expanded item is removed from the list', () => {
    const { makeElement, rerender } = renderItems([burger, fries]);

    fireEvent.click(screen.getByRole('button', { name: 'Expand Burger' }));
    expect(screen.getByRole('button', { name: 'Collapse Burger' })).toBeInTheDocument();

    // Burger disappears (e.g. removed / order replaced) → empty state
    rerender(makeElement([]));
    expect(screen.getByText('Cart is empty')).toBeInTheDocument();

    // New list renders fully collapsed — expansion state was reset
    rerender(makeElement([fries]));
    expect(screen.getByRole('button', { name: 'Expand Fries' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
  });

  // ── Test 7: readonly passes through — expanded rows still show no controls ──
  it('readonly rows show no controls even when expanded', () => {
    renderItems([burger], { readonly: true });

    fireEvent.click(screen.getByRole('button', { name: 'Expand Burger' }));
    expect(screen.getByRole('button', { name: 'Collapse Burger' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-item-controls-panel')).not.toBeInTheDocument();
  });
});
