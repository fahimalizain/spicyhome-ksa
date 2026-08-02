import { useState, useEffect, useRef } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../../api';
import {
  amountPrefillFromOutstanding,
  buildAddPaymentDraft,
  calcCashChange,
  canConfirmAddPayment,
  filterMethodsForOrder,
  signedAmountHalalas,
  tenderedToHalalas,
  type AddPaymentDraft,
  type PaymentMethod,
} from './add-payment-modal-logic';
import type { OrderResponse } from '@spicyhome/client-ts';
import { OskDock } from '../on-screen-keyboard/OskDock';

interface AddPaymentModalProps {
  orderId: number;
  /** Server order total from the last hydration (context display). */
  orderTotalHalalas: number;
  /** Outstanding from server totals minus server payments. */
  outstandingHalalas: number;
  /**
   * ADR 0007: delivery partner linked to this order (null for walk-in /
   * dine-in). Restricts the visible methods to the partner's own method.
   */
  deliveryPartnerId: string | null;
  /** Called with the returned OrderResponse — parent hydrates and closes. */
  onAdded: (order: OrderResponse) => void;
  onClose: () => void;
}

/**
 * Append ONE payment line (ADR 0006). No finalize, no submit — the order
 * stays `open`. Supports negative correction lines via the sign toggle and
 * temporary overpay (amount is never clamped to outstanding).
 */
export function AddPaymentModal({
  orderId,
  orderTotalHalalas,
  outstandingHalalas,
  deliveryPartnerId,
  onAdded,
  onClose,
}: AddPaymentModalProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [sign, setSign] = useState<1 | -1>(1);
  const [tenderedInput, setTenderedInput] = useState('');
  // Amount input is a real focusable input; the global on-screen keyboard
  // drives it (numpad layout when enabled).
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMethods();
    // mount-only
  }, []);

  async function loadMethods() {
    setLoading(true);
    try {
      const res = await client.paymentMethods.listEnabled();
      // ADR 0007: restrict the visible methods for delivery partner orders.
      const visible = filterMethodsForOrder(res, deliveryPartnerId);
      setMethods(visible);
      // No auto-select: the cashier picks a method explicitly, even when only
      // one method is visible (ADR 0007 partner orders still require one tap).
    } catch {
      setError('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }

  const amountHalalas = signedAmountHalalas(amountInput, sign);
  const isCashSelected = selectedMethodId === 'cash';
  // Tendered only on positive cash lines
  const showTendered = isCashSelected && amountHalalas > 0;

  // After a method is picked, focus the amount input so the global OSK
  // (numpad layout for inputMode=decimal) appears when enabled.
  useEffect(() => {
    if (selectedMethodId) {
      amountRef.current?.focus();
    }
  }, [selectedMethodId]);

  const tenderedHalalas = tenderedToHalalas(tenderedInput);
  const changeDue = showTendered ? calcCashChange(amountHalalas, tenderedHalalas) : 0;
  const draft: AddPaymentDraft | null = buildAddPaymentDraft({
    methodId: selectedMethodId,
    amountInput,
    sign,
    tenderedInput,
  });
  const canConfirm = canConfirmAddPayment(draft, submitting);

  function handleSign(next: 1 | -1) {
    setSign(next);
    if (next === -1) setTenderedInput(''); // negative lines carry no tendered
  }

  /**
   * Pick a payment method: select it and prefill the amount from the order's
   * outstanding balance (sign-aware). Switching methods re-applies the prefill
   * and clears cash tendered, which never carries over between methods.
   */
  function handleMethodSelect(m: PaymentMethod) {
    const prefill = amountPrefillFromOutstanding(outstandingHalalas);
    setSelectedMethodId(m.id);
    setAmountInput(prefill.amountInput);
    setSign(prefill.sign);
    setTenderedInput('');
  }

  async function handleConfirm() {
    if (!draft) return;
    setSubmitting(true);
    setError('');
    try {
      const order = await client.orders.addPayment(orderId, {
        methodId: draft.methodId,
        amountHalalas: draft.amountHalalas,
        ...(draft.tenderedHalalas !== undefined ? { tenderedHalalas: draft.tenderedHalalas } : {}),
      });
      onAdded(order);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to add payment');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-6 text-gray-400">Loading payment methods...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div
        data-osk-scope
        className="bg-gray-900 rounded-xl p-4 w-[420px] max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-bold text-white mb-3">Add Payment</h2>

        {/* Order total + outstanding */}
        <div className="bg-gray-800 rounded-lg p-3 mb-3 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Total</span>
            <span className="text-base font-bold text-white">
              {halalasToSar(orderTotalHalalas)} SAR
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Outstanding</span>
            <span
              className={`text-base font-bold ${
                outstandingHalalas === 0 ? 'text-green-400' : 'text-amber-400'
              }`}
            >
              {halalasToSar(outstandingHalalas)} SAR
            </span>
          </div>
        </div>

        {/* Method chips */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleMethodSelect(m)}
              className={`touch-target flex flex-col items-center py-3 px-2 rounded-lg text-sm border-2 ${
                selectedMethodId === m.id
                  ? 'border-brand-500 bg-brand-600/20 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
              }`}
            >
              <span className="font-medium">{m.title}</span>
            </button>
          ))}
        </div>

        {/* Amount block */}
        {selectedMethodId && (
          <div className="bg-gray-800 rounded-lg p-3 mb-3">
            <label className="block text-xs text-gray-500 mb-1">
              Amount ({sign === -1 ? 'correction' : 'payment'})
            </label>

            {/* Sign toggle */}
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => handleSign(1)}
                className={`touch-target flex-1 rounded-lg py-2 text-lg font-bold border-2 ${
                  sign === 1
                    ? 'border-brand-500 bg-brand-600/20 text-white'
                    : 'border-gray-700 bg-gray-700 text-gray-400'
                }`}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => handleSign(-1)}
                className={`touch-target flex-1 rounded-lg py-2 text-lg font-bold border-2 ${
                  sign === -1
                    ? 'border-red-500 bg-red-900/30 text-red-300'
                    : 'border-gray-700 bg-gray-700 text-gray-400'
                }`}
              >
                −
              </button>
            </div>

            {/* Amount — money text input (inputMode=decimal); the sign toggle
                above owns the sign, so the field itself is always a
                non-negative magnitude. Text+decimal instead of type="number":
                the OSK must be able to type "46." while building "46.50", and
                browsers silently drop trailing dots on number inputs. */}
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              data-testid="payment-amount-input"
              placeholder="0.00"
              className="w-full bg-gray-700 border rounded px-3 py-3 text-2xl font-mono text-center text-white border-gray-700 focus:outline-none focus:border-brand-500"
            />

            {/* Signed summary — informational only; editing happens in the
                input above. */}
            <div
              className={`text-center text-sm mt-1 ${
                amountHalalas < 0 ? 'text-red-400' : 'text-gray-400'
              }`}
            >
              {amountHalalas !== 0
                ? `${amountHalalas < 0 ? '−' : ''}${halalasToSar(Math.abs(amountHalalas))} SAR`
                : '0.00 SAR'}
            </div>
          </div>
        )}

        {/* Cash tendered block — positive cash lines only */}
        {showTendered && (
          <div className="bg-gray-800 rounded-lg p-3 mb-3 space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tendered (SAR)</label>
              {/* Tendered — money text input (positive amount only); the
                  global OSK numpad drives it when enabled. */}
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={tenderedInput}
                onChange={(e) => setTenderedInput(e.target.value)}
                data-testid="payment-tendered-input"
                placeholder="0.00"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            {tenderedHalalas !== undefined && tenderedHalalas > amountHalalas && (
              <div className="text-sm text-green-400">
                Change due: {halalasToSar(changeDue)} SAR
              </div>
            )}
            {tenderedHalalas !== undefined &&
              tenderedHalalas > 0 &&
              tenderedHalalas < amountHalalas && (
                <div className="text-sm text-red-400">Insufficient tendered amount</div>
              )}
          </div>
        )}

        {/* Inline keyboard dock: the OSK portals in here when the amount /
            tendered fields are focused, so it grows the modal instead of
            covering the Confirm/Cancel row. Zero footprint otherwise. */}
        <OskDock size="sm" className="mt-3" />

        {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

        {/* Confirm / Cancel */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 touch-target bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
          >
            {submitting ? 'Adding...' : 'Add Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
