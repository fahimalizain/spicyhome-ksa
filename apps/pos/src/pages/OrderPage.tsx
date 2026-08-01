import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../api';
import { useCart } from '../hooks/useCart';
import { usePermissions } from '../hooks/usePermissions';
import { RefundPanel } from '../components/RefundPanel';
import { OrderActionBar } from '../components/OrderActionBar';
import { AddPaymentModal } from '../components/orders/AddPaymentModal';
import { OskDock } from '../components/on-screen-keyboard/OskDock';
import { PartnerPriceModal } from '../components/orders/PartnerPriceModal';
import { ZatcaClearanceModal } from '../components/orders/ZatcaClearanceModal';
import {
  StandardInvoiceBuyerForm,
  emptyStandardInvoiceBuyer,
  validateStandardBuyer,
  type ZatcaBuyerDetails,
} from '../components/orders/StandardInvoiceBuyerForm';
import { ConfirmActionButton } from '../components/ConfirmActionButton';
import { filterMenuItems } from '../lib/filterMenuItems';
import { hasUnsentKitchenDeltas } from '../lib/kitchen-printed';
import { calcOutstandingHalalas } from '../lib/order-payments';
import type { CartItem } from '../hooks/useCart';
import type {
  CategoryResponse,
  ItemResponse,
  TableResponse,
  OrderResponse,
  OrderSummaryResponse,
  OrderPaymentResponse,
  OrderEventResponse,
  DeliveryPartnerResponse,
} from '@spicyhome/client-ts';

type OrderTab = 'items' | 'payments' | 'summary';

const TAB_LABELS: Record<OrderTab, string> = {
  items: 'Items',
  payments: 'Payments',
  summary: 'Summary',
};

/** Compact HH:MM (browser-local) from a Unix-seconds epoch. */
function formatPaymentTime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

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
  // Full catalog (incl. inactive items) — the override floor applies even
  // when an item is inactive (ADR 0007), so the price modal needs it.
  const [catalogItems, setCatalogItems] = useState<ItemResponse[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [tables, setTables] = useState<TableResponse[]>([]);
  const [deliveryPartners, setDeliveryPartners] = useState<DeliveryPartnerResponse[]>([]);
  const [openOrders, setOpenOrders] = useState<OrderSummaryResponse[]>([]);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showPartnerPicker, setShowPartnerPicker] = useState(false);
  const [showPartnerPriceModal, setShowPartnerPriceModal] = useState(false);
  const [externalRefDraft, setExternalRefDraft] = useState('');
  // Order notes (order-level) draft — synced with the cart, saved on blur/Enter
  const [orderNotesDraft, setOrderNotesDraft] = useState('');

  // Item-level notes editor modal (cart rows)
  const [notesEditItem, setNotesEditItem] = useState<CartItem | null>(null);
  const [notesEditText, setNotesEditText] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOrder, setRefundOrder] = useState<OrderResponse | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<{
    id: number;
    status: string;
    documentId: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [metaUpdating, setMetaUpdating] = useState(false);
  const [error, setError] = useState('');
  const [dayOpen, setDayOpen] = useState<boolean | null>(null);
  const [openingCash, setOpeningCash] = useState('');
  const [dayLoading, setDayLoading] = useState(false);

  // ADR 0006: server-side money / ledger view (last hydrated order)
  const [payments, setPayments] = useState<OrderPaymentResponse[]>([]);
  const [orderEvents, setOrderEvents] = useState<OrderEventResponse[]>([]);
  const [serverTotals, setServerTotals] = useState({
    subtotalHalalas: 0,
    vatHalalas: 0,
    totalHalalas: 0,
  });

  // Right panel tabs + payment modal
  const [activeTab, setActiveTab] = useState<OrderTab>('items');
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [sendingKitchen, setSendingKitchen] = useState(false);

  // Open order receipt (non-ZATCA guest slip, Summary tab)
  const [printingOpenReceipt, setPrintingOpenReceipt] = useState(false);
  const [openReceiptMessage, setOpenReceiptMessage] = useState('');

  // Standard invoice state (Summary tab)
  const [isStandardInvoice, setIsStandardInvoice] = useState(false);
  const [buyer, setBuyer] = useState<ZatcaBuyerDetails>(emptyStandardInvoiceBuyer());
  const [buyerErrors, setBuyerErrors] = useState<Partial<Record<keyof ZatcaBuyerDetails, string>>>(
    {},
  );
  const [showClearance, setShowClearance] = useState(false);

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

  /**
   * Hydrate cart + server-side ledger state from one OrderResponse (ADR 0006).
   * Call this everywhere an order is (re)fetched so payments/events/server
   * totals always reflect the last server snapshot.
   */
  function hydrateOrder(order: OrderResponse) {
    cart.loadOrder(order);
    setPayments(order.payments || []);
    setOrderEvents(order.events || []);
    setServerTotals({
      subtotalHalalas: order.subtotalHalalas,
      vatHalalas: order.vatHalalas,
      totalHalalas: order.totalHalalas,
    });
    setCurrentOrder({ id: order.id, status: order.status, documentId: order.documentId });
  }

  /** Refetch + hydrate the current order (used after submit/refund/conflict). */
  async function refreshOrder() {
    if (!currentOrder) return;
    try {
      const order = await client.orders.get(currentOrder.id);
      hydrateOrder(order);
      loadOpenOrders();
    } catch {
      // Keep current state — the caller surfaces the error
    }
  }

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
          hydrateOrder(order);
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
    loadDeliveryPartners();
    loadOpenOrders();
  }, []);

  // Keep the external-ref draft in sync with the cart (hydration / new order).
  // The PATCH only fires on blur/Enter, never per keystroke.
  useEffect(() => {
    setExternalRefDraft(cart.deliveryExternalRef ?? '');
  }, [cart.deliveryExternalRef]);

  // Keep the order-notes draft in sync with the cart (hydration / new order).
  // The PATCH only fires on blur/Enter, never per keystroke.
  useEffect(() => {
    setOrderNotesDraft(cart.orderNotes);
  }, [cart.orderNotes]);

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
          return;
        }

        // Decision A: remote type/table (or item) changes while the cart is
        // clean are hydrated silently so the controls reflect the server.
        if (!cart.isDirty && order.updatedAt !== cart.serverUpdatedAt) {
          hydrateOrder(order);
          loadOpenOrders();
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
      setCatalogItems(allItems);
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

  async function loadDeliveryPartners() {
    try {
      const res = await client.deliveryPartners.listEnabled();
      setDeliveryPartners(res);
    } catch {
      // partner picker optional — the order still works without it
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
    return openOrders.some(
      (o) =>
        o.tableId != null &&
        Number(o.tableId) === tableId &&
        (!currentOrder || o.id !== currentOrder.id),
    );
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
    setShowPartnerPicker(false);
    setShowPartnerPriceModal(false);
    setExternalRefDraft('');
    setOrderNotesDraft('');
    setShowRefundModal(false);
    setRefundOrder(null);
    setItemSearch('');
    setPayments([]);
    setOrderEvents([]);
    setServerTotals({ subtotalHalalas: 0, vatHalalas: 0, totalHalalas: 0 });
    setActiveTab('items');
    setShowAddPaymentModal(false);
    setIsStandardInvoice(false);
    setBuyer(emptyStandardInvoiceBuyer());
    setBuyerErrors({});
    setShowClearance(false);
    setPrintingOpenReceipt(false);
    setOpenReceiptMessage('');
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
    let createdId: number | null = null;
    let partnerPatchFailed = false;
    try {
      const res = await client.orders.create({
        type: cart.orderType,
        tableId: cart.orderType === 'dine_in' ? cart.tableId || undefined : undefined,
        notes: cart.orderNotes.trim() ? cart.orderNotes : undefined,
      });
      createdId = res.id;
      setCurrentOrder({ id: res.id, status: 'open', documentId: res.documentId });

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
            // Send '' (not undefined) for blank notes — undefined is omitted
            // by JSON.stringify and the server would keep the current notes.
            notes: item.notes,
          })),
        });

        // ADR 0007: POST /orders does not accept deliveryPartnerId, so a
        // partner staged pre-create is applied via PATCH /orders/:id/partner
        // right after create+sync — the same write path as existing orders.
        const stagedPartnerId = cart.deliveryPartnerId;
        if (stagedPartnerId) {
          try {
            const partnerRes = await client.orders.updatePartner(res.id, {
              baseUpdatedAt: syncRes.updatedAt,
              deliveryPartnerId: stagedPartnerId,
              deliveryExternalRef: cart.deliveryExternalRef ?? undefined,
            });
            hydrateOrder(partnerRes);
          } catch (e) {
            partnerPatchFailed = true;
            throw e;
          }
        } else {
          hydrateOrder(syncRes);
        }
      } else {
        hydrateOrder(fetchedOrder);
      }
    } catch (e: any) {
      // If create+sync succeeded but the partner patch failed, hydrate the
      // server truth (partner null) so the UI never shows a partner the
      // order does not have. If the sync itself failed, keep the cart for
      // retry (orderId stays for retry).
      if (partnerPatchFailed && createdId != null) {
        try {
          const order = await client.orders.get(createdId);
          hydrateOrder(order);
        } catch {
          // keep the error message below
        }
      }
      setError(e.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  }

  // ── Save Items (ADR 0006: syncItems persists the cart, never kitchen-prints) ──

  async function handleSaveItems() {
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
          // Send '' (not undefined) for blank notes — undefined is omitted
          // by JSON.stringify and the server would keep the current notes.
          notes: item.notes,
        })),
      });
      hydrateOrder(syncRes);
    } catch (e: any) {
      // Check for 409 conflict
      if (e.message?.includes('409') || e.message?.includes('modified by another terminal')) {
        // Refetch and hydrate
        try {
          const order = await client.orders.get(currentOrder.id);
          hydrateOrder(order);
          setError('Order was modified elsewhere. Your local changes have been reset.');
        } catch {
          setError(e.message || 'Failed to save items');
        }
      } else {
        setError(e.message || 'Failed to save items');
      }
    } finally {
      setSyncing(false);
    }
  }

  // ── Discard ──

  function handleDiscard() {
    cart.discard();
  }

  // ── Send to Kitchen (ADR 0006: explicit differential print, Items tab) ──

  async function handleSendToKitchen() {
    if (!currentOrder || currentOrder.status !== 'open') return;
    if (cart.isDirty) return; // mutually exclusive with Save Items

    setSendingKitchen(true);
    setError('');
    try {
      const res = await client.orders.sendToKitchen(currentOrder.id);
      // Events now carry kitchen_print_enqueued lines → unsent deltas drop
      hydrateOrder(res);
    } catch (e: any) {
      setError(e.message || 'Failed to send to kitchen');
    } finally {
      setSendingKitchen(false);
    }
  }

  // ── Payments (ADR 0006: append-only ledger, Payments tab) ──

  /** Server view: total − SUM(payments). Negative = temporary overpay. */
  const outstandingHalalas = calcOutstandingHalalas(serverTotals.totalHalalas, payments);
  /** Kitchen delta view over the current (clean) cart vs the event ledger. */
  const hasUnsentKitchen = hasUnsentKitchenDeltas(cart.items, orderEvents);

  function handlePaymentAdded(order: OrderResponse) {
    hydrateOrder(order);
    loadOpenOrders();
  }

  // ── Submit (ADR 0006: the only open → paid path, Summary tab) ──

  async function handleSubmit() {
    if (!currentOrder || currentOrder.status !== 'open') return;
    if (cart.isDirty || outstandingHalalas !== 0) return;
    if (cart.serverUpdatedAt == null || cart.items.length === 0) return;

    // Validate buyer if standard invoice is enabled
    if (isStandardInvoice) {
      const fieldErrors = validateStandardBuyer(buyer);
      if (Object.keys(fieldErrors).length > 0) {
        setBuyerErrors(fieldErrors);
        return;
      }
    }

    setSubmittingOrder(true);
    setError('');
    setBuyerErrors({});
    try {
      const payload: {
        baseUpdatedAt: number;
        isStandardInvoice?: boolean;
        zatcaBuyerDetails?: ZatcaBuyerDetails;
      } = { baseUpdatedAt: cart.serverUpdatedAt };
      if (isStandardInvoice) {
        payload.isStandardInvoice = true;
        payload.zatcaBuyerDetails = buyer;
      }
      await client.orders.submit(currentOrder.id, payload);

      if (isStandardInvoice) {
        // Delegate to the clearance modal; it refreshes on done
        setShowClearance(true);
      } else {
        // Simplified: paid + receipt — hydrate the authoritative state
        await refreshOrder();
      }
    } catch (e: any) {
      if (e.message?.includes('409') || e.message?.includes('modified by another terminal')) {
        await refreshOrder();
        setError('Order was modified elsewhere. Your local changes have been reset.');
      } else {
        setError(e.message || 'Failed to submit order');
      }
    } finally {
      setSubmittingOrder(false);
    }
  }

  // ── Open order receipt (non-ZATCA guest slip) ──

  /**
   * Print the non-ZATCA "Open Order Receipt" so the guest can pay at the
   * table with a portable ATM-POS. Only meaningful while the order is open,
   * clean, and non-empty (see canPrintOpenReceipt).
   */
  async function handlePrintOpenReceipt() {
    if (!currentOrder || currentOrder.status !== 'open') return;
    setPrintingOpenReceipt(true);
    setError('');
    setOpenReceiptMessage('');
    try {
      const res = await client.orders.reprint(currentOrder.id, { target: 'open_receipt' });
      if (res && res.success === false) {
        setError((res.errors || []).join(' ') || 'Failed to print open receipt');
      } else {
        setOpenReceiptMessage('Open receipt printed');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to print open receipt');
    } finally {
      setPrintingOpenReceipt(false);
    }
  }

  // ── Void ──

  async function handleVoid() {
    if (!currentOrder) return;
    setLoading(true);
    setError('');
    try {
      await client.orders.void(currentOrder.id);
      setCurrentOrder((prev) => (prev ? { ...prev, status: 'voided' } : null));
    } catch (e: any) {
      // Server rejects when payments net ≠ 0 — surface the guidance
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

  // ── Item notes (cart rows) ──

  function handleOpenNotesEditor(cartItem: CartItem) {
    setNotesEditItem(cartItem);
    setNotesEditText(cartItem.notes);
  }

  function handleSaveNotesEditor() {
    if (notesEditItem) {
      cart.updateNotes(notesEditItem.itemId, notesEditText);
    }
    setNotesEditItem(null);
  }

  // ── Type / Table change (#109) ──

  /**
   * PATCH the open order's type/table. Returns true on success, false on
   * failure (error message surfaced via setError). On 409 (occupied or stale)
   * the order is refetched and hydrated when the cart is clean.
   */
  async function handleUpdateOrderMeta(
    type: 'dine_in' | 'takeaway',
    tableId?: number,
  ): Promise<boolean> {
    if (!currentOrder || currentOrder.status !== 'open') return false;
    if (cart.serverUpdatedAt == null) return false;

    setMetaUpdating(true);
    setError('');
    try {
      const res = await client.orders.update(currentOrder.id, {
        baseUpdatedAt: cart.serverUpdatedAt,
        type,
        ...(tableId !== undefined ? { tableId } : {}),
      });
      hydrateOrder(res);
      loadOpenOrders();
      return true;
    } catch (e: any) {
      // 409 occupied or stale: keep the previous type/table. Refetch + hydrate
      // when clean so the controls reflect the server state.
      if (e.message?.includes('409') || e.message?.includes('modified by another terminal')) {
        try {
          const order = await client.orders.get(currentOrder.id);
          if (order.status !== 'open') {
            setCurrentOrder({ id: order.id, status: order.status, documentId: order.documentId });
          } else if (!cart.isDirty) {
            hydrateOrder(order);
            loadOpenOrders();
          }
        } catch {
          // Ignore refetch errors — the error message below is the source of truth
        }
      }
      setError(e.message || 'Failed to update order');
      return false;
    } finally {
      setMetaUpdating(false);
    }
  }

  function handleSelectTakeaway() {
    // Pre-create: local-only staging as today
    if (!currentOrder) {
      cart.setOrderType('takeaway', null);
      return;
    }
    if (currentOrder.status !== 'open') return;
    // Already takeaway → no-op
    if (cart.orderType === 'takeaway') return;
    void handleUpdateOrderMeta('takeaway');
  }

  function handleSelectDineIn() {
    // Pre-create: local-only staging as today
    if (!currentOrder) {
      if (cart.orderType !== 'dine_in') {
        cart.setOrderType('dine_in', null);
      }
      setShowTablePicker(true);
      return;
    }
    if (currentOrder.status !== 'open') return;
    // Open order: always open the table picker; the PATCH happens only after
    // the staff picks a table (single PATCH with type + tableId).
    setShowTablePicker(true);
  }

  async function handleTableSelect(t: TableResponse) {
    if (isTableOccupied(t.id)) return;
    if (!currentOrder) {
      cart.setOrderType('dine_in', t.id);
      setShowTablePicker(false);
      return;
    }
    if (currentOrder.status !== 'open') return;
    const ok = await handleUpdateOrderMeta('dine_in', t.id);
    if (ok) setShowTablePicker(false);
  }

  // ── Delivery partner (ADR 0007) ──

  /**
   * PATCH the open order's delivery partner via /orders/:id/partner.
   * `deliveryPartnerId: null` clears the partner (server resets line prices
   * to the live catalog and force-nulls the external ref). Returns true on
   * success; on 409 (stale) the order is refetched and hydrated when the
   * cart is clean — same conflict UX as the type/table change.
   */
  async function handleUpdatePartner(partnerId: string | null): Promise<boolean> {
    if (!currentOrder || currentOrder.status !== 'open') return false;
    if (cart.serverUpdatedAt == null) return false;

    setMetaUpdating(true);
    setError('');
    try {
      const res = await client.orders.updatePartner(currentOrder.id, {
        baseUpdatedAt: cart.serverUpdatedAt,
        deliveryPartnerId: partnerId,
        // Keep an existing ref when swapping partners; the server force-nulls
        // it when the partner is cleared.
        ...(partnerId != null && cart.deliveryExternalRef != null
          ? { deliveryExternalRef: cart.deliveryExternalRef }
          : {}),
      });
      hydrateOrder(res);
      loadOpenOrders();
      return true;
    } catch (e: any) {
      if (e.message?.includes('409') || e.message?.includes('modified by another terminal')) {
        try {
          const order = await client.orders.get(currentOrder.id);
          if (order.status !== 'open') {
            setCurrentOrder({ id: order.id, status: order.status, documentId: order.documentId });
          } else if (!cart.isDirty) {
            hydrateOrder(order);
            loadOpenOrders();
          }
        } catch {
          // Ignore refetch errors — the error message below is the source of truth
        }
      }
      setError(e.message || 'Failed to update delivery partner');
      return false;
    } finally {
      setMetaUpdating(false);
    }
  }

  /** Picker option handler: local staging pre-create, PATCH on open orders. */
  async function handleSelectPartner(partnerId: string | null): Promise<boolean> {
    if (!currentOrder) {
      // Pre-create: local-only staging, sent on create (create → sync → PATCH).
      if (partnerId == null) {
        // None clears the partner and the ref (mirrors server force-null).
        cart.setDeliveryPartner(null, null, null);
      } else {
        const partner = deliveryPartners.find((p) => p.id === partnerId);
        cart.setDeliveryPartner(partnerId, partner?.title ?? null, cart.deliveryExternalRef);
      }
      return true;
    }
    if (currentOrder.status !== 'open') return false;
    return handleUpdatePartner(partnerId);
  }

  /**
   * Save the external-ref draft. Explicit save on blur/Enter only — never per
   * keystroke, so the PATCH is not spammed. Empty input sends null (server
   * force-nulls a ref without a partner).
   */
  async function handleSaveExternalRef(): Promise<void> {
    const ref = externalRefDraft.trim();
    const currentRef = cart.deliveryExternalRef ?? '';
    if (ref === currentRef) return; // unchanged → no PATCH

    if (!currentOrder) {
      cart.setDeliveryExternalRef(ref || null);
      return;
    }
    if (currentOrder.status !== 'open' || cart.serverUpdatedAt == null) return;

    setMetaUpdating(true);
    setError('');
    try {
      const res = await client.orders.updatePartner(currentOrder.id, {
        baseUpdatedAt: cart.serverUpdatedAt,
        deliveryExternalRef: ref || null,
      });
      hydrateOrder(res);
    } catch (e: any) {
      if (e.message?.includes('409') || e.message?.includes('modified by another terminal')) {
        try {
          const order = await client.orders.get(currentOrder.id);
          if (order.status !== 'open') {
            setCurrentOrder({ id: order.id, status: order.status, documentId: order.documentId });
          } else if (!cart.isDirty) {
            hydrateOrder(order);
            loadOpenOrders();
          }
        } catch {
          // Ignore refetch errors — the error message below is the source of truth
        }
      }
      setError(e.message || 'Failed to save external ref');
    } finally {
      setMetaUpdating(false);
    }
  }

  /**
   * Save the order-notes draft. Explicit save on blur/Enter only — never per
   * keystroke, so the PATCH is not spammed. Open orders PATCH meta with the
   * current type/table + notes (notes-only change: no kitchen auto-print).
   * Pre-create carts stage locally and send notes with the create DTO.
   */
  async function handleSaveOrderNotes(): Promise<void> {
    const notes = orderNotesDraft.trim();
    if (notes === cart.orderNotes.trim()) return; // unchanged → no PATCH

    if (!currentOrder) {
      cart.setOrderNotes(notes);
      return;
    }
    if (currentOrder.status !== 'open' || cart.serverUpdatedAt == null) return;

    setMetaUpdating(true);
    setError('');
    try {
      const res = await client.orders.update(currentOrder.id, {
        baseUpdatedAt: cart.serverUpdatedAt,
        type: cart.orderType,
        ...(cart.tableId != null ? { tableId: cart.tableId } : {}),
        notes: notes || null,
      });
      hydrateOrder(res);
    } catch (e: any) {
      if (e.message?.includes('409') || e.message?.includes('modified by another terminal')) {
        try {
          const order = await client.orders.get(currentOrder.id);
          if (order.status !== 'open') {
            setCurrentOrder({ id: order.id, status: order.status, documentId: order.documentId });
          } else if (!cart.isDirty) {
            hydrateOrder(order);
            loadOpenOrders();
          }
        } catch {
          // Ignore refetch errors — the error message below is the source of truth
        }
      }
      setError(e.message || 'Failed to save order notes');
    } finally {
      setMetaUpdating(false);
    }
  }

  // ── Partner price overrides (ADR 0007, Phase 7) ──

  /**
   * Live catalog floor by item id for the price modal — built from the FULL
   * menu response (incl. inactive items, whose catalog price still floors
   * overrides server-side).
   */
  const floorByItemId: Record<number, number> = Object.fromEntries(
    catalogItems.map((i) => [i.id, i.priceHalalas]),
  );

  /** On final save success: hydrate the cart from the returned order. */
  function handlePartnerPricesSaved(order: OrderResponse) {
    hydrateOrder(order);
    loadOpenOrders();
    setShowPartnerPriceModal(false);
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
            hydrateOrder(order);
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
  const openOrder = currentOrder ? currentOrder.status === 'open' : false;

  // Type toggle + table button enablement (#109):
  // - Pre-create (no currentOrder): editable as today (local staging) —
  //   ungated by update_order (same as pre-#109).
  // - Existing open order: only when open + updateOrder + cart clean +
  //   not loading/syncing/meta-updating.
  const canEditTypeTable =
    !loading &&
    !syncing &&
    !metaUpdating &&
    !orderReadonly &&
    (!currentOrder
      ? true // pre-create: local staging only (unchanged from pre-#109)
      : permissions.updateOrder && !cart.isDirty);

  // ADR 0006 gating (matrix in the ADR):
  // - Add Payment: open + clean + items + payOrder + not busy
  const canAddPayment =
    openOrder &&
    !cart.isDirty &&
    cart.items.length > 0 &&
    permissions.payOrder &&
    !loading &&
    !syncing &&
    !metaUpdating;

  // - Submit: open + clean + exact balance + items + payOrder + not busy
  const canSubmit =
    openOrder &&
    !cart.isDirty &&
    outstandingHalalas === 0 &&
    cart.items.length > 0 &&
    permissions.payOrder &&
    !loading &&
    !syncing &&
    !submittingOrder;

  // - Send to Kitchen: open + clean + unsent deltas + updateOrder + not busy
  const canSendToKitchen =
    openOrder &&
    !cart.isDirty &&
    hasUnsentKitchen &&
    permissions.updateOrder &&
    !loading &&
    !syncing;

  // - Print Open Receipt: open + clean + non-empty + updateOrder + not busy.
  //   Non-ZATCA guest slip — the button stays visible (disabled) while the
  //   print is in flight so the "Printing..." state is shown.
  const canPrintOpenReceipt =
    openOrder &&
    !cart.isDirty &&
    cart.items.length > 0 &&
    permissions.updateOrder &&
    !loading &&
    !syncing &&
    !metaUpdating &&
    !submittingOrder &&
    !printingOpenReceipt;

  // - Void: open + clean + voidOrder (server rejects when payments net ≠ 0)
  const canVoid = openOrder && !cart.isDirty && permissions.voidOrder && !loading;

  /**
   * "Edit partner prices" button gate (ADR 0007, Phase 7): open order +
   * partner set + update permission + clean cart (the modal edits server
   * lines, so a dirty cart must be saved first) + not busy.
   */
  const canEditPartnerPrices =
    openOrder &&
    cart.deliveryPartnerId != null &&
    permissions.updateOrder &&
    !cart.isDirty &&
    !loading &&
    !syncing &&
    !metaUpdating;

  // Summary footer secondary actions: Print Open Receipt + Void Order row
  const showPrint = canPrintOpenReceipt || printingOpenReceipt;
  const showVoid = openOrder && canVoid;

  // Summary totals: prefer server totals when clean; local + warning when dirty
  const summaryTotals = cart.isDirty
    ? cart.totals
    : {
        subtotalHalalas: serverTotals.subtotalHalalas,
        vatHalalas: serverTotals.vatHalalas,
        totalHalalas: serverTotals.totalHalalas,
      };

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
        <div data-osk-scope className="bg-gray-800 rounded-xl p-8 w-[28rem] text-center">
          <h2 className="text-xl font-bold text-white mb-4">Open Business Day</h2>
          <p className="text-sm text-gray-400 mb-6">
            No business day is currently open. Enter the opening cash to start the day.
          </p>

          <div className="mb-4">
            <label className="block text-sm text-gray-300 mb-2">Opening Cash (SAR)</label>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white text-center text-xl"
            />
          </div>

          {/* Inline keyboard dock: the numpad portals in here while the
              opening cash field is focused. Zero footprint otherwise. */}
          <OskDock size="lg" className="mt-4" />

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
            onClick={handleSelectDineIn}
            className={`touch-target px-4 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              cart.orderType === 'dine_in' ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
            disabled={!canEditTypeTable}
          >
            Dine-in
          </button>
          <button
            onClick={handleSelectTakeaway}
            className={`touch-target px-4 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              cart.orderType === 'takeaway'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-700 text-gray-300'
            }`}
            disabled={!canEditTypeTable}
          >
            Takeaway
          </button>
          {cart.orderType === 'dine_in' && (
            <button
              onClick={() => setShowTablePicker(true)}
              disabled={!canEditTypeTable}
              className={`touch-target px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
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
          {/* Delivery partner (ADR 0007) — takeaway only; dine-in hides it */}
          {cart.orderType === 'takeaway' && (
            <>
              <button
                onClick={() => setShowPartnerPicker(true)}
                disabled={!canEditTypeTable}
                className={`touch-target px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                  cart.deliveryPartnerId
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-brand-700/50 text-brand-300 border border-brand-600/50 hover:bg-brand-700'
                }`}
              >
                {cart.deliveryPartnerId
                  ? `Partner: ${cart.deliveryPartnerTitle || cart.deliveryPartnerId}`
                  : 'Delivery partner…'}
              </button>
              {cart.deliveryPartnerId && (
                <input
                  type="text"
                  value={externalRefDraft}
                  onChange={(e) => setExternalRefDraft(e.target.value)}
                  onBlur={() => void handleSaveExternalRef()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  disabled={!canEditTypeTable}
                  placeholder="App order #"
                  className="w-44 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-brand-500 disabled:opacity-50"
                />
              )}
              {/* ADR 0007 Phase 7: explicit per-line price override modal */}
              {canEditPartnerPrices && (
                <button
                  onClick={() => setShowPartnerPriceModal(true)}
                  className="touch-target px-3 py-1.5 bg-brand-700/40 text-brand-200 border border-brand-600/50 hover:bg-brand-700 rounded-lg text-sm whitespace-nowrap"
                >
                  Edit partner prices
                </button>
              )}
            </>
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

      {/* Right: Cart (tabbed panel, ADR 0006) */}
      <div className="w-80 bg-gray-850 flex flex-col border-l border-gray-700 shrink-0 min-h-0">
        {/* Header — pinned */}
        <div className="shrink-0 px-3 pt-3 pb-2 border-b border-gray-700/80">
          <h2 className="text-sm font-semibold text-gray-300">
            {currentOrder ? `Order ${currentOrder.documentId}` : 'New Order'}
            {currentOrder && (
              <span className={`ml-2 px-2 py-0.5 rounded text-xs status-${currentOrder.status}`}>
                {currentOrder.status}
              </span>
            )}
            {cart.isDirty && <span className="ml-2 text-xs text-amber-400">Unsent changes</span>}
          </h2>
          {cart.deliveryPartnerTitle && (
            <div className="text-xs text-gray-500 mt-1">
              {cart.deliveryPartnerTitle}
              {cart.deliveryExternalRef ? ` · Ref ${cart.deliveryExternalRef}` : ''}
            </div>
          )}
          {/* Order notes (order-level remarks) — staged pre-create, PATCHed on
              blur/Enter for open orders. Disabled while busy / readonly / dirty
              (same gate as the external-ref field). */}
          <input
            type="text"
            value={orderNotesDraft}
            onChange={(e) => setOrderNotesDraft(e.target.value)}
            onBlur={() => void handleSaveOrderNotes()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={!canEditTypeTable}
            placeholder="Order notes"
            className="w-full mt-2 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-brand-500 disabled:opacity-50"
          />
        </div>

        {/* Tabs — pinned, only for existing orders (pre-create stays Items-only) */}
        {currentOrder && (
          <div className="shrink-0 flex border-b border-gray-700">
            {(Object.keys(TAB_LABELS) as OrderTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`touch-target flex-1 py-2 text-sm font-medium ${
                  activeTab === tab
                    ? 'text-brand-500 border-b-2 border-brand-500'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        )}

        {/* Tab body — only this scrolls */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-2">
          {/* ── Items tab ── */}
          {(!currentOrder || activeTab === 'items') && (
            <>
              {cart.items.length === 0 ? (
                <div className="text-sm text-gray-500 text-center mt-8">Cart is empty</div>
              ) : (
                <div className="space-y-2">
                  {cart.items.map((item, idx) => (
                    <div
                      key={
                        item.orderItemId != null
                          ? `oi-${item.orderItemId}`
                          : `mi-${item.itemId}-${idx}`
                      }
                      className="bg-gray-800 rounded-lg p-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white flex-1">{item.name}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {halalasToSar(item.unitPriceHalalas * item.qty)}
                        </span>
                      </div>
                      {item.notes && (
                        <span className="text-xs text-gray-400 block">{item.notes}</span>
                      )}
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
                          {/* Item notes editor — touch-friendly pencil */}
                          <button
                            onClick={() => handleOpenNotesEditor(item)}
                            disabled={cartDisabled}
                            title={item.notes ? 'Edit notes' : 'Add notes'}
                            className="touch-target w-7 h-7 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-xs text-gray-300"
                          >
                            ✎
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
            </>
          )}

          {/* ── Payments tab ── */}
          {currentOrder && activeTab === 'payments' && (
            <>
              {/* Outstanding — from SERVER totals and SERVER payment ledger */}
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">Outstanding</div>
                <div
                  className={`text-2xl font-bold ${
                    outstandingHalalas === 0
                      ? 'text-green-400'
                      : outstandingHalalas < 0
                        ? 'text-red-400'
                        : 'text-amber-400'
                  }`}
                >
                  {halalasToSar(Math.abs(outstandingHalalas))} SAR
                  {outstandingHalalas < 0 && (
                    <span className="text-xs text-red-400 ml-2">(overpaid)</span>
                  )}
                </div>
              </div>

              {/* Append-only log, oldest-first (server returns payments by id) */}
              {payments.length === 0 ? (
                <div className="text-sm text-gray-500 text-center mt-8">No payments yet</div>
              ) : (
                <div className="space-y-1">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0 mr-2">
                        <div className="text-sm text-white truncate">{p.methodTitle}</div>
                        <div className="text-xs text-gray-500">
                          {formatPaymentTime(p.createdAt)}
                          {p.tenderedHalalas != null &&
                            ` · Tendered ${halalasToSar(p.tenderedHalalas)}`}
                          {p.changeHalalas != null &&
                            p.changeHalalas > 0 &&
                            ` · Change ${halalasToSar(p.changeHalalas)}`}
                        </div>
                      </div>
                      <div
                        className={`text-sm font-mono shrink-0 ${
                          p.amountHalalas < 0 ? 'text-red-400' : 'text-white'
                        }`}
                      >
                        {p.amountHalalas < 0 ? '−' : ''}
                        {halalasToSar(Math.abs(p.amountHalalas))} SAR
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Summary tab ── */}
          {currentOrder && activeTab === 'summary' && (
            <>
              {cart.isDirty && (
                <div className="text-amber-400 text-xs mb-3">
                  Cart has unsent changes — totals below are from your local cart and may be stale.
                  Save items first.
                </div>
              )}
              <div className="space-y-1 text-sm mb-3">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal</span>
                  <span>{halalasToSar(summaryTotals.subtotalHalalas)} SAR</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>VAT (15%)</span>
                  <span>{halalasToSar(summaryTotals.vatHalalas)} SAR</span>
                </div>
                <div className="flex justify-between text-white font-bold text-base pt-1 border-t border-gray-700">
                  <span>Total</span>
                  <span>{halalasToSar(summaryTotals.totalHalalas)} SAR</span>
                </div>
                <div className="flex justify-between text-gray-400 pt-1">
                  <span>Outstanding</span>
                  <span
                    className={
                      outstandingHalalas === 0
                        ? 'text-green-400 font-bold'
                        : outstandingHalalas < 0
                          ? 'text-red-400 font-bold'
                          : 'text-amber-400 font-bold'
                    }
                  >
                    {halalasToSar(outstandingHalalas)} SAR
                  </span>
                </div>
              </div>

              {/* Standard invoice toggle + buyer form (open orders only) */}
              {openOrder && (
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
                    <div className="mt-2 border-t border-gray-700 pt-3">
                      <StandardInvoiceBuyerForm
                        value={buyer}
                        onChange={(next) => {
                          setBuyer(next);
                          // Clear individual field error on change
                          if (buyerErrors) {
                            setBuyerErrors({});
                          }
                        }}
                        disabled={submittingOrder}
                        errors={buyerErrors}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Tab footer — pinned, tab-specific actions */}
        <div className="border-t border-gray-700 p-3 shrink-0">
          {error && <div className="text-red-400 text-xs mb-2">{error}</div>}

          {/* ── Items footer ── */}
          {(!currentOrder || activeTab === 'items') && (
            <>
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>Total</span>
                <span className="text-white font-bold">
                  {halalasToSar(cart.totals.totalHalalas)} SAR
                </span>
              </div>
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

                {/* Open + Dirty: Save Items + Discard (D12, D14; ADR 0006) */}
                {openOrder && cart.isDirty && (
                  <>
                    <button
                      onClick={handleSaveItems}
                      disabled={syncing || loading}
                      className="w-full touch-target bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
                    >
                      {syncing ? 'Syncing...' : 'Save Items'}
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

                {/* Open + Clean + unsent kitchen deltas: Send to Kitchen (ADR 0006) */}
                {canSendToKitchen && (
                  <button
                    onClick={handleSendToKitchen}
                    disabled={sendingKitchen || loading || syncing}
                    className="w-full touch-target bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
                  >
                    {sendingKitchen ? 'Sending...' : 'Send to Kitchen'}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Payments footer ── */}
          {currentOrder && activeTab === 'payments' && (
            <div className="space-y-2">
              {openOrder && (
                <>
                  {cart.isDirty && (
                    <div className="text-amber-400 text-xs">Save items before adding payments</div>
                  )}
                  <button
                    onClick={() => setShowAddPaymentModal(true)}
                    disabled={!canAddPayment}
                    className="w-full touch-target bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
                  >
                    Add Payment
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Summary footer ── */}
          {currentOrder && activeTab === 'summary' && (
            <div className="space-y-2">
              {/* Submit: the only open → paid path (ADR 0006) */}
              {openOrder && (
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="w-full touch-target bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
                >
                  {submittingOrder ? 'Submitting...' : 'Submit'}
                </button>
              )}

              {/* Print Open Receipt (non-ZATCA guest slip) + Void Order side-by-side */}
              {(showPrint || showVoid) && (
                <div className="flex gap-2">
                  {showPrint && (
                    <button
                      onClick={handlePrintOpenReceipt}
                      disabled={printingOpenReceipt}
                      className="flex-1 min-w-0 touch-target bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-gray-300 py-3"
                    >
                      {printingOpenReceipt ? 'Printing...' : 'Print Open Receipt'}
                    </button>
                  )}
                  {showVoid && (
                    <ConfirmActionButton
                      textContent="Void Order"
                      confirmTextContent="Confirm Void Order"
                      onConfirm={handleVoid}
                      disabled={loading}
                      busy={loading}
                      busyTextContent="Voiding..."
                      className="flex-1 min-w-0 touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
                      confirmClassName="flex-1 min-w-0 touch-target bg-red-900 hover:bg-red-800 rounded-lg text-sm font-bold text-red-100 py-3"
                    />
                  )}
                </div>
              )}
              {openReceiptMessage && (
                <div className="text-green-400 text-xs">{openReceiptMessage}</div>
              )}

              {/* Paid/refunded secondary actions: Refund + Reprint side-by-side */}
              {currentOrder &&
                (currentOrder.status === 'paid' || currentOrder.status === 'refunded') &&
                (permissions.refundOrder || permissions.updateOrder) && (
                  <div className="flex gap-2">
                    {currentOrder.status === 'paid' && permissions.refundOrder && (
                      <button
                        onClick={handleOpenRefund}
                        disabled={loading || refundLoading}
                        className="flex-1 touch-target bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
                      >
                        Refund
                      </button>
                    )}
                    {permissions.updateOrder && (
                      <OrderActionBar
                        orderId={currentOrder.id}
                        status={currentOrder.status}
                        className="flex-1 min-w-0"
                      />
                    )}
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
          )}
        </div>
      </div>

      {/* Table picker modal */}
      {showTablePicker && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowTablePicker(false)}
        >
          <div
            className="bg-gray-800 rounded-xl p-4 w-[32rem] max-w-[90vw] max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-3">Select Table</h3>
            <div className="grid grid-cols-3 gap-2">
              {tables.map((t) => {
                const occupied = isTableOccupied(t.id);
                const selected = cart.tableId === t.id;
                const openOrder = openOrders.find(
                  (o) =>
                    o.tableId != null &&
                    Number(o.tableId) === t.id &&
                    (!currentOrder || o.id !== currentOrder.id),
                );

                return (
                  <button
                    key={t.id}
                    disabled={occupied}
                    onClick={() => {
                      void handleTableSelect(t);
                    }}
                    className={`touch-target flex flex-col items-center justify-center gap-0.5 px-1.5 py-2.5 min-w-0 rounded-lg text-sm font-bold ${
                      occupied
                        ? 'bg-gray-800 text-gray-600 border-2 border-amber-700/50 cursor-not-allowed opacity-60'
                        : selected
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span className="leading-tight">{t.name}</span>
                    {occupied && openOrder && (
                      <span
                        title={openOrder.documentId}
                        className="block text-[10px] font-medium text-amber-500 leading-tight break-all max-w-full text-center"
                      >
                        {openOrder.documentId}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delivery partner picker modal (ADR 0007) */}
      {showPartnerPicker && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowPartnerPicker(false)}
        >
          <div
            className="bg-gray-800 rounded-xl p-4 w-[32rem] max-w-[90vw] max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-3">Select Delivery Partner</h3>
            {deliveryPartners.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">
                No delivery partners configured. Add them in Admin → Delivery Partners.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    void handleSelectPartner(null).then((ok) => {
                      if (ok) setShowPartnerPicker(false);
                    });
                  }}
                  className={`touch-target flex items-center justify-center px-3 py-3 rounded-lg text-sm font-bold ${
                    cart.deliveryPartnerId == null
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  None
                </button>
                {deliveryPartners.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      void handleSelectPartner(p.id).then((ok) => {
                        if (ok) setShowPartnerPicker(false);
                      });
                    }}
                    className={`touch-target flex items-center justify-center px-3 py-3 rounded-lg text-sm font-bold ${
                      cart.deliveryPartnerId === p.id
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}
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
                  void refreshOrder();
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Item notes editor modal (cart rows) */}
      {notesEditItem && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setNotesEditItem(null)}
        >
          <div
            className="bg-gray-800 rounded-xl p-4 w-96 max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-1">{notesEditItem.name}</h3>
            <p className="text-xs text-gray-500 mb-3">Item notes (printed on the kitchen ticket)</p>
            <textarea
              value={notesEditText}
              onChange={(e) => setNotesEditText(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. no onion"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-brand-500 resize-none"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSaveNotesEditor}
                className="flex-1 touch-target bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-bold text-white py-2.5"
              >
                Save
              </button>
              <button
                onClick={() => setNotesEditItem(null)}
                className="flex-1 touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-2.5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave guard dialog (D7) */}
      {showLeaveGuard && (
        <LeaveGuardDialog onKeepEditing={handleKeepEditing} onDiscard={handleDiscardAndNavigate} />
      )}

      {/* Realtime conflict dialog (D8) */}
      {showRealtimeConflict && <RealtimeConflictDialog onDismiss={handleRealtimeConflictDismiss} />}

      {/* Add payment modal (ADR 0006) — appends one line, never submits */}
      {showAddPaymentModal && currentOrder && (
        <AddPaymentModal
          orderId={currentOrder.id}
          orderTotalHalalas={serverTotals.totalHalalas}
          outstandingHalalas={outstandingHalalas}
          deliveryPartnerId={cart.deliveryPartnerId}
          onAdded={handlePaymentAdded}
          onClose={() => setShowAddPaymentModal(false)}
        />
      )}

      {/* Partner price override modal (ADR 0007, Phase 7) */}
      {showPartnerPriceModal && currentOrder && (
        <PartnerPriceModal
          orderId={currentOrder.id}
          baseUpdatedAt={cart.serverUpdatedAt ?? 0}
          items={cart.items
            .filter((i) => i.orderItemId != null)
            .map((i) => ({
              orderItemId: i.orderItemId!,
              itemId: i.itemId || null,
              name: i.name,
              unitPriceHalalas: i.unitPriceHalalas,
              qty: i.qty,
            }))}
          floorByItemId={floorByItemId}
          partnerTitle={cart.deliveryPartnerTitle}
          onSaved={handlePartnerPricesSaved}
          onClose={() => setShowPartnerPriceModal(false)}
        />
      )}

      {/* ZATCA clearance modal — after submit with standard invoice */}
      {showClearance && currentOrder && (
        <ZatcaClearanceModal
          orderId={currentOrder.id}
          orderTotalHalalas={serverTotals.totalHalalas}
          initialBuyer={buyer}
          onDone={() => {
            setShowClearance(false);
            void refreshOrder();
          }}
        />
      )}
    </div>
  );
}
