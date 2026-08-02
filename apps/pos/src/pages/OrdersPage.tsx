import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { halalasToSar, getServiceDayString, ALL_ORDER_STATUSES } from '@spicyhome/shared';
import { client } from '../api';
import { realtime } from '../realtime';
import { usePermissions } from '../hooks/usePermissions';
import { OrderEventTimeline } from '../components/OrderEventTimeline';
import { RefundPanel } from '../components/RefundPanel';
import { RefundDetailModal } from '../components/RefundDetailModal';
import { OrderActionBar } from '../components/OrderActionBar';
import { OrderHeader } from '../components/orders/OrderHeader';
import { getPreviousInvoiceDocumentIds } from '../lib/order-events';
import { formatOrderTypeLabel } from '../lib/order-type-label';
import type {
  OrderResponse,
  OrderSummaryResponse,
  OrderRefundResponse,
  UserOptionResponse,
} from '@spicyhome/client-ts';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  paid: 'Paid',
  voided: 'Voided',
  refunded: 'Refunded',
};

// Active filter-pill colors, tinted per status (mirrors the status-* badge colors).
const STATUS_PILL_ACTIVE: Record<string, string> = {
  open: 'bg-yellow-700/90 border-yellow-500 text-yellow-100',
  paid: 'bg-green-700/90 border-green-500 text-green-100',
  voided: 'bg-red-700/90 border-red-500 text-red-100',
  refunded: 'bg-purple-700/90 border-purple-500 text-purple-100',
};

export function OrdersPage() {
  const permissions = usePermissions();
  const [orders, setOrders] = useState<OrderSummaryResponse[]>([]);
  // Full-page spinner only for the very first load; filter-driven reloads
  // keep the page chrome mounted and only spin the list area.
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [refunds, setRefunds] = useState<OrderRefundResponse[]>([]);
  const [selectedRefund, setSelectedRefund] = useState<OrderRefundResponse | null>(null);
  const [previousDocumentIds, setPreviousDocumentIds] = useState<string[]>([]);
  const navigate = useNavigate();

  // ── Filters (server-side) ────────────────────────────────────────────────
  // Date: default current service day (Asia/Riyadh 05:00 boundary, per
  // ADR 0008 — the same window the server uses for the orders list filter).
  // Status: multiselect, default open only; empty selection → no status
  // filter. User: all users (no userId sent) unless a specific user is
  // picked.
  const [selectedDate, setSelectedDate] = useState(() => getServiceDayString(Date.now()));
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    () => new Set([ALL_ORDER_STATUSES[0]]),
  );
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [users, setUsers] = useState<UserOptionResponse[]>([]);

  // Current filter state, mirrored into a ref so the realtime handlers
  // (registered once) always refresh the list with the active filters.
  const filtersRef = useRef<{ status?: string; date?: string; userId?: number }>({});
  filtersRef.current = {
    status: selectedStatuses.size > 0 ? [...selectedStatuses].join(',') : undefined,
    date: selectedDate,
    userId: selectedUserId,
  };

  // Current selected order id, kept in a ref so realtime handlers (registered
  // once) always refresh the order the user is currently viewing.
  const selectedOrderIdRef = useRef<number | null>(null);
  selectedOrderIdRef.current = selectedOrder?.id ?? null;

  useEffect(() => {
    loadOrders();
  }, [selectedDate, selectedStatuses, selectedUserId]);

  // Active users for the user filter dropdown (best-effort: failures leave
  // only "All users").
  useEffect(() => {
    let cancelled = false;
    client.auth
      .listActiveUsers()
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Background refresh used by realtime events: refreshes the list WITHOUT
   * flipping the full-page loading spinner, and refetches the selected order
   * detail (notes/items/payments) plus refunds and events when one is open.
   */
  const refreshAll = useCallback(async () => {
    try {
      const res = await client.orders.list({ ...filtersRef.current });
      setOrders(res);
      setError('');
    } catch {
      setError('Failed to load orders');
    }
    const id = selectedOrderIdRef.current;
    if (id != null) {
      try {
        const [order, refundsResult, events] = await Promise.all([
          client.orders.get(id),
          client.orders.getRefunds(id),
          client.orders.getEvents(id),
        ]);
        // Only apply if the user is still viewing the same order.
        if (selectedOrderIdRef.current === id) {
          setSelectedOrder(order);
          setRefunds(refundsResult);
          setPreviousDocumentIds(getPreviousInvoiceDocumentIds(events, order.documentId));
        }
      } catch {
        // Keep current detail on failure
      }
    }
  }, []);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(realtime.subscribe('order.created', refreshAll));
    unsubs.push(realtime.subscribe('order.paid', refreshAll));
    unsubs.push(realtime.subscribe('order.voided', refreshAll));
    unsubs.push(realtime.subscribe('order.refund.issued', refreshAll));
    unsubs.push(realtime.subscribe('order.refunded', refreshAll));
    unsubs.push(realtime.subscribe('order.updated', refreshAll));
    unsubs.push(realtime.subscribe('order.item.added', refreshAll));
    unsubs.push(realtime.subscribe('order.item.updated', refreshAll));
    unsubs.push(realtime.subscribe('order.item.removed', refreshAll));
    realtime.onReconnect(refreshAll);
    return () => {
      for (const unsub of unsubs) unsub();
      realtime.offReconnect();
    };
  }, [refreshAll]);

  /**
   * Load the order list with the active filters. The first load uses the
   * full-page spinner; every later (filter-driven) reload keeps the header,
   * filter bar and selected-order detail mounted and only shows a spinner
   * over the list area, so the user keeps seeing what they clicked.
   */
  async function loadOrders() {
    if (hasLoadedOnceRef.current) {
      setListLoading(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await client.orders.list({ ...filtersRef.current });
      setOrders(res);
      setError('');
    } catch {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
      setListLoading(false);
      hasLoadedOnceRef.current = true;
    }
  }

  function toggleStatus(status: string) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  async function viewOrder(id: number) {
    try {
      const [order, refundsResult, events] = await Promise.all([
        client.orders.get(id),
        client.orders.getRefunds(id),
        client.orders.getEvents(id),
      ]);
      setSelectedOrder(order);
      setRefunds(refundsResult);
      setPreviousDocumentIds(getPreviousInvoiceDocumentIds(events, order.documentId));
      setShowRefund(false);
      setSelectedRefund(null);
    } catch {
      setError('Failed to load order details');
    }
  }

  // Full-page spinner only until the first list load completes (success or
  // failure). Filter-driven reloads render the page chrome normally.
  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">Loading orders...</div>
    );
  }

  // Detail header creator name: resolve the order's createdBy id against the
  // active users list (already loaded for the filter dropdown). Prefer a
  // non-blank name; fall back to the username. Unknown ids (inactive/deleted
  // users, failed list) hide the line entirely.
  const createdByName = (() => {
    if (selectedOrder?.createdBy == null) return null;
    const u = users.find((x) => x.id === selectedOrder.createdBy);
    if (!u) return null;
    const name = u.name?.trim();
    return name || u.username || null;
  })();

  return (
    <div className="h-full flex">
      {/* Order list */}
      <div
        className={`${selectedOrder ? 'w-1/2' : 'w-full'} h-full min-h-0 overflow-y-auto scrollbar-thin border-r border-gray-700`}
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

          {/* Filter bar — server-side filters, every change reloads the list */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label htmlFor="orders-filter-date" className="text-xs text-gray-400">
              Date
            </label>
            <input
              id="orders-filter-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
            <label htmlFor="orders-filter-user" className="text-xs text-gray-400 ml-2">
              User
            </label>
            <select
              id="orders-filter-user"
              value={selectedUserId ?? ''}
              onChange={(e) =>
                setSelectedUserId(e.target.value === '' ? undefined : Number(e.target.value))
              }
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white"
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.username}
                </option>
              ))}
            </select>
            {ALL_ORDER_STATUSES.map((status) => {
              const active = selectedStatuses.has(status);
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleStatus(status)}
                  className={`inline-flex items-center justify-center h-9 px-3.5 rounded-full text-xs font-semibold select-none border transition-colors ${
                    active
                      ? STATUS_PILL_ACTIVE[status]
                      : 'bg-gray-800/80 border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  {STATUS_LABELS[status]}
                </button>
              );
            })}
          </div>

          <div className="relative">
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
                      <span className="text-sm font-bold text-white">{order.documentId}</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs status-${order.status}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>
                    <span className="text-sm text-brand-400">
                      {halalasToSar(order.totalHalalas)} SAR
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1 text-xs text-gray-400">
                    <div className="flex flex-wrap items-center gap-3 min-w-0">
                      <span>{formatOrderTypeLabel(order)}</span>
                      {order.tableId != null && (
                        <span>Table #{order.tableId as unknown as number}</span>
                      )}
                      {order.status === 'open' && (
                        <span
                          className={
                            order.kitchenPrintedQty !== order.itemQtyTotal
                              ? 'text-amber-400 font-semibold'
                              : undefined
                          }
                        >
                          Kitchen Qty Printed: {order.kitchenPrintedQty} / {order.itemQtyTotal}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 ml-auto">
                      {new Date((order.createdAt as unknown as number) * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                </button>
              ))}
              {orders.length === 0 && (
                <div className="text-gray-500 text-center mt-8">No orders match filters</div>
              )}
            </div>

            {/* List-area spinner during filter-driven reloads — the header,
                filter bar and selected order detail stay mounted above/right. */}
            {listLoading && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/60"
                aria-busy="true"
              >
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-brand-500" />
                  <span>Loading...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Order detail */}
      {selectedOrder && (
        <div className="w-1/2 flex flex-col min-h-0 h-full border-l border-gray-700">
          {/* Sticky header — shared OrderHeader, detail variant */}
          <OrderHeader
            variant="detail"
            documentId={selectedOrder.documentId}
            status={selectedOrder.status}
            typeLabel={formatOrderTypeLabel(selectedOrder)}
            createdAt={selectedOrder.createdAt}
            createdByName={createdByName}
            notes={selectedOrder.notes}
            previousDocumentIds={previousDocumentIds}
          />

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4">
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

            {/* Refunds list */}
            {refunds.length > 0 && (
              <div className="mt-3">
                <h3 className="text-sm font-semibold text-gray-300 mb-1">Refunds</h3>
                <div className="space-y-1">
                  {refunds.map((refund) => (
                    <button
                      key={refund.id}
                      onClick={() => setSelectedRefund(refund)}
                      className="touch-target w-full bg-gray-800 hover:bg-gray-750 rounded-lg p-3 flex justify-between items-start text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white">
                          {new Date(refund.createdAt * 1000).toLocaleTimeString()}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {refund.methodTitle}
                          {refund.reason && (
                            <span className="text-gray-500 ml-1 truncate">
                              —{' '}
                              {refund.reason.length > 30
                                ? refund.reason.slice(0, 30) + '...'
                                : refund.reason}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-brand-400 ml-2 whitespace-nowrap">
                        {halalasToSar(refund.totalHalalas)} SAR
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Refund detail modal */}
            {selectedRefund && (
              <RefundDetailModal refund={selectedRefund} onClose={() => setSelectedRefund(null)} />
            )}

            {/* Event timeline (replaces legacy audit trail) */}
            <OrderEventTimeline orderId={selectedOrder.id} />
          </div>

          {/* Pinned footer — only when open */}
          {selectedOrder.status === 'open' && (
            <div className="shrink-0 border-t border-gray-700 p-3 bg-gray-900">
              <button
                type="button"
                onClick={() => navigate(`/?orderId=${selectedOrder.id}`)}
                className="w-full touch-target bg-brand-600 hover:bg-brand-700 rounded-lg py-3 text-sm font-bold text-white"
              >
                Open Order
              </button>
            </div>
          )}
        </div>
      )}

      {/* Refund modal */}
      {showRefund && selectedOrder && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowRefund(false)}
        >
          <div
            className="bg-gray-900 rounded-xl p-4 w-96 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <RefundPanel
              order={selectedOrder}
              onClose={() => setShowRefund(false)}
              onRefunded={() => {
                setShowRefund(false);
                // Silent refresh: no full-page loading flash, detail refetched too
                refreshAll();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
