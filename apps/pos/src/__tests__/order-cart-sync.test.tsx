import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderPage } from '../pages/OrderPage';

// Mock API client
const mockDayCurrent = vi.fn();
const mockListCategories = vi.fn();
const mockListSubcategories = vi.fn();
const mockListItems = vi.fn();
const mockTablesList = vi.fn();
const mockOrdersGet = vi.fn();
const mockOrdersCreate = vi.fn();
const mockOrdersSyncItems = vi.fn();
const mockOrdersSendToKitchen = vi.fn();
const mockOrdersVoid = vi.fn();

vi.mock('../api', () => ({
  client: {
    auth: { login: vi.fn(), me: vi.fn() },
    menu: {
      listCategories: (...args: any[]) => mockListCategories(...args),
      listSubcategories: (...args: any[]) => mockListSubcategories(...args),
      listItems: (...args: any[]) => mockListItems(...args),
    },
    tables: {
      list: (...args: any[]) => mockTablesList(...args),
    },
    orders: {
      list: vi.fn().mockResolvedValue([]),
      create: (...args: any[]) => mockOrdersCreate(...args),
      syncItems: (...args: any[]) => mockOrdersSyncItems(...args),
      get: (...args: any[]) => mockOrdersGet(...args),
      sendToKitchen: (...args: any[]) => mockOrdersSendToKitchen(...args),
      void: (...args: any[]) => mockOrdersVoid(...args),
      refund: vi.fn(),
      getRefunds: vi.fn(),
      getEvents: vi.fn(),
      verifyEvents: vi.fn(),
      reprint: vi.fn(),
    },
    day: {
      current: (...args: any[]) => mockDayCurrent(...args),
      open: vi.fn(),
      close: vi.fn(),
      list: vi.fn(),
    },
    reports: {
      x: vi.fn(),
      z: vi.fn(),
      printX: vi.fn(),
      printZ: vi.fn(),
    },
  },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  getMe: vi.fn(() => ({
    id: 1,
    username: 'admin',
    name: 'Admin',
    roleId: 1,
    roleName: 'admin',
    isActive: true,
    createOrder: true,
    updateOrder: true,
    deleteOrderItem: true,
    voidOrder: true,
    refundOrder: true,
    payOrder: true,
    manageMenu: true,
    manageTables: true,
    managePrinters: true,
    manageUsers: true,
    manageSettings: true,
  })),
  isAuthenticated: vi.fn(() => true),
}));

const categories = [
  { id: 1, name: 'Burgers', sortOrder: 0, isActive: true, createdAt: 0, updatedAt: 0 },
];

const subcategories = [
  {
    id: 1,
    categoryId: 1,
    name: 'Chicken',
    sortOrder: 0,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: null,
    updatedBy: null,
  },
];

const items = [
  {
    id: 1,
    categoryId: 1,
    name: 'Burger',
    priceHalalas: 2300,
    vatRateBp: 1500,
    sortOrder: 0,
    isActive: true,
    nameAr: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
  },
  {
    id: 2,
    categoryId: 1,
    name: 'Fries',
    priceHalalas: 1150,
    vatRateBp: 1500,
    sortOrder: 1,
    isActive: true,
    nameAr: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
  },
];

const tables = [{ id: 1, name: 'T1', isActive: true, createdAt: 1000, updatedAt: 1000 }];

function makeOrderItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    orderId: 1,
    itemId: 1,
    itemName: 'Burger',
    unitPriceHalalas: 2300,
    vatRateBp: 1500,
    qty: 2,
    totalHalalas: 4600,
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orderNo: 42,
    documentId: 'INV26-0042',
    uuid: 'test-uuid',
    type: 'dine_in',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 4600,
    vatHalalas: 600,
    totalHalalas: 4600,
    discountHalalas: 0,
    isStandardInvoice: false,
    zatcaBuyerDetails: null,
    createdAt: 1000,
    updatedAt: 5000,
    createdBy: null,
    updatedBy: null,
    items: [makeOrderItem()],
    events: [],
    payments: [],
    ...overrides,
  };
}

function renderOrderPage(initialEntries: string[] = ['/?orderId=1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<OrderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockDayIsOpen() {
  mockDayCurrent.mockResolvedValue({ status: 'open', businessDate: '2026-07-22' });
  mockListCategories.mockResolvedValue(categories);
  mockListSubcategories.mockResolvedValue(subcategories);
  mockListItems.mockResolvedValue(items);
  mockTablesList.mockResolvedValue(tables);
}

function mockGetReturns(order: Record<string, unknown>) {
  mockOrdersGet.mockReturnValue(Promise.resolve(order));
}

describe('OrderPage — staged cart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDayIsOpen();
  });

  // ---- Test 1: Open order, no API calls on local mutations ----
  it('open order: menu click does NOT call syncItems (local staging)', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Click Fries in menu
    const friesElements = screen.getAllByText('Fries');
    fireEvent.click(friesElements[0]);

    // No syncItems call — staged locally
    expect(mockOrdersSyncItems).not.toHaveBeenCalled();

    // Cart shows both items now
    await waitFor(() => {
      expect(screen.getAllByText('Fries').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- Test 2: Save Items calls syncItems ----
  it('open order: Save Items calls syncItems with full cart snapshot', async () => {
    mockGetReturns(makeOrder());

    // Sync succeeds and returns updated order
    mockOrdersSyncItems.mockResolvedValue(
      makeOrder({
        updatedAt: 6000,
        items: [
          makeOrderItem({ id: 101, itemId: 1, qty: 2 }),
          makeOrderItem({
            id: 102,
            itemId: 2,
            itemName: 'Fries',
            unitPriceHalalas: 1150,
            qty: 1,
            totalHalalas: 1150,
          }),
        ],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Add Fries
    fireEvent.click(screen.getAllByText('Fries')[0]);

    // "Unsent changes" should be visible
    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });

    // Save Items should be visible
    await waitFor(() => {
      expect(screen.getByText('Save Items')).toBeInTheDocument();
    });

    // Click Save Items
    fireEvent.click(screen.getByText('Save Items'));

    await waitFor(() => {
      expect(mockOrdersSyncItems).toHaveBeenCalledTimes(1);
      expect(mockOrdersSyncItems).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          baseUpdatedAt: 5000,
          items: expect.arrayContaining([
            expect.objectContaining({ orderItemId: 101, qty: 2 }),
            expect.objectContaining({ itemId: 2, qty: 1 }),
          ]),
        }),
      );
    });
  });

  // ---- Test 3: Discard restores server snapshot ----
  it('open order: Discard restores server snapshot', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Initial qty is 2
    const qtyElements = screen.getAllByText('2');
    expect(qtyElements.length).toBeGreaterThanOrEqual(1);

    // Change qty to 3
    const plusButtons = screen.getAllByText('+');
    fireEvent.click(plusButtons[0]);

    // Qty should be 3 now
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    // Discard button should be visible
    await waitFor(() => {
      expect(screen.getByText('Discard')).toBeInTheDocument();
    });

    // Click Discard
    fireEvent.click(screen.getByText('Discard'));

    // Qty should be back to 2
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
      // "Unsent changes" no longer visible
      expect(screen.queryByText('Unsent changes')).not.toBeInTheDocument();
    });
  });

  // ---- Test 4: Send to Kitchen hidden when dirty; Save Items shown (ADR 0006) ----
  it('open order: Send to Kitchen hidden when dirty, Save Items shown', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Clean with unsent kitchen deltas (qty 2, nothing printed) — Send shown,
    // Save Items hidden (mutual exclusion)
    expect(screen.queryByText('Send to Kitchen')).toBeInTheDocument();
    expect(screen.queryByText('Save Items')).not.toBeInTheDocument();

    // Make a change
    const plusButtons = screen.getAllByText('+');
    fireEvent.click(plusButtons[0]);

    // Dirty — Send hidden, Save Items + Discard shown
    await waitFor(() => {
      expect(screen.queryByText('Send to Kitchen')).not.toBeInTheDocument();
      expect(screen.getByText('Save Items')).toBeInTheDocument();
      expect(screen.getByText('Discard')).toBeInTheDocument();
    });
  });

  // ---- Test 5: Create Order uses create + getOrder + syncItems (B6) ----
  it('pre-order: Create Order calls create then getOrder then syncItems', async () => {
    mockOrdersCreate.mockResolvedValue({
      id: 10,
      orderNo: 42,
      documentId: 'INV26-0042',
      uuid: 'test',
    });
    // B6: After creation, POS fetches the order to get real updatedAt
    mockOrdersGet.mockResolvedValue(makeOrder({ id: 10, orderNo: 42, updatedAt: 5000, items: [] }));
    mockOrdersSyncItems.mockResolvedValue(
      makeOrder({
        id: 10,
        updatedAt: 6000,
        items: [makeOrderItem({ id: 201, itemId: 1, qty: 1 })],
      }),
    );

    // Pre-order with table pre-selected to bypass table guard
    render(
      <MemoryRouter initialEntries={['/?tableId=1']}>
        <Routes>
          <Route path="/" element={<OrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Add item
    fireEvent.click(screen.getByText('Burger'));

    // Click Create Order
    fireEvent.click(screen.getByText('Create Order'));

    await waitFor(() => {
      expect(mockOrdersCreate).toHaveBeenCalledWith({ type: 'dine_in', tableId: 1 });
    });

    await waitFor(() => {
      // Should fetch the order to get updatedAt (B6)
      expect(mockOrdersGet).toHaveBeenCalledWith(10);
    });

    await waitFor(() => {
      expect(mockOrdersSyncItems).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          baseUpdatedAt: 5000, // from the fetched order (not 0)
          // Blank notes are sent as "" (not omitted) so the server can clear
          items: [{ itemId: 1, qty: 1, notes: '' }],
        }),
      );
    });
  });

  // ---- Test 6: Pre-order: menu click local, no API ----
  it('pre-order: clicking menu item uses local addItem (no API call)', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<OrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Click Burger in menu
    fireEvent.click(screen.getAllByText('Burger')[0]);

    // No API call
    expect(mockOrdersSyncItems).not.toHaveBeenCalled();
    expect(mockOrdersCreate).not.toHaveBeenCalled();

    // In pre-order, clicking adds to cart. Menu + cart = 2 elements.
    expect(screen.getAllByText('Burger').length).toBe(2);
  });

  // ---- Test 7: Sync 409 resets local state ----
  it('open order: sync 409 resets local changes', async () => {
    mockGetReturns(makeOrder());

    // Sync fails with 409
    mockOrdersSyncItems.mockRejectedValue(
      new Error('HTTP 409 Conflict: Order was modified by another terminal'),
    );

    // After 409, refetch returns original state
    mockOrdersGet.mockResolvedValue(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Add Fries
    fireEvent.click(screen.getAllByText('Fries')[0]);

    // Save Items — triggers 409
    fireEvent.click(screen.getByText('Save Items'));

    await waitFor(() => {
      // Error shown
      expect(
        screen.getByText('Order was modified elsewhere. Your local changes have been reset.'),
      ).toBeInTheDocument();
    });
  });

  // ---- Test 8: Notes-only change makes dirty ----
  it('open order: notes change shows dirty but no API call', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Verify no syncItems called initially
    expect(mockOrdersSyncItems).not.toHaveBeenCalled();

    // Make a menu tap (Burger already in order, so adds another Burger via merge)
    fireEvent.click(screen.getAllByText('Burger')[0]);

    // Dirty shows
    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });
  });

  // ---- Test 9: New Order hidden when dirty; visible when clean (D7/D15) ----
  it('open order: New Order hidden when dirty, visible when clean', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Clean: New Order visible on the Summary tab
    fireEvent.click(screen.getByText('Summary'));
    await waitFor(() => {
      expect(screen.getByText('New Order')).toBeInTheDocument();
    });

    // Back to Items; make a change to get dirty
    fireEvent.click(screen.getByText('Items'));
    fireEvent.click(screen.getAllByText('Burger')[0]);

    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });

    // Dirty: Save/Discard present on Items
    expect(screen.getByText('Save Items')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();

    // Dirty: New Order hidden on Summary
    fireEvent.click(screen.getByText('Summary'));
    expect(screen.queryByText('New Order')).not.toBeInTheDocument();
  });

  // ---- Test 9b: New Order on clean open order clears immediately ----
  it('open order: clean + New Order clears session immediately', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Clean — Send to Kitchen visible, tabs shown
    expect(screen.getByText('Send to Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();

    // New Order lives on the Summary tab for open orders
    fireEvent.click(screen.getByText('Summary'));
    const newOrderBtn = screen.getByText('New Order');
    expect(newOrderBtn).toBeInTheDocument();

    // Click New Order — clean, so no guard; clears immediately
    fireEvent.click(newOrderBtn);

    await waitFor(() => {
      // Back to pre-order state
      expect(screen.getByText('New Order')).toBeInTheDocument();
      expect(screen.getByText('Create Order')).toBeInTheDocument();
      expect(screen.queryByText('Order #42')).not.toBeInTheDocument();
      // Tabs disappear without an order
      expect(screen.queryByText('Payments')).not.toBeInTheDocument();
      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
    });

    // No API void call — order remains open on server
    expect(mockOrdersVoid).not.toHaveBeenCalled();
  });

  // ---- Test 10b: Save Items → Send to Kitchen mutual exclusion (ADR 0006) ----
  it('open order: Save Items and Send to Kitchen are mutually exclusive', async () => {
    mockGetReturns(makeOrder());

    // Save resolves to a clean cart with qty 3 and no kitchen events
    mockOrdersSyncItems.mockResolvedValue(
      makeOrder({
        updatedAt: 6000,
        items: [makeOrderItem({ id: 101, itemId: 1, qty: 3 })],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Clean + unsent deltas: Send only
    expect(screen.getByText('Send to Kitchen')).toBeInTheDocument();
    expect(screen.queryByText('Save Items')).not.toBeInTheDocument();

    // Dirty: Save only
    fireEvent.click(screen.getAllByText('+')[0]);
    await waitFor(() => {
      expect(screen.getByText('Save Items')).toBeInTheDocument();
      expect(screen.queryByText('Send to Kitchen')).not.toBeInTheDocument();
    });

    // Save: back to clean — Send returns, Save disappears
    fireEvent.click(screen.getByText('Save Items'));
    await waitFor(() => {
      expect(screen.queryByText('Save Items')).not.toBeInTheDocument();
      expect(screen.getByText('Send to Kitchen')).toBeInTheDocument();
    });
  });

  // ---- Test 10: D8 — Realtime conflict dialog triggered by remote change ----
  it('open order: remote update while dirty shows realtime conflict dialog', async () => {
    mockGetReturns(makeOrder({ updatedAt: 5000 }));

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Make a change to get dirty
    fireEvent.click(screen.getAllByText('Burger')[0]);

    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });

    // Simulate WS poll returning a different updatedAt (7000)
    mockOrdersGet.mockResolvedValue(makeOrder({ updatedAt: 7000 }));

    // Wait for the poll interval to fire (3s cycle, we wait up to 4s)
    await waitFor(
      () => {
        expect(screen.getByText('Order Updated Elsewhere')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  }, 8000);
});
