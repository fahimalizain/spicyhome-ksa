import { useState } from 'react';
import { client } from '../../api';
import { OskDock } from '../on-screen-keyboard/OskDock';

interface OrderVoidModalProps {
  orderId: number;
  /** Optional display context, e.g. the order document id ("Order INV26-0042"). */
  orderLabel?: string;
  /** Called after a successful void — the parent updates local status to voided. */
  onVoided: () => void;
  onClose: () => void;
}

/**
 * OrderVoidModal — collect the REQUIRED free-text reason before voiding
 * (#153, slice 3).
 *
 * Mirrors the StandardInvoiceBuyerModal pattern: the card root carries
 * `data-osk-scope` and an <OskDock size="md" /> sits under the textarea so
 * the full QWERTY keyboard docks inside the modal instead of covering the
 * action buttons. The modal owns the API call + loading/error; the parent
 * only flips local status on success (via onVoided).
 */
export function OrderVoidModal({ orderId, orderLabel, onVoided, onClose }: OrderVoidModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canConfirm = reason.trim().length > 0 && !submitting;

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    setError('');
    try {
      await client.orders.void(orderId, { reason: reason.trim() });
      onVoided();
    } catch (e: any) {
      // e.g. the net-zero payments guard — the message must surface so the
      // cashier knows why the void was rejected.
      setError(e.message || 'Failed to void order');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div
        data-osk-scope
        className="bg-gray-900 rounded-xl p-4 w-[630px] max-w-[90vw] max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-bold text-white mb-1">Void Order</h2>
        {orderLabel && <p className="text-xs text-gray-400 mb-2">{orderLabel}</p>}
        <p className="text-sm text-red-400 mb-3">Voiding is permanent and cannot be undone.</p>

        <label className="block text-xs text-gray-500 mb-1">Reason (required)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          autoFocus
          disabled={submitting}
          aria-label="Void reason"
          placeholder="Why is this order being voided?"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-red-500 resize-none"
        />
        <div className="text-right text-xs text-gray-500 mt-0.5">{reason.length}/500</div>

        {/* Inline keyboard dock: the full QWERTY OSK portals in here while the
            textarea is focused, so it grows the modal instead of covering the
            Cancel/Void row. Zero footprint otherwise. */}
        <OskDock size="md" className="mt-3" />

        {error && <div className="text-red-400 text-sm mt-3">{error}</div>}

        {/* Cancel / Void */}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 touch-target bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm text-gray-300 py-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 touch-target bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
          >
            {submitting ? 'Voiding...' : 'Void Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
