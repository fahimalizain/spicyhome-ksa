import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../api';
import { useCart } from '../hooks/useCart';
import { usePermissions } from '../hooks/usePermissions';
import { RefundPanel } from '../components/RefundPanel';
import { OrderActionBar } from '../components/OrderActionBar';
import { PayModal } from '../components/orders/PayModal';
import { ConfirmActionButton } from '../components/ConfirmActionButton';
import { filterMenuItems } from '../lib/filterMenuItems';
import type { CartItem } from '../hooks/useCart';
import type {
  CategoryResponse,
  ItemResponse,
  TableResponse,
  OrderResponse,
  OrderSummaryResponse,
} from '@spicyhome/client-ts';

/**
 * Guard dialog shown when navigating away while dirty.
 */
function LeaveGuardDialog({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-80 text-center">
        <h3 className="text-lg font-bold text-white mb-3">Unsent Changes</h3>
        <p className="text-sm text-gray-400 mb-6">
          You have unsent changes. What would you like to do?
        </p>
        <div className="space-y-2">
          <button
            onClick={onKeepEditing}
            className="w-full touch-target bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-bold text-white py-3"
          >
            Keep Editing
          </button>
          <button
            onClick={onDiscard}
            className="w-full touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Realtime conflict dialog: shown when the order was modified elsewhere.
 */
function RealtimeConflictDialog({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-80 text-center">
        <h3 className="text-lg font-bold text-white mb-3">Order Updated Elsewhere</h3>
        <p className="text-sm text-gray-400 mb-6">
          This order was modified by another terminal. Your local changes have been reset.
        </p>
        <button
          onClick={onDismiss}
          className="w-full touch-target bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-bold text-white py-3"
        >
          OK
        </button>
      </div>
    </div>
  );
}

export function OrderPage() {
  const cart = useCart();
  const permissions = usePermissions();
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [items, setItems] = useState<ItemResponse[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [tables, setTables] = useState<TableResponse[]>([]);
  const [openOrders, setOpenOrders] = useState<OrderSummaryResponse[]>([]);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOrder, setRefundOrder] = useState<OrderResponse | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<{
    id: number;
    status: string;
    orderNo: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [dayOpen, setDayOpen] = useState<boolean | null>(null);
  const [openingCash, setOpeningCash] = useState('');
  const [dayLoading, setDayLoading] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  // Category scroll fades
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateCategoryScrollFades = useCallback(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  // Recompute fades when categories change (affects scrollWidth)
  useEffect(() => {
    updateCategoryScrollFades();
  }, [categories, updateCategoryScrollFades]);

  // Recompute fades on window resize
  useEffect(() => {
    window.addEventListener('resize', updateCategoryScrollFades);
    return () => window.removeEventListener('resize', updateCategoryScrollFades);
  }, [updateCategoryScrollFades]);

  // Navigation / realtime guards
  const [showLeaveGuard, setShowLeaveGuard] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [showRealtimeConflict, setShowRealtimeConflict] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const tableParamApplied = useRef(false);

  useEffect(() => {
    if (tableParamApplied.current) return;
    tableParamApplied.current = true;

    const tableIdParam = searchParams.get('tableId');
    const orderIdParam = searchParams.get('orderId');

    if (orderIdParam) {
      const orderId = Number(orderIdParam);
      client.orders
        .get(orderId)
        .then((order) => {
          cart.loadOrder(order);
          setCurrentOrder({ id: order.id, status: order.status, orderNo: order.orderNo });
        })
        .catch(() => {
          setError('Failed to load order');
        });
    } else if (tableIdParam) {
      cart.setOrderType('dine_in', Number(tableIdParam));
    }
  }, []);

  useEffect(() => {
    checkDay();
    loadMenu();
    loadTables();
    loadOpenOrders();
  }, []);

  // Refresh open orders whenever the table picker opens so occupancy is fresh
  useEffect(() => {
    if (showTablePicker) {
      loadOpenOrders();
    }
  }, [showTablePicker]);

  // Deep-link edge case: if we pre-selected a table via ?tableId= but it's now occupied
  // and there's no currentOrder loaded, clear the selection to avoid a 409 on create.
  useEffect(() => {
    if (!currentOrder && cart.tableId != null && openOrders.length > 0) {
      if (isTableOccupied(cart.tableId)) {
        cart.setOrderType('dine_in', null);
      }
    }
  }, [openOrders, currentOrder, cart.tableId]);
  useEffect(() => {
    if (!currentOrder) return;

    // Poll-style check for WS events on this order
    const interval = setInterval(async () => {
      if (!currentOrder) return;
      try {
        const order = await client.orders.get(currentOrder.id);
        const currentStatus = order.status;

        // If order was paid/voided elsewhere
        if (currentStatus !== 'open') {
          setCurrentOrder((prev) => (prev ? { ...prev, status: currentStatus } : null));
          return;
        }

        // If items changed while we're dirty, show conflict dialog
        if (cart.isDirty && order.updatedAt !== cart.serverUpdatedAt) {
          setShowRealtimeConflict(true);
          clearInterval(interval);
        }
      } catch {
        // Ignore poll errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentOrder?.id, cart.isDirty, cart.serverUpdatedAt]);

  async function checkDay() {
    try {
      const res = await client.day.current();
      if (res.open === false || !res.status || res.status !== 'open') {
        setDayOpen(false);
      } else {
        setDayOpen(true);
      }
    } catch {
      setDayOpen(false);
    }
  }

  async function handleOpenDay() {
    if (!openingCash || isNaN(Number(openingCash))) return;
    setDayLoading(true);
    setError('');
    try {
      const cashHalalas = Math.round(parseFloat(openingCash) * 100);
      await client.day.open({ openingCashHalalas: cashHalalas });
      setDayOpen(true);
    } catch (e: any) {
      setError(e.message || 'Failed to open day');
    } finally {
      setDayLoading(false);
    }
  }

  async function loadMenu() {
    try {
      const [cats, allItems] = await Promise.all([
        client.menu.listCategories(),
        client.menu.listItems(),
      ]);
      setCategories(cats.filter((c) => c.isActive));
      setItems(allItems.filter((i) => i.isActive));
    } catch {
      setError('Failed to load menu');
    }
  }

  async function loadTables() {
    try {
      const res = await client.tables.list();
      setTables(res.filter((t) => t.isActive));
    } catch {
      // tables optional
    }
  }

  async function loadOpenOrders() {
    try {
      const res = await client.orders.list('open');
      setOpenOrders(res);
    } catch {
      // open orders optional — picker still works without occupancy data
    }
  }

  function isTableOccupied(tableId: number): boolean {
    return openOrders.some((o) => o.tableId != null && Number(o.tableId) === tableId);
  }

  const filteredItems = filterMenuItems(items, {
    categoryId: selectedCategory,
    query: itemSearch,
  });

  async function handleOpenRefund() {
    if (!currentOrder) return;
    setShowRefundModal(true);
    setRefundLoading(true);
    setRefundOrder(null);
    try {
      const order = await client.orders.get(currentOrder.id);
      setRefundOrder(order);
    } catch {
      setShowRefundModal(false);
    } finally {
      setRefundLoading(false);
    }
  }

  function handleCloseRefund() {
    setShowRefundModal(false);
    setRefundOrder(null);
  }

  function handleNewOrder() {
    setError('');
    cart.clear();
    setCurrentOrder(null);
    setShowTablePicker(false);
    setShowRefundModal(false);
    setRefundOrder(null);
    setItemSearch('');
    setSearchParams({}, { replace: true });
  }

  // ── Create Order (D10: create + sync) ──

  async function handleCreateOrder() {
    if (cart.items.length === 0) return;

    if (cart.orderType === 'dine_in' && !cart.tableId) {
      setError('Please select a table');
      setShowTablePicker(true);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await client.orders.create({
        type: cart.orderType,
        tableId: cart.orderType === 'dine_in' ? cart.tableId || undefined : undefined,
      });
      setCurrentOrder({ id: res.id, status: 'open', orderNo: res.orderNo });

      // B6: Refetch to get real updatedAt before syncing (create response lacks updatedAt)
      const fetchedOrder = await client.orders.get(res.id);
      const baseUpdatedAt = fetchedOrder.updatedAt;

      // Sync all cart items in one bulk call
      if (cart.items.length > 0) {
        const syncRes = await client.orders.syncItems(res.id, {
          baseUpdatedAt,
          items: cart.items.map((item) => ({
            itemId: item.itemId,
            qty: item.qty,
            notes: item.notes || undefined,
          })),
        });
        cart.loadOrder(syncRes);
      } else {
        cart.loadOrder(fetchedOrder);
      }
    } catch (e: any) {
      // If create succeeded but sync failed, keep orderId for retry
      setError(e.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  }

  // ── Send to Kitchen (D3: bulk sync) ──

  async function handleSendToKitchen() {
    if (!currentOrder || currentOrder.status !== 'open') return;

    setSyncing(true);
    setError('');
    try {
      const syncRes = await client.orders.syncItems(currentOrder.id, {
        baseUpdatedAt: cart.serverUpdatedAt!,
        items: cart.items.map((item) => ({
          ...(item.orderItemId != null
            ? { orderItemId: item.orderItemId }
            : { itemId: item.itemId }),
          qty: item.qty,
          notes: item.notes || undefined,
        })),
      });
      cart.loadOrder(syncRes);
    } catch (e: any) {
      // Check for 409 conflict
      if (e.message?.includes('409') || e.message?.includes('modified by another terminal')) {
        // Refetch and hydrate
        try {
          const order = await client.orders.get(currentOrder.id);
          cart.loadOrder(order);
          setError('Order was modified elsewhere. Your local changes have been reset.');
        } catch {
          setError(e.message || 'Failed to sync items');
        }
      } else {
        setError(e.message || 'Failed to send to kitchen');
      }
    } finally {
      setSyncing(false);
    }
  }

  // ── Discard ──

  function handleDiscard() {
    cart.discard();
  }

  // ── Pay / Void ──

  function handleOpenPayModal() {
    if (!currentOrder) return;
    setShowPayModal(true);
  }

  function handlePaid() {
    setShowPayModal(false);
    setCurrentOrder((prev) => (prev ? { ...prev, status: 'paid' } : null));
  }

  async function handleVoid() {
    if (!currentOrder) return;
    setLoading(true);
    setError('');
    try {
      await client.orders.void(currentOrder.id);
      setCurrentOrder((prev) => (prev ? { ...prev, status: 'voided' } : null));
    } catch (e: any) {
      setError(e.message || 'Failed to void order');
    } finally {
      setLoading(false);
    }
  }

  // ── Cart mutations (ALL local — no API calls for open orders) ──

  function handleAddItem(item: ItemResponse) {
    // Always merge by itemId (D11)
    cart.addItem(item);
  }

  function handleUpdateQty(cartItem: CartItem, newQty: number) {
    if (newQty <= 0) {
      cart.removeItem(cartItem.itemId);
    } else {
      cart.updateQty(cartItem.itemId, newQty);
    }
  }

  function handleRemove(cartItem: CartItem) {
    cart.removeItem(cartItem.itemId);
  }

  // ── Navigation guard (D7) ──

  function guardedNavigate(navigateFn: () => void) {
    if (cart.isDirty && currentOrder) {
      setShowLeaveGuard(true);
      setPendingNavigation(() => navigateFn);
    } else {
      navigateFn();
    }
  }

  function handleKeepEditing() {
    setShowLeaveGuard(false);
    setPendingNavigation(null);
  }

  function handleDiscardAndNavigate() {
    cart.discard();
    setShowLeaveGuard(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  }

  // ── Realtime conflict dismiss ──

  function handleRealtimeConflictDismiss() {
    // Clear draft, refetch, hydrate
    setShowRealtimeConflict(false);
    if (currentOrder) {
      client.orders
        .get(currentOrder.id)
        .then((order) => {
          if (order.status !== 'open') {
            setCurrentOrder((prev) => (prev ? { ...prev, status: order.status } : null));
          } else {
            cart.loadOrder(order);
          }
        })
        .catch(() => {});
    }
  }

  // ── Visibility logic ──

  const orderReadonly = currentOrder ? currentOrder.status !== 'open' : false;
  const permissionsReadonly = currentOrder ? !permissions.updateOrder : false;
  const cartDisabled = orderReadonly || permissionsReadonly || loading || syncing;
  const canCreateOrder = !currentOrder && permissions.createOrder;

  // Dirty state: hide Pay/Void (D15), show Send + Discard
  const showPayVoid =
    currentOrder &&
    currentOrder.status === 'open' &&
    !cart.isDirty &&
    !orderReadonly &&
    !permissionsReadonly;

  if (dayOpen === null) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (!dayOpen) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl p-8 w-96 text-center">
          <h2 className="text-xl font-bold text-white mb-4">Open Business Day</h2>
          <p className="text-sm text-gray-400 mb-6">
            No business day is currently open. Enter the opening cash to start the day.
          </p>

          <div className="mb-4">
            <label className="block text-sm text-gray-300 mb-2">Opening Cash (SAR)</label>
            <input
              type="number"
              step="0.01"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white text-center text-xl"
            />
          </div>

          {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

          <button
            onClick={handleOpenDay}
            disabled={dayLoading || !openingCash}
            className="w-full touch-target bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
          >
            {dayLoading ? 'Opening Day...' : 'Open Day'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Order type toggle */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
          <button
            onClick={() => {
              if (cart.orderType !== 'dine_in') {
                cart.setOrderType('dine_in', null);
              }
              setShowTablePicker(true);
            }}
            className={`touch-target px-4 rounded-lg text-sm font-medium ${
              cart.orderType === 'dine_in' ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
            disabled={!!currentOrder}
          >
            Dine-in
          </button>
          <button
            onClick={() => cart.setOrderType('takeaway', null)}
            className={`touch-target px-4 rounded-lg text-sm font-medium ${
              cart.orderType === 'takeaway'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-700 text-gray-300'
            }`}
            disabled={!!currentOrder}
          >
            Takeaway
          </button>
          {cart.orderType === 'dine_in' && (
            <button
              onClick={() => setShowTablePicker(true)}
              disabled={!!currentOrder}
              className={`touch-target px-3 py-1.5 rounded-lg text-sm ${
                cart.tableId
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-brand-700/50 text-brand-300 border border-brand-600/50 hover:bg-brand-700'
              }`}
            >
              {cart.tableId
                ? `Table: ${tables.find((t) => t.id === cart.tableId)?.name || `#${cart.tableId}`}`
                : 'Select table…'}
            </button>
          )}
        </div>

        {/* Category tabs + inline search */}
        <div className="flex items-center gap-2 bg-gray-850 border-b border-gray-700 shrink-0 px-2">
          {/* Scroll region wrapper for category tabs */}
          <div className="relative min-w-0 flex-1">
            <div
              ref={categoryScrollRef}
              onScroll={updateCategoryScrollFades}
              className="flex overflow-x-auto overflow-y-hidden scrollbar-none"
            >
              {/* Inner track — prevents children from being squeezed to container width */}
              <div className="inline-flex flex-nowrap items-center">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`touch-target shrink-0 px-4 py-2 text-sm whitespace-nowrap ${
                    selectedCategory === null
                      ? 'text-brand-500 border-b-2 border-brand-500'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`touch-target shrink-0 px-4 py-2 text-sm whitespace-nowrap ${
                      selectedCategory === cat.id
                        ? 'text-brand-500 border-b-2 border-brand-500'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Left fade — only when scrolled past start */}
            {canScrollLeft && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-gray-850 to-transparent"
              />
            )}

            {/* Right fade — toward search; only when more content to the right */}
            {canScrollRight && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-gray-850 to-transparent"
              />
            )}
          </div>

          {/* Right: compact search, fixed width */}
          <div className="relative shrink-0 w-40 sm:w-48 md:w-56">
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setItemSearch('');
              }}
              placeholder="Search…"
              className="w-full pl-3 pr-8 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-brand-500"
            />
            {itemSearch && (
              <button
                onClick={() => setItemSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg leading-none px-1"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Item grid */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3">
          {filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-gray-500">No items match</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAddItem(item)}
                  disabled={cartDisabled}
                  className="touch-target flex flex-col items-start bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-xl p-3 text-left disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-white">{item.name}</span>
                  <span className="text-xs text-brand-400 mt-1">
                    {halalasToSar(item.priceHalalas)} SAR
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 bg-gray-850 flex flex-col border-l border-gray-700 shrink-0 min-h-0">
        {/* Header — pinned */}
        <div className="shrink-0 px-3 pt-3 pb-2 border-b border-gray-700/80">
          <h2 className="text-sm font-semibold text-gray-300">
            {currentOrder ? `Order #${currentOrder.orderNo}` : 'New Order'}
            {currentOrder && (
              <span className={`ml-2 px-2 py-0.5 rounded text-xs status-${currentOrder.status}`}>
                {currentOrder.status}
              </span>
            )}
            {cart.isDirty && <span className="ml-2 text-xs text-amber-400">Unsent changes</span>}
          </h2>
        </div>

        {/* Items — only this scrolls */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-2">
          {cart.items.length === 0 ? (
            <div className="text-sm text-gray-500 text-center mt-8">Cart is empty</div>
          ) : (
            <div className="space-y-2">
              {cart.items.map((item, idx) => (
                <div
                  key={
                    item.orderItemId != null ? `oi-${item.orderItemId}` : `mi-${item.itemId}-${idx}`
                  }
                  className="bg-gray-800 rounded-lg p-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white flex-1">{item.name}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {halalasToSar(item.unitPriceHalalas * item.qty)}
                    </span>
                  </div>
                  {!orderReadonly && !permissionsReadonly && (
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={() => handleUpdateQty(item, item.qty - 1)}
                        disabled={cartDisabled}
                        className="touch-target w-7 h-7 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm text-white"
                      >
                        -
                      </button>
                      <span className="text-sm text-gray-300 w-7 text-center">{item.qty}</span>
                      <button
                        onClick={() => handleUpdateQty(item, item.qty + 1)}
                        disabled={cartDisabled}
                        className="touch-target w-7 h-7 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm text-white"
                      >
                        +
                      </button>
                      {(currentOrder ? permissions.deleteOrderItem : true) && (
                        <button
                          onClick={() => handleRemove(item)}
                          disabled={cartDisabled}
                          className="touch-target w-7 h-7 bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded text-xs text-white ml-auto"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals & Actions */}
        <div className="border-t border-gray-700 p-3 shrink-0">
          <div className="space-y-1 text-sm mb-3">
            <div className="flex justify-between text-gray-400">
              <span>Subtotal</span>
              <span>{halalasToSar(cart.totals.subtotalHalalas)} SAR</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>VAT (15%)</span>
              <span>{halalasToSar(cart.totals.vatHalalas)} SAR</span>
            </div>
            <div className="flex justify-between text-white font-bold text-base pt-1 border-t border-gray-700">
              <span>Total</span>
              <span>{halalasToSar(cart.totals.totalHalalas)} SAR</span>
            </div>
          </div>

          {error && <div className="text-red-400 text-xs mb-2">{error}</div>}

          <div className="space-y-2">
            {/* Pre-order: Create Order */}
            {canCreateOrder && (
              <button
                onClick={handleCreateOrder}
                disabled={cart.items.length === 0 || loading}
                className="w-full touch-target bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
              >
                {loading ? 'Creating...' : 'Create Order'}
              </button>
            )}

            {/* Open + Dirty: Send to Kitchen + Discard (D12, D14) */}
            {currentOrder && currentOrder.status === 'open' && cart.isDirty && (
              <>
                <button
                  onClick={handleSendToKitchen}
                  disabled={syncing || loading}
                  className="w-full touch-target bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
                >
                  {syncing ? 'Syncing...' : 'Send to Kitchen'}
                </button>
                <button
                  onClick={handleDiscard}
                  disabled={syncing || loading}
                  className="w-full touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
                >
                  Discard
                </button>
              </>
            )}

            {/* Open + Clean: Pay / Void (D15) */}
            {showPayVoid && (
              <>
                {permissions.payOrder && (
                  <button
                    onClick={handleOpenPayModal}
                    disabled={loading || cart.items.length === 0}
                    className="w-full touch-target bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
                  >
                    Pay
                  </button>
                )}
                {permissions.voidOrder && (
                  <ConfirmActionButton
                    textContent="Void Order"
                    confirmTextContent="Confirm Void Order"
                    confirmationHoldDuration={2000}
                    onConfirm={handleVoid}
                    disabled={loading}
                    busy={loading}
                    busyTextContent="Voiding..."
                    className="w-full touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
                    confirmClassName="w-full touch-target bg-red-900 hover:bg-red-800 rounded-lg text-sm font-bold text-red-100 py-3"
                  />
                )}
              </>
            )}

            {currentOrder && currentOrder.status === 'paid' && permissions.refundOrder && (
              <button
                onClick={handleOpenRefund}
                disabled={loading || refundLoading}
                className="w-full touch-target bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
              >
                Refund
              </button>
            )}

            {/* OrderActionBar for reprints */}
            {currentOrder && (
              <div className="pt-1">
                <OrderActionBar orderId={currentOrder.id} status={currentOrder.status} />
              </div>
            )}

            {currentOrder && !cart.isDirty && (
              <button
                onClick={() => guardedNavigate(handleNewOrder)}
                className={
                  currentOrder.status === 'paid' ||
                  currentOrder.status === 'voided' ||
                  currentOrder.status === 'refunded'
                    ? 'w-full touch-target bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-bold text-white py-3'
                    : 'w-full touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3'
                }
              >
                New Order
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table picker modal */}
      {showTablePicker && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowTablePicker(false)}
        >
          <div
            className="bg-gray-800 rounded-xl p-4 w-80 max-h-96 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-3">Select Table</h3>
            <div className="grid grid-cols-3 gap-2">
              {tables.map((t) => {
                const occupied = isTableOccupied(t.id);
                const selected = cart.tableId === t.id;
                const openOrder = openOrders.find(
                  (o) => o.tableId != null && Number(o.tableId) === t.id,
                );

                return (
                  <button
                    key={t.id}
                    disabled={occupied}
                    onClick={() => {
                      if (occupied) return;
                      cart.setOrderType('dine_in', t.id);
                      setShowTablePicker(false);
                    }}
                    className={`touch-target py-3 rounded-lg text-sm font-bold ${
                      occupied
                        ? 'bg-gray-800 text-gray-600 border-2 border-amber-700/50 cursor-not-allowed opacity-60'
                        : selected
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span>{t.name}</span>
                    {occupied && openOrder && (
                      <span className="block text-xs text-amber-500 mt-0.5">
                        #{openOrder.orderNo}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Refund modal */}
      {showRefundModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={handleCloseRefund}
        >
          <div
            className="bg-gray-900 rounded-xl p-4 w-96 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {refundLoading || !refundOrder ? (
              <div className="text-sm text-gray-400 text-center py-4">Loading order...</div>
            ) : (
              <RefundPanel
                order={refundOrder}
                onClose={handleCloseRefund}
                onRefunded={() => {
                  handleCloseRefund();
                  client.orders
                    .get(currentOrder!.id)
                    .then((order) => {
                      cart.loadOrder(order);
                      setCurrentOrder({
                        id: order.id,
                        status: order.status,
                        orderNo: order.orderNo,
                      });
                    })
                    .catch(() => {});
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Leave guard dialog (D7) */}
      {showLeaveGuard && (
        <LeaveGuardDialog onKeepEditing={handleKeepEditing} onDiscard={handleDiscardAndNavigate} />
      )}

      {/* Realtime conflict dialog (D8) */}
      {showRealtimeConflict && <RealtimeConflictDialog onDismiss={handleRealtimeConflictDismiss} />}

      {/* Pay modal */}
      {showPayModal && currentOrder && (
        <PayModal
          orderId={currentOrder.id}
          orderTotalHalalas={cart.totals.totalHalalas}
          onPaid={handlePaid}
          onClose={() => setShowPayModal(false)}
        />
      )}
    </div>
  );
}
