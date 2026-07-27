import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderPage } from '../pages/OrderPage';

// Mock API client
const mockDayCurrent = vi.fn();
const mockListCategories = vi.fn();
const mockListItems = vi.fn();
const mockTablesList = vi.fn();
const mockOrdersGet = vi.fn();
const mockOrdersAddItem = vi.fn();
const mockOrdersUpdateItem = vi.fn();
const mockOrdersRemoveItem = vi.fn();

vi.mock('../api', () => ({
  client: {
    auth: { login: vi.fn(), me: vi.fn() },
    menu: {
      listCategories: (...args: any[]) => mockListCategories(...args),
      listItems: (...args: any[]) => mockListItems(...args),
    },
    tables: {
      list: (...args: any[]) => mockTablesList(...args),
    },
    orders: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      addItem: (...args: any[]) => mockOrdersAddItem(...args),
      updateItem: (...args: any[]) => mockOrdersUpdateItem(...args),
      removeItem: (...args: any[]) => mockOrdersRemoveItem(...args),
      get: (...args: any[]) => mockOrdersGet(...args),
      pay: vi.fn(),
      void: vi.fn(),
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
    uuid: 'test-uuid',
    type: 'dine_in',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 4600,
    vatHalalas: 600,
    totalHalalas: 4600,
    discountHalalas: 0,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
    items: [makeOrderItem()],
    events: [],
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

/** Shared setup helpers — call in beforeEach or per-test */
function mockDayIsOpen() {
  mockDayCurrent.mockResolvedValue({ status: 'open', businessDate: '2026-07-22' });
  mockListCategories.mockResolvedValue(categories);
  mockListItems.mockResolvedValue(items);
  mockTablesList.mockResolvedValue(tables);
}

function mockGetReturns(order: Record<string, unknown>) {
  mockOrdersGet.mockReturnValue(Promise.resolve(order));
}

function mockUpdateSucceeds() {
  mockOrdersUpdateItem.mockReturnValue(Promise.resolve({ success: true }));
}

function mockAddSucceeds(orderItemId = 102) {
  mockOrdersAddItem.mockReturnValue(Promise.resolve({ success: true, orderItemId }));
}

function mockRemoveSucceeds() {
  mockOrdersRemoveItem.mockReturnValue(Promise.resolve({ success: true }));
}

describe('OrderPage — server-synced cart mutations', () => {
  beforeEach(() => {
    // Reset call history (mockImplementation survives vi.clearAllMocks,
    // but explicit mockReturnValue/mockResolvedValue per test overwrites it).
    vi.clearAllMocks();
    mockDayIsOpen();
  });

  // ---- Order loading ----

  it('loads an existing open order via deep-link with orderItemIds set', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    // Order header appears
    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });
    // Burger in both menu + cart
    expect(screen.getAllByText('Burger').length).toBeGreaterThanOrEqual(1);
    // Qty 2 displayed in cart
    expect(screen.getByText('2')).toBeInTheDocument();
    // Status badge
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  // ---- addItem via menu click ----

  it('post-order: menu click calls addItem, then refetches order', async () => {
    // Use a counter so get returns something each call
    let getCalls = 0;
    mockOrdersGet.mockImplementation(() => {
      getCalls++;
      return Promise.resolve(
        getCalls === 1
          ? makeOrder()
          : makeOrder({
              items: [
                makeOrderItem(),
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
    });
    mockAddSucceeds();

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    // Click Fries in menu (first text occurrence = menu button)
    const friesElements = screen.getAllByText('Fries');
    fireEvent.click(friesElements[0]);

    await waitFor(() => {
      expect(mockOrdersAddItem).toHaveBeenCalledWith(1, { itemId: 2, qty: 1 });
    });

    // addItem success triggers refetch (get called twice: load + refetch)
    await waitFor(() => {
      expect(mockOrdersGet).toHaveBeenCalledTimes(2);
    });
  });

  it('post-order: menu click on existing item appends a new line', async () => {
    let getCalls = 0;
    mockOrdersGet.mockImplementation(() => {
      getCalls++;
      return Promise.resolve(
        getCalls === 1
          ? makeOrder()
          : makeOrder({
              items: [
                makeOrderItem(),
                makeOrderItem({
                  id: 102,
                  itemId: 1,
                  itemName: 'Burger',
                  qty: 1,
                  totalHalalas: 2300,
                }),
              ],
            }),
      );
    });
    mockAddSucceeds();

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    // Initially: 1 Burger in menu + 1 in cart = 2
    expect(screen.getAllByText('Burger').length).toBe(2);

    // Click Burger in menu (first element is menu button)
    fireEvent.click(screen.getAllByText('Burger')[0]);

    await waitFor(() => {
      expect(mockOrdersAddItem).toHaveBeenCalledWith(1, { itemId: 1, qty: 1 });
    });

    // After refetch: 1 menu + 2 cart = 3
    await waitFor(() => {
      expect(screen.getAllByText('Burger').length).toBe(3);
    });
  });

  // ---- qty +/- via cart buttons ----

  it('post-order: qty + calls updateItem with incremented qty', async () => {
    mockGetReturns(makeOrder());
    mockUpdateSucceeds();

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    const plusButtons = screen.getAllByText('+');
    expect(plusButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(plusButtons[0]);

    // The handler does item.qty + 1 = 2 + 1 = 3
    await waitFor(() => {
      expect(mockOrdersUpdateItem).toHaveBeenCalledWith(1, 101, { qty: 3 });
    });
  });

  it('post-order: qty - calls updateItem with reduced qty', async () => {
    mockGetReturns(makeOrder()); // qty = 2
    mockUpdateSucceeds();

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    const minusButtons = screen.getAllByText('-');
    expect(minusButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(minusButtons[0]);

    // item.qty - 1 = 2 - 1 = 1
    await waitFor(() => {
      expect(mockOrdersUpdateItem).toHaveBeenCalledWith(1, 101, { qty: 1 });
    });
  });

  it('post-order: qty 0 removes via DELETE', async () => {
    const orderQty1 = makeOrder({
      items: [makeOrderItem({ qty: 1, totalHalalas: 2300 })],
    });
    mockGetReturns(orderQty1);
    mockRemoveSucceeds();

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    // Click - (qty 1 → 0)
    fireEvent.click(screen.getAllByText('-')[0]);

    await waitFor(() => {
      expect(mockOrdersRemoveItem).toHaveBeenCalledWith(1, 101);
    });
  });

  it('post-order: remove button calls removeItem', async () => {
    mockGetReturns(makeOrder());
    mockRemoveSucceeds();

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('\u2715')[0]);

    await waitFor(() => {
      expect(mockOrdersRemoveItem).toHaveBeenCalledWith(1, 101);
    });
  });

  // ---- API failure → rollback ----

  it('post-order: addItem failure refetches and shows error', async () => {
    let getCalls = 0;
    mockOrdersGet.mockImplementation(() => {
      getCalls++;
      return Promise.resolve(makeOrder());
    });
    mockOrdersAddItem.mockRejectedValue(new Error('Network error'));

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    // Click Fries to trigger addItem
    fireEvent.click(screen.getAllByText('Fries')[0]);

    // addItem was attempted
    await waitFor(() => {
      expect(mockOrdersAddItem).toHaveBeenCalled();
    });

    // Refetch was called after failure
    await waitFor(() => {
      expect(mockOrdersGet).toHaveBeenCalledTimes(2);
    });

    // Error message appears (raw error.message = 'Network error')
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    // Cart restored to server state
    expect(screen.getAllByText('Burger').length).toBe(2); // menu + cart
  });

  it('post-order: updateItem failure refetches and shows error', async () => {
    let getCalls = 0;
    mockOrdersGet.mockImplementation(() => {
      getCalls++;
      return Promise.resolve(makeOrder());
    });
    mockOrdersUpdateItem.mockRejectedValue(new Error('Server error'));

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('+')[0]);

    await waitFor(() => {
      expect(mockOrdersUpdateItem).toHaveBeenCalled();
    });

    // Refetch called after failure
    await waitFor(() => {
      expect(mockOrdersGet).toHaveBeenCalledTimes(2);
    });

    // Error message
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('post-order: removeItem failure refetches and shows error', async () => {
    let getCalls = 0;
    mockOrdersGet.mockImplementation(() => {
      getCalls++;
      return Promise.resolve(makeOrder());
    });
    mockOrdersRemoveItem.mockRejectedValue(new Error('Delete failed'));

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('\u2715')[0]);

    await waitFor(() => {
      expect(mockOrdersRemoveItem).toHaveBeenCalled();
    });

    // Refetch after failure
    await waitFor(() => {
      expect(mockOrdersGet).toHaveBeenCalledTimes(2);
    });

    // Error message
    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });

    // Burger still present
    expect(screen.getAllByText('Burger').length).toBeGreaterThanOrEqual(1);
  });

  // ---- Disable during mutation ----

  it('post-order: buttons disabled during mutation, re-enabled after', async () => {
    let resolveAddItem: (value: unknown) => void;
    const addItemPromise = new Promise((resolve) => {
      resolveAddItem = resolve;
    });

    mockOrdersGet.mockReturnValue(Promise.resolve(makeOrder()));
    mockOrdersAddItem.mockReturnValue(addItemPromise);

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    // Click Fries — starts mutation
    fireEvent.click(screen.getAllByText('Fries')[0]);

    // Menu button should now be disabled
    await waitFor(() => {
      const burgerBtn = screen.getAllByText('Burger')[0].closest('button');
      expect(burgerBtn).toBeDisabled();
    });

    // Complete mutation
    mockOrdersGet.mockReturnValue(
      Promise.resolve(
        makeOrder({
          items: [
            makeOrderItem(),
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
      ),
    );
    resolveAddItem!({ success: true, orderItemId: 102 });

    // After completion, menu button should be enabled again
    await waitFor(() => {
      const burgerBtn = screen.getAllByText('Burger')[0].closest('button');
      expect(burgerBtn).not.toBeDisabled();
    });
  });

  // ---- Pre-order (local-only) ----

  it('pre-order: clicking menu item uses local addItem (no API call)', async () => {
    renderOrderPage(['/']);

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Click Burger in menu
    fireEvent.click(screen.getAllByText('Burger')[0]);

    // No API call
    expect(mockOrdersAddItem).not.toHaveBeenCalled();

    // In pre-order, clicking adds to cart. Menu + cart = 2 elements.
    expect(screen.getAllByText('Burger').length).toBe(2);
  });
});
