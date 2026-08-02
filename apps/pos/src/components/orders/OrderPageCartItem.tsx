import { halalasToSar } from '@spicyhome/shared';
import type { CartItem } from '../../hooks/useCart';

export interface OrderPageCartItemProps {
  item: CartItem;
  /** Whether this row's edit controls are expanded. Controlled by the parent list. */
  expanded: boolean;
  /** Called when the row header is tapped (expand/collapse toggle). */
  onToggle: () => void;
  /** When true, hide all edit controls (paid/voided order or no update permission). */
  readonly: boolean;
  /** Disable interactive controls while loading/syncing. */
  disabled: boolean;
  /** Whether the remove (✕) button is allowed. */
  canRemove: boolean;
  onUpdateQty: (item: CartItem, newQty: number) => void;
  onRemove: (item: CartItem) => void;
  onEditNotes: (item: CartItem) => void;
}

/**
 * One cart row on the Order Page.
 *
 * Collapsed by default: shows item name, qty badge, unit rate (`@15.00`),
 * line total and a truncated notes preview. The notes preview lives INSIDE
 * the header button, so tapping it also expands the row. Tapping the header
 * expands the row to reveal the qty +/-, notes pencil and remove controls
 * (only when not `readonly`).
 *
 * The expand state is fully controlled (`expanded` + `onToggle`) so the
 * parent list can enforce a single-row accordion. When editable, the controls
 * stay mounted while collapsed (so max-height/opacity can animate closed) but
 * are hidden from the a11y tree and disabled, so they can never be activated
 * mid-collapse.
 *
 * Presentational only — all cart logic (handlers, gating) lives on OrderPage.
 */
export function OrderPageCartItem({
  item,
  expanded,
  onToggle,
  readonly,
  disabled,
  canRemove,
  onUpdateQty,
  onRemove,
  onEditNotes,
}: OrderPageCartItemProps) {
  const unitRate = halalasToSar(item.unitPriceHalalas);
  const lineTotal = halalasToSar(item.unitPriceHalalas * item.qty);
  const hasNotes = item.notes.length > 0;

  return (
    <div className="bg-gray-800 rounded-lg px-2 py-1.5">
      {/*
        Header — tap toggles collapse/expand. The edit controls live OUTSIDE
        this button (sibling), so their clicks can never toggle the row.
        Row 1: name (truncated) | qty badge | unit rate | line total.
        Row 2: notes preview — inside the button so tapping it also toggles.
      */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.name}`}
        className="min-h-[2em] w-full flex flex-col rounded text-left select-none py-0"
      >
        <span className="flex w-full items-center gap-1.5 min-h-[2em]">
          <span className="text-sm text-white flex-1 min-w-0 truncate">{item.name}</span>
          {!expanded && (
            <span className="text-xs text-gray-300 bg-gray-700 rounded px-1.5 py-0.5 shrink-0">
              ×{item.qty}
            </span>
          )}
          <span className="text-xs text-gray-500 shrink-0 tabular-nums">@{unitRate}</span>
          <span className="text-xs text-gray-300 shrink-0 tabular-nums">{lineTotal}</span>
        </span>

        {hasNotes && (
          <span
            className={`text-xs text-gray-400 block w-full ${expanded ? 'break-words' : 'truncate'}`}
          >
            {item.notes}
          </span>
        )}
      </button>

      {/*
        Edit controls — always mounted when editable so the collapse can
        animate out (max-height + opacity). While collapsed the panel is
        hidden from the a11y tree (`aria-hidden`) and the buttons are
        disabled + pointer-events-none, so they can't be activated mid-anim.
      */}
      {!readonly && (
        <div
          data-testid="cart-item-controls-panel"
          className={
            'overflow-hidden transition-[max-height,opacity] duration-200 ease-out ' +
            (expanded ? 'max-h-28 opacity-100' : 'max-h-0 opacity-0')
          }
          aria-hidden={!expanded}
        >
          <div className={`flex items-center gap-1 mt-2 ${expanded ? '' : 'pointer-events-none'}`}>
            <button
              type="button"
              onClick={() => onUpdateQty(item, item.qty - 1)}
              disabled={disabled || !expanded}
              className="touch-target w-7 h-7 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm text-white"
            >
              -
            </button>
            <span className="text-sm text-gray-300 w-7 text-center">{item.qty}</span>
            <button
              type="button"
              onClick={() => onUpdateQty(item, item.qty + 1)}
              disabled={disabled || !expanded}
              className="touch-target w-7 h-7 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm text-white"
            >
              +
            </button>
            {/* Item notes editor — touch-friendly pencil */}
            <button
              type="button"
              onClick={() => onEditNotes(item)}
              disabled={disabled || !expanded}
              title={hasNotes ? 'Edit notes' : 'Add notes'}
              className="touch-target w-7 h-7 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-xs text-gray-300"
            >
              ✎
            </button>
            {canRemove && (
              <button
                type="button"
                onClick={() => onRemove(item)}
                disabled={disabled || !expanded}
                className="touch-target w-7 h-7 bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded text-xs text-white ml-auto"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
