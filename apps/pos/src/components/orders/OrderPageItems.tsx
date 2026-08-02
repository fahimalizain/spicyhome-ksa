import { useEffect, useState } from 'react';
import type { CartItem } from '../../hooks/useCart';
import { OrderPageCartItem } from './OrderPageCartItem';

export type OrderPageItemsProps = {
  items: CartItem[];
  /** Passed through to every row: hide edit controls (paid/voided order, no update permission). */
  readonly: boolean;
  /** Passed through to every row: disable interactive controls while loading/syncing. */
  disabled: boolean;
  /** Passed through to every row: whether the remove (✕) button is allowed. */
  canRemove: boolean;
  /** Called with the new qty when a row's +/− is tapped. Optional: readonly
   *  consumers (e.g. the Orders detail panel) omit it and rows stay
   *  read-only. */
  onUpdateQty?: (item: CartItem, newQty: number) => void;
  /** Called when a row's remove (✕) button is tapped. Optional for readonly reuse. */
  onRemove?: (item: CartItem) => void;
  /** Called when a row's notes pencil (✎) is tapped. Optional for readonly reuse. */
  onEditNotes?: (item: CartItem) => void;
  /** Empty list copy. Default: "Cart is empty". */
  emptyMessage?: string;
};

/**
 * Stable row key, mirroring the keys the Order Page used when mapping cart
 * rows directly. Pre-create items (no `orderItemId` yet) fall back to the
 * menu item id + position; if the order of pre-create rows shifts, keys can
 * drift — accepted, same as before.
 */
function cartItemKey(item: CartItem, idx: number): string {
  return item.orderItemId != null ? `oi-${item.orderItemId}` : `mi-${item.itemId}-${idx}`;
}

/**
 * The cart item list on the Order Page's Items tab.
 *
 * Owns the empty state, the list container and the accordion state: at most
 * one row is expanded at a time (`expandedKey`). Toggling an expanded row
 * collapses it; expanding any other row collapses the previous one. If the
 * expanded item disappears from the list (e.g. removed, order replaced), the
 * expansion is cleared via a small effect.
 */
export function OrderPageItems({
  items,
  readonly,
  disabled,
  canRemove,
  onUpdateQty,
  onRemove,
  onEditNotes,
  emptyMessage = 'Cart is empty',
}: OrderPageItemsProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // If the expanded row disappears from the list, collapse back to none.
  useEffect(() => {
    if (expandedKey == null) return;
    const stillThere = items.some((item, idx) => cartItemKey(item, idx) === expandedKey);
    if (!stillThere) setExpandedKey(null);
  }, [items, expandedKey]);

  if (items.length === 0) {
    return <div className="text-sm text-gray-500 text-center mt-8">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const key = cartItemKey(item, idx);
        return (
          <OrderPageCartItem
            key={key}
            item={item}
            expanded={expandedKey === key}
            onToggle={() => setExpandedKey((prev) => (prev === key ? null : key))}
            readonly={readonly}
            disabled={disabled}
            canRemove={canRemove}
            onUpdateQty={onUpdateQty ?? (() => {})}
            onRemove={onRemove ?? (() => {})}
            onEditNotes={onEditNotes ?? (() => {})}
          />
        );
      })}
    </div>
  );
}
