import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../api';
import { useCart } from '../hooks/useCart';
import type {
  CategoryResponse,
  ItemResponse,
  TableResponse,
  OrderResponse,
} from '@spicyhome/client-ts';

export function OrderPage() {
  const cart = useCart();
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [items, setItems] = useState<ItemResponse[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [tables, setTables] = useState<TableResponse[]>([]);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<{
    id: number;
    status: string;
    orderNo: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dayOpen, setDayOpen] = useState<boolean | null>(null);
  const [openingCash, setOpeningCash] = useState('');
  const [dayLoading, setDayLoading] = useState(false);

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
  }, []);

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

  const filteredItems = selectedCategory
    ? items.filter((i) => i.categoryId === selectedCategory)
    : items;

  function handleNewOrder() {
    cart.clear();
    setCurrentOrder(null);
    setShowTablePicker(false);
    setSearchParams({}, { replace: true });
  }

  async function handleCreateOrder() {
    if (cart.items.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await client.orders.create({
        type: cart.orderType,
        tableId: cart.orderType === 'dine_in' ? cart.tableId || undefined : undefined,
      });
      setCurrentOrder({ id: res.id, status: 'open', orderNo: res.orderNo });

      for (const item of cart.items) {
        await client.orders.addItem(res.id, {
          itemId: item.itemId,
          qty: item.qty,
          notes: item.notes || undefined,
        });
      }

      const order = await client.orders.get(res.id);
      cart.loadOrder(order);
    } catch (e: any) {
      setError(e.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!currentOrder) return;
    setLoading(true);
    setError('');
    try {
      await client.orders.send(currentOrder.id);
      setCurrentOrder((prev) => (prev ? { ...prev, status: 'sent' } : null));
    } catch (e: any) {
      setError(e.message || 'Failed to send order');
    } finally {
      setLoading(false);
    }
  }

  async function handlePay() {
    if (!currentOrder) return;
    setLoading(true);
    setError('');
    try {
      await client.orders.pay(currentOrder.id);
      setCurrentOrder((prev) => (prev ? { ...prev, status: 'paid' } : null));
    } catch (e: any) {
      setError(e.message || 'Failed to pay order');
    } finally {
      setLoading(false);
    }
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

  const orderReadonly = currentOrder ? currentOrder.status !== 'open' : false;

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
              cart.setOrderType('dine_in', null);
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
          {cart.tableId && (
            <span className="text-sm text-gray-400">
              Table: {tables.find((t) => t.id === cart.tableId)?.name || `#${cart.tableId}`}
            </span>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex overflow-x-auto bg-gray-850 border-b border-gray-700 shrink-0">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`touch-target px-4 py-2 text-sm whitespace-nowrap ${
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
              className={`touch-target px-4 py-2 text-sm whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'text-brand-500 border-b-2 border-brand-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => cart.addItem(item)}
                disabled={orderReadonly}
                className="touch-target flex flex-col items-start bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-xl p-3 text-left disabled:opacity-50"
              >
                <span className="text-sm font-medium text-white">{item.name}</span>
                <span className="text-xs text-brand-400 mt-1">
                  {halalasToSar(item.priceHalalas)} SAR
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 bg-gray-850 flex flex-col border-l border-gray-700 shrink-0">
        <div className="flex-1 overflow-y-auto p-3">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">
            {currentOrder ? `Order #${currentOrder.orderNo}` : 'New Order'}
            {currentOrder && (
              <span className={`ml-2 px-2 py-0.5 rounded text-xs status-${currentOrder.status}`}>
                {currentOrder.status}
              </span>
            )}
          </h2>

          {cart.items.length === 0 ? (
            <div className="text-sm text-gray-500 text-center mt-8">Cart is empty</div>
          ) : (
            <div className="space-y-2">
              {cart.items.map((item) => (
                <div key={item.itemId} className="bg-gray-800 rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white flex-1">{item.name}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {halalasToSar(item.unitPriceHalalas * item.qty)}
                    </span>
                  </div>
                  {!orderReadonly && (
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={() => cart.updateQty(item.itemId, item.qty - 1)}
                        className="touch-target w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white"
                      >
                        -
                      </button>
                      <span className="text-sm text-gray-300 w-7 text-center">{item.qty}</span>
                      <button
                        onClick={() => cart.updateQty(item.itemId, item.qty + 1)}
                        className="touch-target w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white"
                      >
                        +
                      </button>
                      <button
                        onClick={() => cart.removeItem(item.itemId)}
                        className="touch-target w-7 h-7 bg-red-800 hover:bg-red-700 rounded text-xs text-white ml-auto"
                      >
                        ✕
                      </button>
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
            {!currentOrder && (
              <button
                onClick={handleCreateOrder}
                disabled={cart.items.length === 0 || loading}
                className="w-full touch-target bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
              >
                {loading ? 'Creating...' : 'Create Order'}
              </button>
            )}

            {currentOrder && currentOrder.status === 'open' && (
              <>
                <button
                  onClick={handleSend}
                  disabled={loading || cart.items.length === 0}
                  className="w-full touch-target bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
                >
                  {loading ? 'Sending...' : 'Send to Kitchen'}
                </button>
                <button
                  onClick={handleVoid}
                  disabled={loading}
                  className="w-full touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
                >
                  Void Order
                </button>
              </>
            )}

            {currentOrder && currentOrder.status === 'sent' && (
              <>
                <button
                  onClick={handlePay}
                  disabled={loading}
                  className="w-full touch-target bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
                >
                  {loading ? 'Paying...' : 'Pay'}
                </button>
                <button
                  onClick={handleVoid}
                  disabled={loading}
                  className="w-full touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
                >
                  Void Order
                </button>
              </>
            )}

            {(currentOrder?.status === 'paid' || currentOrder?.status === 'voided') && (
              <button
                onClick={handleNewOrder}
                className="w-full touch-target bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-bold text-white py-3"
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
              {tables.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    cart.setOrderType('dine_in', t.id);
                    setShowTablePicker(false);
                  }}
                  className={`touch-target py-3 rounded-lg text-sm font-bold ${
                    cart.tableId === t.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
