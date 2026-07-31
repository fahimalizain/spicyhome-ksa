import { halalasToSar } from '@spicyhome/shared';
import type { OrderRefundResponse } from '@spicyhome/client-ts';

interface RefundDetailModalProps {
  refund: OrderRefundResponse;
  onClose: () => void;
}

export function RefundDetailModal({ refund, onClose }: RefundDetailModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-xl p-4 w-96 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-white">Refund {refund.documentId}</h3>
          <button
            onClick={onClose}
            className="touch-target w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* When */}
        <div className="text-sm text-gray-400 mb-2">
          <span className="text-gray-500">When: </span>
          {new Date(refund.createdAt * 1000).toLocaleString()}
        </div>

        {/* Method */}
        <div className="text-sm text-gray-400 mb-2">
          <span className="text-gray-500">Method: </span>
          {refund.methodTitle}
          <span className="text-gray-600 text-xs ml-1">({refund.methodId})</span>
        </div>

        {/* Reason */}
        {refund.reason && (
          <div className="text-sm text-gray-400 mb-2">
            <span className="text-gray-500">Reason: </span>
            {refund.reason}
          </div>
        )}

        {/* Items */}
        {refund.items.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Items</h4>
            <div className="space-y-1">
              {refund.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div>
                    <span className="text-gray-300">{item.itemName}</span>
                    <span className="text-gray-500 ml-1">
                      ×{item.qty} @ {halalasToSar(item.unitPriceHalalas)}
                    </span>
                  </div>
                  <span className="text-brand-400">{halalasToSar(item.totalHalalas)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-gray-700 pt-2 space-y-1 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Subtotal</span>
            <span>{halalasToSar(refund.subtotalHalalas)} SAR</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>VAT</span>
            <span>{halalasToSar(refund.vatHalalas)} SAR</span>
          </div>
          <div className="flex justify-between text-white font-bold pt-1 border-t border-gray-700">
            <span>Total</span>
            <span>{halalasToSar(refund.totalHalalas)} SAR</span>
          </div>
        </div>
      </div>
    </div>
  );
}
