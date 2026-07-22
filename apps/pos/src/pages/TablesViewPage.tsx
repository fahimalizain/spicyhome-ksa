import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { client } from '../api';
import { realtime } from '../realtime';
import type { TableResponse, OrderResponse } from '@spicyhome/client-ts';

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return '<1m';
  }
  const m = Math.floor(seconds / 60);
  if (m < 60) {
    return `${m}m`;
  }
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (rm === 0) {
    return `${h}h`;
  }
  return `${h}h ${rm}m`;
}

export function TablesViewPage() {
  const [tables, setTables] = useState<TableResponse[]>([]);
  const [openOrders, setOpenOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const refresh = () => {
      loadData();
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

  async function loadData() {
    setLoading(true);
    try {
      const [tableRes, orderRes] = await Promise.all([
        client.tables.list(),
        client.orders.list('open'),
      ]);
      setTables(tableRes.filter((t) => t.isActive));
      setOpenOrders(orderRes);
    } catch {
      setError('Failed to load tables');
    } finally {
      setLoading(false);
    }
  }

  function getOpenOrder(tableId: number): OrderResponse | undefined {
    return openOrders.find(
      (o) => o.tableId != null && (o.tableId as unknown as number) === tableId,
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">Loading tables...</div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Tables</h1>
        <button
          onClick={() => navigate('/')}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm text-white"
        >
          New Order
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      {tables.length === 0 && (
        <div className="text-gray-500 text-center mt-8">No tables configured</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tables.map((table) => {
          const openOrder = getOpenOrder(table.id);
          const isOccupied = openOrder != null;
          const elapsedSec = isOccupied ? now - (openOrder.createdAt as unknown as number) : 0;

          return (
            <div
              key={table.id}
              onClick={() =>
                navigate(
                  isOccupied
                    ? `/?tableId=${table.id}&orderId=${openOrder.id}`
                    : `/?tableId=${table.id}`,
                )
              }
              className={`bg-gray-800 hover:bg-gray-700 cursor-pointer rounded-xl p-4 min-h-[96px] flex flex-col justify-center ${
                isOccupied ? 'border-2 border-amber-500' : 'border-2 border-gray-700'
              }`}
            >
              <span className="text-lg font-bold text-white">{table.name}</span>
              <span className={`text-sm ${isOccupied ? 'text-amber-400' : 'text-gray-500'}`}>
                {isOccupied ? formatElapsed(elapsedSec) : 'Free'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
