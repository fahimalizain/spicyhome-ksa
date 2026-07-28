import { useState, useEffect } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../../api';
import {
  calcOutstanding,
  canPay,
  tapToFill,
  stripZeroPayments,
  calcCashChange,
  applyNumpadKey,
  type PaymentMethod,
} from './pay-modal-logic';
import {
  StandardInvoiceBuyerForm,
  emptyStandardInvoiceBuyer,
  validateStandardBuyer,
  type ZatcaBuyerDetails,
} from './StandardInvoiceBuyerForm';

/**
 * Convert a SAR display string (e.g. "12.50") to integer halalas,
 * using integer-only math to avoid floating-point errors.
 * Only accepts up to 2 decimal digits.
 */
function sarDisplayToHalalas(value: string): number {
  if (!value || value === '.') return 0;
  // Validate: at most 2 decimal digits
  if (!/^\d+(\.\d{0,2})?$/.test(value)) return 0;
  const parts = value.split('.');
  const whole = parseInt(parts[0] || '0', 10);
  const frac = parts[1] ? parseInt((parts[1] + '00').slice(0, 2), 10) : 0;
  return whole * 100 + frac;
}

type NumpadTarget = 'method' | 'tendered';

const NUMPAD_KEYS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['C', '0', '.'], ['⌫']];

/** Reusable numpad grid — renders 5 rows of keys. */
function Numpad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div className="space-y-1">
      {NUMPAD_KEYS.map((row, ri) => (
        <div key={ri} className="flex gap-1 justify-center">
          {row.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onKey(key)}
              className="touch-target w-14 h-10 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white font-medium"
            >
              {key}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

interface PayModalProps {
  orderId: number;
  orderTotalHalalas: number;
  onPaid: () => void;
  onClose: () => void;
}

export function PayModal({ orderId, orderTotalHalalas, onPaid, onClose }: PayModalProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [tenderedHalalas, setTenderedHalalas] = useState<number | undefined>(undefined);
  const [tenderedInput, setTenderedInput] = useState('');
  const [numpadInput, setNumpadInput] = useState('');
  const [numpadTarget, setNumpadTarget] = useState<NumpadTarget>('method');

  // Standard invoice state
  const [isStandardInvoice, setIsStandardInvoice] = useState(false);
  const [buyer, setBuyer] = useState<ZatcaBuyerDetails>(emptyStandardInvoiceBuyer());
  const [buyerErrors, setBuyerErrors] = useState<Partial<Record<keyof ZatcaBuyerDetails, string>>>(
    {},
  );

  // Force numpadTarget to 'method' when tendered section is not relevant
  const isCashSelected = selectedMethodId === 'cash';
  const selectedAmount = selectedMethodId ? amounts[selectedMethodId] || 0 : 0;
  useEffect(() => {
    if (!isCashSelected || selectedAmount === 0) {
      setNumpadTarget('method');
    }
  }, [isCashSelected, selectedAmount]);

  useEffect(() => {
    loadMethods();
  }, []);

  async function loadMethods() {
    setLoading(true);
    try {
      const res = await client.paymentMethods.listEnabled();
      setMethods(res);
      // Initialize amounts to 0
      const init: Record<string, number> = {};
      res.forEach((m: PaymentMethod) => (init[m.id] = 0));
      setAmounts(init);
    } catch {
      setError('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }

  const outstanding = calcOutstanding(orderTotalHalalas, amounts);

  function handleMethodTap(methodId: string) {
    const switching = methodId !== selectedMethodId;
    setSelectedMethodId(methodId);
    setNumpadTarget('method');
    const newAmounts = tapToFill(
      {
        orderTotalHalalas,
        methods,
        selectedMethodIndex: 0,
        amounts,
        tenderedHalalas,
        numpadActive: false,
      },
      methodId,
    );
    setAmounts(newAmounts);
    // Reset numpad
    setNumpadInput('');
    // Clear tendered when switching to a different method
    if (switching) {
      setTenderedInput('');
      setTenderedHalalas(undefined);
    }
  }

  function handleNumpadKey(key: string) {
    if (!selectedMethodId) return;

    const next = applyNumpadKey(numpadInput, key);
    if (next === null) return;

    setNumpadInput(next);
    const halalas = sarDisplayToHalalas(next);

    // Don't allow exceeding outstanding
    const currentSum = Object.entries(amounts).reduce(
      (sum, [mid, amt]) => sum + (mid === selectedMethodId ? 0 : amt),
      0,
    );
    const validAmount = Math.min(halalas, orderTotalHalalas - currentSum);
    setAmounts((prev) => ({
      ...prev,
      [selectedMethodId]: validAmount,
    }));
  }

  function handleTenderedNumpadKey(key: string) {
    const next = applyNumpadKey(tenderedInput, key);
    if (next === null) return;

    setTenderedInput(next);

    if (!next) {
      setTenderedHalalas(undefined);
      return;
    }

    if (/^\d+(\.\d{0,2})?$/.test(next)) {
      setTenderedHalalas(sarDisplayToHalalas(next));
    }
    // Invalid intermediate state (e.g. "12."): keep previous tenderedHalalas
  }

  const changeDue = isCashSelected ? calcCashChange(selectedAmount, tenderedHalalas) : 0;
  const canSubmit =
    !submitting &&
    canPay({
      orderTotalHalalas,
      methods,
      selectedMethodIndex: 0,
      amounts,
      tenderedHalalas,
      numpadActive: false,
    }) &&
    (!isStandardInvoice || Object.keys(validateStandardBuyer(buyer)).length === 0);

  async function handlePay() {
    // Validate buyer if standard invoice is enabled
    if (isStandardInvoice) {
      const fieldErrors = validateStandardBuyer(buyer);
      if (Object.keys(fieldErrors).length > 0) {
        setBuyerErrors(fieldErrors);
        return;
      }
    }

    setSubmitting(true);
    setError('');
    setBuyerErrors({});
    try {
      const payments = stripZeroPayments(amounts, isCashSelected ? tenderedHalalas : undefined);
      const payload: any = { payments };

      if (isStandardInvoice) {
        payload.isStandardInvoice = true;
        payload.zatcaBuyerDetails = buyer;
      }

      await client.orders.pay(orderId, payload);
      onPaid();
    } catch (e: any) {
      setError(e.message || 'Payment failed');
    } finally {
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
        className={`bg-gray-900 rounded-xl p-4 max-h-[90vh] overflow-y-auto ${isStandardInvoice ? 'w-[520px]' : 'w-[420px]'}`}
      >
        <h2 className="text-lg font-bold text-white mb-3">Payment</h2>

        {/* Order total */}
        <div className="flex justify-between items-center bg-gray-800 rounded-lg p-3 mb-3">
          <span className="text-sm text-gray-400">Total</span>
          <span className="text-xl font-bold text-white">
            {halalasToSar(orderTotalHalalas)} SAR
          </span>
        </div>

        {/* Outstanding */}
        <div className={`text-sm mb-3 ${outstanding === 0 ? 'text-green-400' : 'text-amber-400'}`}>
          Outstanding: {halalasToSar(outstanding)} SAR
        </div>

        {/* Method buttons */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {methods.map((m) => {
            const amt = amounts[m.id] || 0;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleMethodTap(m.id)}
                className={`touch-target flex flex-col items-center py-3 px-2 rounded-lg text-sm border-2 ${
                  selectedMethodId === m.id
                    ? 'border-brand-500 bg-brand-600/20 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className="font-medium">{m.title}</span>
                {amt > 0 && (
                  <span className="text-xs mt-1 text-brand-400">{halalasToSar(amt)}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Method amount block */}
        {selectedMethodId && (
          <div className="bg-gray-800 rounded-lg p-3 mb-3">
            <button
              type="button"
              onClick={() => setNumpadTarget('method')}
              className={`w-full touch-target bg-gray-700 border rounded px-3 py-3 text-left transition-colors ${
                numpadTarget === 'method'
                  ? 'border-brand-500'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <span className="block text-2xl text-white text-center font-mono">
                {selectedAmount > 0 ? halalasToSar(selectedAmount) : '0.00'} SAR
              </span>
            </button>

            {/* Collapsible method numpad */}
            <div
              className={`overflow-hidden transition-all duration-200 ease-in-out mt-3 ${
                numpadTarget === 'method'
                  ? 'max-h-64 opacity-100'
                  : 'max-h-0 opacity-0 pointer-events-none'
              }`}
            >
              <Numpad onKey={handleNumpadKey} />
            </div>
          </div>
        )}

        {/* Cash tendered block */}
        {isCashSelected && selectedAmount > 0 && (
          <div className="bg-gray-800 rounded-lg p-3 mb-3 space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tendered (SAR)</label>
              <button
                type="button"
                onClick={() => setNumpadTarget('tendered')}
                className={`w-full bg-gray-700 border rounded px-3 py-2 text-sm text-left ${
                  numpadTarget === 'tendered'
                    ? 'border-brand-500 text-white'
                    : 'border-gray-600 text-gray-400'
                }`}
              >
                {tenderedInput || <span className="text-gray-500">0.00</span>}
              </button>
            </div>

            {tenderedHalalas !== undefined && tenderedHalalas > selectedAmount && (
              <div className="text-sm text-green-400">
                Change due: {halalasToSar(changeDue)} SAR
              </div>
            )}
            {tenderedHalalas !== undefined &&
              tenderedHalalas > 0 &&
              tenderedHalalas < selectedAmount && (
                <div className="text-sm text-red-400">Insufficient tendered amount</div>
              )}

            {/* Collapsible tendered numpad */}
            <div
              className={`overflow-hidden transition-all duration-200 ease-in-out ${
                numpadTarget === 'tendered'
                  ? 'max-h-64 opacity-100'
                  : 'max-h-0 opacity-0 pointer-events-none'
              }`}
            >
              <Numpad onKey={handleTenderedNumpadKey} />
            </div>
          </div>
        )}

        {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

        {/* Standard Invoice toggle + buyer form */}
        <div className="mb-3">
          <label className="flex items-center gap-2 touch-target cursor-pointer py-1">
            <input
              type="checkbox"
              checked={isStandardInvoice}
              onChange={(e) => {
                setIsStandardInvoice(e.target.checked);
                if (!e.target.checked) {
                  setBuyerErrors({});
                }
              }}
              className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-300">Issue ZATCA Standard Invoice</span>
          </label>

          {isStandardInvoice && (
            <div className="mt-3 border-t border-gray-700 pt-3">
              <StandardInvoiceBuyerForm
                value={buyer}
                onChange={(next) => {
                  setBuyer(next);
                  // Clear individual field error on change
                  if (buyerErrors) {
                    setBuyerErrors({});
                  }
                }}
                disabled={submitting}
                errors={buyerErrors}
              />
            </div>
          )}
        </div>

        {/* Pay / Cancel buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePay}
            disabled={!canSubmit}
            className="flex-1 touch-target bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
          >
            {submitting ? 'Processing...' : 'Pay'}
          </button>
        </div>
      </div>
    </div>
  );
}
