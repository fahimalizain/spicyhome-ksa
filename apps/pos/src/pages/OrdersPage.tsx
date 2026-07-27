import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../api';
import { realtime } from '../realtime';
import { usePermissions } from '../hooks/usePermissions';
import { OrderEventTimeline } from '../components/OrderEventTimeline';
import { RefundPanel } from '../components/RefundPanel';
import { OrderActionBar } from '../components/OrderActionBar';
import type { OrderResponse, OrderSummaryResponse } from '@spicyhome/client-ts';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  paid: 'Paid',
  voided: 'Voided',
  refunded: 'Refunded',
};

export function OrdersPage() {
  const permissions = usePermissions();
  const [orders, setOrders] = useState<OrderSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const refresh = () => {
      loadOrders();
    };
    unsubs.push(realtime.subscribe('order.created', refresh));
    unsubs.push(realtime.subscribe('order.paid', refresh));
    unsubs.push(realtime.subscribe('order.voided', refresh));
    unsubs.push(realtime.subscribe('order.refund.issued', refresh));
    unsubs.push(realtime.subscribe('order.refunded', refresh));
    unsubs.push(realtime.subscribe('order.updated', refresh));
    unsubs.push(realtime.subscribe('order.item.added', refresh));
    unsubs.push(realtime.subscribe('order.item.updated', refresh));
    unsubs.push(realtime.subscribe('order.item.removed', refresh));
    realtime.onReconnect(refresh);
    return () => {
      for (const unsub of unsubs) unsub();
      realtime.offReconnect();
    };
  }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const res = await client.orders.list();
      setOrders(res);
    } catch {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  async function viewOrder(id: number) {
    try {
      const order = await client.orders.get(id);
      setSelectedOrder(order);
      setShowRefund(false);
    } catch {
      setError('Failed to load order details');
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">Loading orders...</div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Order list */}
      <div
        className={`${selectedOrder ? 'w-1/2' : 'w-full'} overflow-y-auto border-r border-gray-700`}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-white">Orders</h1>
            <button
              onClick={() => navigate('/')}
              className="touch-target bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm text-white"
            >
              New Order
            </button>
          </div>

          {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

          <div className="space-y-2">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => viewOrder(order.id)}
                className={`w-full text-left bg-gray-800 hover:bg-gray-750 rounded-lg p-3 ${
                  selectedOrder?.id === order.id ? 'ring-2 ring-brand-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-white">#{order.orderNo}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs status-${order.status}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>
                  <span className="text-sm text-brand-400">
                    {halalasToSar(order.totalHalalas)} SAR
                  </span>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-gray-400">
                  <span>{order.type === 'dine_in' ? 'Dine-in' : 'Takeaway'}</span>
                  {order.tableId != null && (
                    <span>Table #{order.tableId as unknown as number}</span>
                  )}
                  <span>
                    {new Date((order.createdAt as unknown as number) * 1000).toLocaleTimeString()}
                  </span>
                </div>
              </button>
            ))}
            {orders.length === 0 && (
              <div className="text-gray-500 text-center mt-8">No orders yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Order detail */}
      {selectedOrder && (
        <div className="w-1/2 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Order #{selectedOrder.orderNo}</h2>
            <span className={`px-2 py-1 rounded text-xs font-bold status-${selectedOrder.status}`}>
              {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
            </span>
          </div>

          <div className="text-sm text-gray-400 mb-4">
            <p>{selectedOrder.type === 'dine_in' ? 'Dine-in' : 'Takeaway'}</p>
            <p>{new Date(selectedOrder.createdAt * 1000).toLocaleString()}</p>
          </div>

          <div className="space-y-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-300">Items</h3>
            {(selectedOrder.items || []).map((oi) => (
              <div key={oi.id} className="bg-gray-800 rounded-lg p-2 flex justify-between">
                <div>
                  <span className="text-sm text-white">{oi.itemName}</span>
                  {oi.notes && (
                    <span className="text-xs text-gray-400 block">
                      {oi.notes as unknown as string}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm text-gray-300">
                    {oi.qty} × {halalasToSar(oi.unitPriceHalalas)}
                  </span>
                  <span className="text-sm text-brand-400 ml-2">
                    {halalasToSar(oi.totalHalalas)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-700 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Subtotal</span>
              <span>{halalasToSar(selectedOrder.subtotalHalalas)} SAR</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>VAT</span>
              <span>{halalasToSar(selectedOrder.vatHalalas)} SAR</span>
            </div>
            <div className="flex justify-between text-white font-bold text-base pt-1 border-t border-gray-700">
              <span>Total</span>
              <span>{halalasToSar(selectedOrder.totalHalalas)} SAR</span>
            </div>
          </div>

          {/* Payments section */}
          {(selectedOrder.payments?.length ?? 0) > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-gray-300 mb-1">Payments</h3>
              <div className="space-y-1">
                {selectedOrder.payments!.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-400">
                    <span>{p.methodTitle}</span>
                    <span>{halalasToSar(p.amountHalalas)} SAR</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OrderActionBar for reprints */}
          <div className="mt-3">
            <OrderActionBar orderId={selectedOrder.id} status={selectedOrder.status} />
          </div>

          {/* Refund button */}
          {selectedOrder.status === 'paid' && permissions.refundOrder && !showRefund && (
            <button
              onClick={() => setShowRefund(true)}
              className="touch-target mt-3 w-full bg-amber-600 hover:bg-amber-700 rounded-lg py-2 text-sm font-bold text-white"
            >
              Refund
            </button>
          )}

          {/* RefundPanel */}
          {showRefund && selectedOrder.status === 'paid' && (
            <div className="mt-3">
              <RefundPanel
                order={selectedOrder}
                onClose={() => setShowRefund(false)}
                onRefunded={async () => {
                  setShowRefund(false);
                  try {
                    const updated = await client.orders.get(selectedOrder.id);
                    setSelectedOrder(updated);
                    loadOrders();
                  } catch {
                    // Refetch failed, keep current state
                  }
                }}
              />
            </div>
          )}

          {/* Event timeline (replaces legacy audit trail) */}
          <OrderEventTimeline orderId={selectedOrder.id} />
        </div>
      )}
    </div>
  );
}
