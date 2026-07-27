import { useState, useEffect } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../../api';
import {
  calcOutstanding,
  canPay,
  tapToFill,
  stripZeroPayments,
  calcCashChange,
  type PaymentMethod,
} from './pay-modal-logic';

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

    if (key === 'C') {
      setNumpadInput('');
      setAmounts((prev) => ({ ...prev, [selectedMethodId]: 0 }));
      return;
    }

    if (key === '⌫') {
      const newVal = numpadInput.slice(0, -1);
      setNumpadInput(newVal);
      setAmounts((prev) => ({
        ...prev,
        [selectedMethodId]: sarDisplayToHalalas(newVal),
      }));
      return;
    }

    // Number or decimal
    const newInput = numpadInput + key;
    // Prevent multiple dots
    if (key === '.' && numpadInput.includes('.')) return;

    setNumpadInput(newInput);
    const halalas = sarDisplayToHalalas(newInput);
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

  function handleTenderedChange(value: string) {
    setTenderedInput(value);
    if (!value) {
      setTenderedHalalas(undefined);
      return;
    }
    // Only parse valid SAR display strings (digits + optional up-to-2 decimal places)
    if (/^\d+(\.\d{0,2})?$/.test(value)) {
      setTenderedHalalas(sarDisplayToHalalas(value));
    }
    // Invalid format: keep previous tenderedHalalas, don't update
  }

  const isCashSelected = selectedMethodId === 'cash';
  const selectedAmount = selectedMethodId ? amounts[selectedMethodId] || 0 : 0;
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
    });

  async function handlePay() {
    setSubmitting(true);
    setError('');
    try {
      const payments = stripZeroPayments(amounts, isCashSelected ? tenderedHalalas : undefined);
      await client.orders.pay(orderId, { payments });
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

  const numpadKeys = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['C', '0', '.'], ['⌫']];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-4 w-[420px] max-h-[90vh] overflow-y-auto">
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

        {/* Numpad */}
        {selectedMethodId && (
          <div className="bg-gray-800 rounded-lg p-3 mb-3">
            <div className="text-xs text-gray-500 mb-2">
              Editing:{' '}
              <span className="text-white font-medium">
                {methods.find((m) => m.id === selectedMethodId)?.title}
              </span>
            </div>
            <div className="text-2xl text-white text-center mb-2 font-mono">
              {selectedAmount > 0 ? halalasToSar(selectedAmount) : '0.00'} SAR
            </div>
            {/* Numpad grid */}
            <div className="space-y-1">
              {numpadKeys.map((row, ri) => (
                <div key={ri} className="flex gap-1 justify-center">
                  {row.map((key) => (
                    <button
                      key={key}
                      onClick={() => handleNumpadKey(key)}
                      className="touch-target w-14 h-10 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white font-medium"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cash tendered field */}
        {isCashSelected && selectedAmount > 0 && (
          <div className="bg-gray-800 rounded-lg p-3 mb-3 space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tendered (SAR)</label>
              <input
                type="text"
                inputMode="decimal"
                value={tenderedInput}
                onChange={(e) => handleTenderedChange(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                placeholder="0.00"
              />
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
          </div>
        )}

        {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

        {/* Pay / Cancel buttons */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
          >
            Cancel
          </button>
          <button
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
