import { useState, useEffect, useMemo } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../api';
import { useRefund, getRemainingQty } from '../hooks/useRefund';
import type { OrderResponse, OrderRefundResponse } from '@spicyhome/client-ts';
import { ConfirmActionButton } from './ConfirmActionButton';

interface PaymentMethod {
  id: string;
  title: string;
  enabled: boolean;
  sortOrder: number;
}

interface RefundPanelProps {
  order: OrderResponse;
  onClose: () => void;
  onRefunded: () => void;
}

interface ItemRow {
  orderItemId: number;
  itemName: string;
  unitPriceHalalas: number;
  originalQty: number;
  refundQty: number;
}

export function RefundPanel({ order, onClose, onRefunded }: RefundPanelProps) {
  const { loading, error, refund } = useRefund();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [refunds, setRefunds] = useState<OrderRefundResponse[]>([]);
  const [loadingRefunds, setLoadingRefunds] = useState(true);
  const [refundQtys, setRefundQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);

  // Load payment methods on mount
  useEffect(() => {
    let cancelled = false;
    client.paymentMethods
      .listEnabled()
      .then((res: PaymentMethod[]) => {
        if (!cancelled) setMethods(res);
      })
      .catch(() => {
        // If methods fail to load, proceed but user won't be able to refund
      })
      .finally(() => {
        if (!cancelled) setLoadingMethods(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load refund history on mount
  useEffect(() => {
    let cancelled = false;
    client.orders
      .getRefunds(order.id)
      .then((res) => {
        if (!cancelled) setRefunds(res);
      })
      .catch(() => {
        // If refunds fail to load, proceed with empty list
      })
      .finally(() => {
        if (!cancelled) setLoadingRefunds(false);
      });
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  // Build rows from order items immediately (not waiting for refunds)
  const rows: ItemRow[] = (order.items || []).map((oi) => ({
    orderItemId: oi.id,
    itemName: oi.itemName,
    unitPriceHalalas: oi.unitPriceHalalas,
    originalQty: oi.qty,
    refundQty: refundQtys[oi.id] || 0,
  }));

  function setRefundQty(orderItemId: number, qty: number) {
    setRefundQtys((prev) => ({ ...prev, [orderItemId]: qty }));
  }

  const selectedItems = useMemo(() => rows.filter((r) => r.refundQty > 0), [rows]);

  const refundTotalHalalas = useMemo(
    () => selectedItems.reduce((sum, r) => sum + r.unitPriceHalalas * r.refundQty, 0),
    [selectedItems],
  );

  const hasSelection = selectedItems.length > 0;

  async function handleProcessRefund() {
    if (!hasSelection || !selectedMethodId) return;

    const items = selectedItems.map((r) => ({
      orderItemId: r.orderItemId,
      qty: r.refundQty,
    }));

    const success = await refund(order.id, items, selectedMethodId, reason || undefined);
    if (success) {
      onRefunded();
    }
  }

  if (loadingRefunds || loadingMethods) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-xs text-gray-400">Loading refund data...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">Refund for Order #{order.orderNo}</h3>
        <button
          onClick={onClose}
          className="touch-target w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2 mb-3">
        {rows.map((row) => {
          const remaining = getRemainingQty(row.originalQty, row.orderItemId, refunds);
          const maxRefund = remaining;

          return (
            <div
              key={row.orderItemId}
              className="bg-gray-750 rounded-lg p-2 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white block truncate">{row.itemName}</span>
                <span className="text-xs text-gray-400">
                  {row.originalQty} x {halalasToSar(row.unitPriceHalalas)} | Remaining: {remaining}
                </span>
              </div>
              {maxRefund > 0 ? (
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button
                    onClick={() => setRefundQty(row.orderItemId, Math.max(0, row.refundQty - 1))}
                    disabled={row.refundQty <= 0}
                    className="touch-target w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-xs text-white"
                  >
                    -
                  </button>
                  <span className="text-sm text-gray-200 w-5 text-center">{row.refundQty}</span>
                  <button
                    onClick={() =>
                      setRefundQty(row.orderItemId, Math.min(maxRefund, row.refundQty + 1))
                    }
                    disabled={row.refundQty >= maxRefund}
                    className="touch-target w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-xs text-white"
                  >
                    +
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-500">Fully refunded</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Reason */}
      <div className="mb-3">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500"
        />
      </div>

      {/* Totals */}
      {hasSelection && (
        <div className="border-t border-gray-700 pt-2 mb-3 text-sm">
          <div className="flex justify-between text-gray-300">
            <span>Refund Total</span>
            <span className="text-brand-400">{halalasToSar(refundTotalHalalas)} SAR</span>
          </div>
        </div>
      )}

      {/* Payment method selection */}
      {hasSelection && (
        <div className="mb-3">
          <label className="text-xs text-gray-400 block mb-2">Refund method</label>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMethodId(m.id)}
                className={`touch-target py-3 px-2 rounded-lg text-sm font-medium border-2 ${
                  selectedMethodId === m.id
                    ? 'border-brand-500 bg-brand-600/20 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                }`}
              >
                {m.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Show selected method */}
      {selectedMethodId && (
        <div className="mb-3 text-xs text-gray-400">
          Refunding via{' '}
          <span className="text-white">
            {methods.find((m) => m.id === selectedMethodId)?.title ?? selectedMethodId}
          </span>
        </div>
      )}

      {/* Error */}
      {error && <div className="text-red-400 text-xs mb-2">{error}</div>}

      {/* Actions */}
      <div className="flex gap-2">
        <ConfirmActionButton
          key={`refund-${selectedMethodId ?? 'none'}-${refundTotalHalalas}-${JSON.stringify(refundQtys)}`}
          textContent="Process Refund"
          confirmTextContent="Confirm Refund"
          onConfirm={() => {
            void handleProcessRefund();
          }}
          disabled={!hasSelection || !selectedMethodId || loading}
          busy={loading}
          busyTextContent="Processing..."
          className="flex-1 touch-target bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-2"
          confirmClassName="flex-1 touch-target bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm font-bold text-red-100 py-2"
        />
      </div>
    </div>
  );
}
