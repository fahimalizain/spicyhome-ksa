import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { halalasToSar } from '@spicyhome/shared';
import { OrderPageCartItem } from '../components/orders/OrderPageCartItem';
import type { CartItem } from '../hooks/useCart';

const baseItem: CartItem = {
  itemId: 1,
  orderItemId: 10,
  name: 'Burger',
  unitPriceHalalas: 1500,
  vatRateBp: 1500,
  qty: 2,
  notes: '',
};

type Overrides = Partial<{
  item: CartItem;
  /** Initial expanded state of the stateful harness. */
  initialExpanded: boolean;
  readonly: boolean;
  disabled: boolean;
  canRemove: boolean;
  onUpdateQty: (item: CartItem, newQty: number) => void;
  onRemove: (item: CartItem) => void;
  onEditNotes: (item: CartItem) => void;
}>;

/**
 * Stateful harness — mirrors how OrderPageItems drives the component
 * (flipping `expanded` in response to `onToggle`).
 */
function Harness({
  item = baseItem,
  initialExpanded = false,
  readonly = false,
  disabled = false,
  canRemove = true,
  onUpdateQty,
  onRemove,
  onEditNotes,
}: Overrides = {}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  return (
    <OrderPageCartItem
      item={item}
      expanded={expanded}
      onToggle={() => setExpanded((prev) => !prev)}
      readonly={readonly}
      disabled={disabled}
      canRemove={canRemove}
      onUpdateQty={onUpdateQty ?? (() => {})}
      onRemove={onRemove ?? (() => {})}
      onEditNotes={onEditNotes ?? (() => {})}
    />
  );
}

function renderItem(overrides: Overrides = {}) {
  const onUpdateQty = vi.fn();
  const onRemove = vi.fn();
  const onEditNotes = vi.fn();
  const utils = render(
    <Harness
      onUpdateQty={onUpdateQty}
      onRemove={onRemove}
      onEditNotes={onEditNotes}
      {...overrides}
    />,
  );
  return { ...utils, onUpdateQty, onRemove, onEditNotes };
}

function expandRow() {
  fireEvent.click(screen.getByRole('button', { name: 'Expand Burger' }));
}

/** Edit-control buttons rendered inside the expanded controls row. */
const controlNames = ['-', '+', '✎', '✕'] as const;

function expectControlsHidden(names: readonly string[] = controlNames) {
  for (const name of names) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
}

function expectControlsVisible(names: readonly string[] = controlNames) {
  for (const name of names) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  }
}

describe('OrderPageCartItem', () => {
  // ── Test 1: Renders collapsed by default ──
  it('renders collapsed by default: name, qty badge, unit rate, line total, no controls', () => {
    renderItem();

    expect(screen.getByText('Burger')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
    // Unit rate AND line total are both visible while collapsed
    expect(screen.getByText(`@${halalasToSar(1500)}`)).toBeInTheDocument();
    expect(screen.getByText(halalasToSar(1500 * 2))).toBeInTheDocument();

    // Collapsed state: no edit controls
    expectControlsHidden();

    // Toggle is an expand button
    const toggle = screen.getByRole('button', { name: 'Expand Burger' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  // ── Test 1b: Unit rate uses integer halalas math for the line total ──
  it('line total is unit price × qty in integer halalas', () => {
    renderItem({ item: { ...baseItem, qty: 3 } });

    expect(screen.getByText(`@${halalasToSar(1500)}`)).toBeInTheDocument();
    expect(screen.getByText(halalasToSar(1500 * 3))).toBeInTheDocument();
  });

  // ── Test 2: Shows notes preview when notes present (collapsed) ──
  it('shows notes preview when notes are present, while collapsed', () => {
    renderItem({ item: { ...baseItem, notes: 'no onion' } });

    expect(screen.getByText('no onion')).toBeInTheDocument();
    // Still collapsed
    expect(screen.getByRole('button', { name: 'Expand Burger' })).toBeInTheDocument();
  });

  // ── Test 2b: Notes preview lives inside the header button, so tapping the
  //    notes text itself toggles expand/collapse ──
  it('clicking the notes preview expands the row (notes are inside the toggle)', () => {
    renderItem({ item: { ...baseItem, notes: 'no onion' } });

    fireEvent.click(screen.getByText('no onion'));

    expect(screen.getByRole('button', { name: 'Collapse Burger' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expectControlsVisible();
  });

  // ── Test 3: Hides notes line when notes empty ──
  it('does not render a notes line when notes are empty', () => {
    renderItem({ item: { ...baseItem, notes: '' } });

    expect(screen.queryByText('no onion')).not.toBeInTheDocument();
  });

  // ── Test 4: Expand reveals controls when editable ──
  it('expanding reveals qty/notes/remove controls when editable', () => {
    renderItem();
    expandRow();

    const toggle = screen.getByRole('button', { name: 'Collapse Burger' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expectControlsVisible();
    // Centered qty number next to the +/− buttons
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // ── Test 4b: Expanded rows hide the header qty badge ──
  it('expanded: header qty badge is hidden, control-row qty still visible', () => {
    renderItem();
    expandRow();

    expect(screen.queryByText('×2')).not.toBeInTheDocument();
    // Control-row qty (centered between − and +) is still present
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // ── Test 5: Collapse again hides controls ──
  it('collapsing again hides the edit controls', () => {
    renderItem();
    expandRow();
    expectControlsVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Burger' }));

    expect(screen.getByRole('button', { name: 'Expand Burger' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expectControlsHidden();
  });

  // ── Test 5b: Controls stay mounted while collapsed (for the exit
  //    animation) but are non-interactive and hidden from the a11y tree ──
  it('collapsed: controls stay mounted but hidden, disabled and not pointer-interactive', () => {
    renderItem();

    const panel = screen.getByTestId('cart-item-controls-panel');
    // Collapsed: max-height 0, invisible, excluded from the a11y tree
    expect(panel).toHaveClass('max-h-0', 'opacity-0');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    // Buttons are still in the DOM (with hidden: true) and cannot be activated
    const plus = screen.getByRole('button', { name: '+', hidden: true });
    expect(plus).toBeDisabled();

    // Expand: panel opens (transition targets) and buttons become interactive
    expandRow();
    expect(panel).toHaveClass('max-h-28', 'opacity-100');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByRole('button', { name: '+' })).toBeEnabled();
  });

  // ── Test 6: Readonly: expand does not show controls ──
  it('readonly rows never show edit controls, even when expanded', () => {
    renderItem({ readonly: true });
    expandRow();

    expect(screen.getByRole('button', { name: 'Collapse Burger' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expectControlsHidden();
    // Readonly: no controls panel at all
    expect(screen.queryByTestId('cart-item-controls-panel')).not.toBeInTheDocument();
  });

  // ── Test 7: canRemove=false hides remove only ──
  it('canRemove=false hides only the remove (✕) button', () => {
    renderItem({ canRemove: false });
    expandRow();

    expectControlsVisible(['-', '+', '✎']);
    expect(screen.queryByRole('button', { name: '✕' })).not.toBeInTheDocument();
  });

  // ── Test 8: Control callbacks fire ──
  it('calls onUpdateQty with qty+1 when + is clicked', () => {
    const { onUpdateQty } = renderItem();
    expandRow();

    fireEvent.click(screen.getByRole('button', { name: '+' }));

    expect(onUpdateQty).toHaveBeenCalledTimes(1);
    expect(onUpdateQty).toHaveBeenCalledWith(baseItem, 3);
  });

  it('calls onUpdateQty with qty-1 when - is clicked', () => {
    const { onUpdateQty } = renderItem();
    expandRow();

    fireEvent.click(screen.getByRole('button', { name: '-' }));

    expect(onUpdateQty).toHaveBeenCalledTimes(1);
    expect(onUpdateQty).toHaveBeenCalledWith(baseItem, 1);
  });

  it('calls onEditNotes with the item when ✎ is clicked', () => {
    const { onEditNotes } = renderItem();
    expandRow();

    fireEvent.click(screen.getByRole('button', { name: '✎' }));

    expect(onEditNotes).toHaveBeenCalledTimes(1);
    expect(onEditNotes).toHaveBeenCalledWith(baseItem);
  });

  it('calls onRemove with the item when ✕ is clicked', () => {
    const { onRemove } = renderItem();
    expandRow();

    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(baseItem);
  });

  // ── Test 9: disabled disables controls ──
  it('disabled disables all edit controls', () => {
    renderItem({ disabled: true });
    expandRow();

    for (const name of controlNames) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});
