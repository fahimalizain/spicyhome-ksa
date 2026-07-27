import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderPage } from '../pages/OrderPage';
import { DayPage } from '../pages/DayPage';

const mockListCategories = vi.fn();
const mockListItems = vi.fn();
const mockTablesList = vi.fn();
const mockDayCurrent = vi.fn();
const mockOrdersCreate = vi.fn();
const mockOrdersAddItem = vi.fn();
const mockOrdersGet = vi.fn();

vi.mock('../api', () => ({
  client: {
    auth: {
      login: vi.fn(),
      me: vi.fn(),
    },
    menu: {
      listCategories: (...args: any[]) => mockListCategories(...args),
      listItems: (...args: any[]) => mockListItems(...args),
    },
    tables: {
      list: (...args: any[]) => mockTablesList(...args),
    },
    orders: {
      list: vi.fn().mockResolvedValue([]),
      create: (...args: any[]) => mockOrdersCreate(...args),
      addItem: (...args: any[]) => mockOrdersAddItem(...args),
      updateItem: vi.fn(),
      removeItem: vi.fn(),
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

const tables = [
  { id: 1, name: 'T1', isActive: true, createdAt: 1000, updatedAt: 1000 },
  { id: 2, name: 'T2', isActive: true, createdAt: 1000, updatedAt: 1000 },
  { id: 5, name: 'T5', isActive: true, createdAt: 1000, updatedAt: 1000 },
];

function renderOrderPage(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<OrderPage />} />
        <Route path="/day" element={<DayPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function setupOpenDay() {
  mockDayCurrent.mockResolvedValue({ status: 'open', businessDate: '2026-07-22' });
  mockListCategories.mockResolvedValue(categories);
  mockListItems.mockResolvedValue(items);
  mockTablesList.mockResolvedValue(tables);
}

describe('OrderPage — create order table guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupOpenDay();
  });

  it('dine-in + items + no table: Create button is enabled, not disabled', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Add an item to the cart
    fireEvent.click(screen.getByText('Burger'));

    // "Select table…" should be visible (dine-in without table)
    await waitFor(() => {
      expect(screen.getByText('Select table…')).toBeInTheDocument();
    });

    // Create button should be ENABLED — user can click, guard provides friendly error
    const createBtn = screen.getByText('Create Order');
    expect(createBtn).not.toBeDisabled();
  });

  it('dine-in + items + no table: clicking Create shows error, opens table picker, no API call', async () => {
    // Mock create to track calls
    mockOrdersCreate.mockResolvedValue({ id: 1, orderNo: 1 });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Add an item
    fireEvent.click(screen.getByText('Burger'));

    // "Select table…" is visible (dine-in without table)
    await waitFor(() => {
      expect(screen.getByText('Select table…')).toBeInTheDocument();
    });

    // Create button is enabled — clicking triggers the defense-in-depth guard
    const createBtn = screen.getByText('Create Order');
    expect(createBtn).not.toBeDisabled();
    fireEvent.click(createBtn);

    // Error message should appear
    await waitFor(() => {
      expect(screen.getByText('Please select a table')).toBeInTheDocument();
    });

    // Table picker should open with "Select Table" heading
    expect(screen.getByText('Select Table')).toBeInTheDocument();

    // Create was never called (guard prevents API call)
    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });

  it('select table then Create calls orders.create with dine_in + tableId', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 10, orderNo: 42 });
    mockOrdersAddItem.mockResolvedValue({});
    mockOrdersGet.mockResolvedValue({
      id: 10,
      orderNo: 42,
      type: 'dine_in',
      tableId: 1,
      status: 'open',
      items: [],
    });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Add item
    fireEvent.click(screen.getByText('Burger'));

    // Click "Select table…" to open picker
    fireEvent.click(screen.getByText('Select table…'));

    // Table picker should appear with "Select Table" heading
    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });

    // Select T1
    fireEvent.click(screen.getByText('T1'));

    // Table display should update
    await waitFor(() => {
      expect(screen.getByText('Table: T1')).toBeInTheDocument();
    });

    // Create button should now be enabled
    const createBtn = screen.getByText('Create Order');
    expect(createBtn).not.toBeDisabled();

    // Click create
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockOrdersCreate).toHaveBeenCalledWith({
        type: 'dine_in',
        tableId: 1,
      });
    });
  });

  it('takeaway + items, no table: Create enabled, called with takeaway and no tableId', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 20, orderNo: 5 });
    mockOrdersAddItem.mockResolvedValue({});
    mockOrdersGet.mockResolvedValue({
      id: 20,
      orderNo: 5,
      type: 'takeaway',
      status: 'open',
      items: [],
    });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Switch to takeaway
    fireEvent.click(screen.getByText('Takeaway'));

    // Add item
    fireEvent.click(screen.getByText('Burger'));

    // Create button should be enabled
    const createBtn = screen.getByText('Create Order');
    expect(createBtn).not.toBeDisabled();

    // Click create
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockOrdersCreate).toHaveBeenCalledWith({
        type: 'takeaway',
        tableId: undefined,
      });
    });
  });

  it('deep-link /?tableId=5 pre-selects table, Create enabled after adding item', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 30, orderNo: 7 });
    mockOrdersAddItem.mockResolvedValue({});
    mockOrdersGet.mockResolvedValue({
      id: 30,
      orderNo: 7,
      type: 'dine_in',
      tableId: 5,
      status: 'open',
      items: [],
    });

    renderOrderPage(['/?tableId=5']);

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Table should be pre-selected (display shows "Table: T5")
    await waitFor(() => {
      expect(screen.getByText('Table: T5')).toBeInTheDocument();
    });

    // Add item
    fireEvent.click(screen.getByText('Burger'));

    // Create button should be enabled
    const createBtn = screen.getByText('Create Order');
    expect(createBtn).not.toBeDisabled();

    // Click create
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockOrdersCreate).toHaveBeenCalledWith({
        type: 'dine_in',
        tableId: 5,
      });
    });
  });

  it('dine-in with table: re-clicking Dine-in preserves table selection', async () => {
    renderOrderPage(['/?tableId=1']);

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Table T1 should be pre-selected
    await waitFor(() => {
      expect(screen.getByText('Table: T1')).toBeInTheDocument();
    });

    // Click Dine-in button again (should open picker, keep table)
    fireEvent.click(screen.getByText('Dine-in'));

    // Table picker appears
    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });

    // Dismiss the picker by clicking backdrop
    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) fireEvent.click(backdrop);

    // Table should still be T1 (not wiped)
    await waitFor(() => {
      expect(screen.getByText('Table: T1')).toBeInTheDocument();
    });
  });

  it('shows "Select table…" when dine-in and no tableId', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Dine-in is default, no table → should see "Select table…"
    expect(screen.getByText('Select table…')).toBeInTheDocument();

    // Should NOT be showing any "Table:" label
    expect(screen.queryByText(/^Table:/)).not.toBeInTheDocument();
  });

  it('hides table control when takeaway is selected', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Switch to takeaway
    fireEvent.click(screen.getByText('Takeaway'));

    // "Select table…" should not be visible
    expect(screen.queryByText('Select table…')).not.toBeInTheDocument();
  });

  it('table picker dismiss via backdrop does not error', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Open table picker via "Select table…"
    fireEvent.click(screen.getByText('Select table…'));

    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });

    // Dismiss by clicking backdrop
    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) fireEvent.click(backdrop);

    // "Select Table" heading should disappear
    await waitFor(() => {
      expect(screen.queryByText('Select Table')).not.toBeInTheDocument();
    });

    // "Select table…" should still be there (no table selected)
    expect(screen.getByText('Select table…')).toBeInTheDocument();
  });
});
