import { useState } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../../api';
import { sarDisplayToHalalas } from './add-payment-modal-logic';
import type { OrderResponse } from '@spicyhome/client-ts';

/**
 * One order line shown in the partner price modal (ADR 0007, Phase 7).
 * `orderItemId` is `order_items.id` (the line id); `itemId` is the catalog
 * item id (null for legacy/orphan lines that cannot be overridden).
 */
export interface PartnerPriceLine {
  orderItemId: number;
  itemId: number | null;
  name: string;
  unitPriceHalalas: number;
  qty: number;
}

interface PartnerPriceModalProps {
  orderId: number;
  /** cart.serverUpdatedAt — last known orders.updated_at (409 guard). */
  baseUpdatedAt: number;
  /** Server-hydrated cart lines (cart must be clean to open this modal). */
  items: PartnerPriceLine[];
  /**
   * Live catalog floor by item id (full menu list incl. inactive items —
   * the server floor applies even to inactive items, ADR 0007).
   */
  floorByItemId: Record<number, number>;
  partnerTitle: string | null;
  /** Called with the final OrderResponse after the last sequential PATCH. */
  onSaved: (order: OrderResponse) => void;
  onClose: () => void;
}

interface LineValidation {
  /** Parsed halalas; null when the draft is invalid/unchanged-empty. */
  halalas: number | null;
  error: string | null;
  /** Whether the parsed value differs from the current line price. */
  changed: boolean;
  floor: number;
}

const SAR_INPUT_RE = /^\d+(\.\d{0,2})?$/;

function validateLine(
  draft: string,
  line: PartnerPriceLine,
  floorByItemId: Record<number, number>,
): LineValidation {
  // Floor = live catalog price; when the catalog row is unknown (menu not
  // fully loaded), fall back to the current price so the modal never blocks
  // on client-side data the server enforces anyway.
  const floor = line.itemId != null ? (floorByItemId[line.itemId] ?? line.unitPriceHalalas) : 0;
  const trimmed = draft.trim();
  if (trimmed === '' || trimmed === '.') {
    return { halalas: null, error: 'Enter a price', changed: false, floor };
  }
  if (!SAR_INPUT_RE.test(trimmed)) {
    return { halalas: null, error: 'Invalid price (max 2 decimals)', changed: false, floor };
  }
  const halalas = sarDisplayToHalalas(trimmed);
  if (halalas < floor) {
    return {
      halalas,
      error: `Below minimum of ${halalasToSar(floor)} SAR`,
      changed: halalas !== line.unitPriceHalalas,
      floor,
    };
  }
  return {
    halalas,
    error: null,
    changed: halalas !== line.unitPriceHalalas,
    floor,
  };
}

/**
 * "Edit partner prices" modal (ADR 0007): per-line unit-price override for
 * delivery-partner orders. Cashiers type SAR decimals (converted to halalas
 * via the house sarDisplayToHalalas helper); every line is floored at the
 * live catalog price client-side, and the server enforces the same floor.
 *
 * Save runs one PATCH per changed line, sequentially, threading the
 * returned `updatedAt` as the next `baseUpdatedAt` (ADR is per-line — no
 * batch endpoint). Unchanged lines are skipped (server would no-op anyway).
 */
export function PartnerPriceModal({
  orderId,
  baseUpdatedAt,
  items,
  floorByItemId,
  partnerTitle,
  onSaved,
  onClose,
}: PartnerPriceModalProps) {
  const [drafts, setDrafts] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const line of items) {
      init[line.orderItemId] = halalasToSar(line.unitPriceHalalas);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const validations: Record<number, LineValidation> = {};
  for (const line of items) {
    validations[line.orderItemId] = validateLine(
      drafts[line.orderItemId] ?? '',
      line,
      floorByItemId,
    );
  }

  const changedLines = items.filter((line) => {
    const v = validations[line.orderItemId];
    return v.changed && v.halalas !== null;
  });
  const hasInvalidChanged = changedLines.some(
    (line) => validations[line.orderItemId].error != null,
  );
  const canSave = !saving && changedLines.length > 0 && !hasInvalidChanged;

  function setDraft(orderItemId: number, value: string) {
    setDrafts((prev) => ({ ...prev, [orderItemId]: value }));
    if (error) setError('');
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      let currentBase = baseUpdatedAt;
      let lastOrder: OrderResponse | null = null;
      for (const line of changedLines) {
        const halalas = validations[line.orderItemId].halalas!;
        const res = await client.orders.updateItemUnitPrice(orderId, line.orderItemId, {
          baseUpdatedAt: currentBase,
          unitPriceHalalas: halalas,
        });
        lastOrder = res;
        currentBase = res.updatedAt;
      }
      if (lastOrder) onSaved(lastOrder);
      onClose();
    } catch (e: any) {
      // Server 400 (floor raised, unknown line, etc.) or 409 (stale) —
      // surface the message and keep the drafts so the cashier can adjust.
      setError(e.message || 'Failed to save price changes');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-xl p-4 w-[560px] max-w-[92vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">Edit Partner Prices</h2>
          {partnerTitle && <span className="text-xs text-gray-400">{partnerTitle}</span>}
        </div>

        <div className="text-xs text-gray-500 mb-3 shrink-0">
          App-menu prices per line. Prices are floored at the POS catalog price.
        </div>

        {/* Line list — the only scrolling region */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-1 space-y-2">
          {items.map((line) => {
            const v = validations[line.orderItemId];
            const overridable = line.itemId != null;
            return (
              <div
                key={line.orderItemId}
                className="bg-gray-800 rounded-lg p-3"
                data-testid={`price-line-${line.orderItemId}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-white font-medium truncate">{line.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    ×{line.qty} · {halalasToSar(line.unitPriceHalalas)} SAR each
                  </span>
                </div>

                {!overridable ? (
                  <div className="text-xs text-gray-500 mt-2">
                    Catalog item missing — price cannot be overridden.
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={drafts[line.orderItemId] ?? ''}
                        onChange={(e) => setDraft(line.orderItemId, e.target.value)}
                        disabled={saving}
                        aria-label={`New price for ${line.name}`}
                        className="w-36 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xl text-white text-center font-mono focus:outline-none focus:border-brand-500 disabled:opacity-50"
                      />
                      <span className="text-sm text-gray-400">SAR</span>
                      <span className="text-xs text-gray-500 ml-auto">
                        Min {halalasToSar(v.floor)} SAR
                      </span>
                    </div>
                    {v.error && v.changed && (
                      <div className="text-xs text-red-400 mt-1">{v.error}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="shrink-0 text-red-400 text-sm mt-3" data-testid="price-save-error">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 touch-target bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm text-gray-300 py-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 touch-target bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
