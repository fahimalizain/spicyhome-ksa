import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../api';
import { realtime } from '../realtime';
import type { OrderResponse } from '@spicyhome/client-ts';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  sent: 'Sent',
  paid: 'Paid',
  voided: 'Voided',
  refunded: 'Refunded',
};

export function OrdersPage() {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
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
    unsubs.push(realtime.subscribe('order.sent', refresh));
    unsubs.push(realtime.subscribe('order.paid', refresh));
    unsubs.push(realtime.subscribe('order.voided', refresh));
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

          {/* Audit trail */}
          {selectedOrder.auditLog && selectedOrder.auditLog.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Audit Trail</h3>
              <div className="space-y-1">
                {selectedOrder.auditLog.map((entry) => (
                  <div key={entry.id} className="text-xs text-gray-500 flex justify-between">
                    <span>{entry.action}</span>
                    <span>{new Date(entry.createdAt * 1000).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
