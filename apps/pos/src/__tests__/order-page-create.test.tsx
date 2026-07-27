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
const mockOrdersSyncItems = vi.fn();
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
      syncItems: (...args: any[]) => mockOrdersSyncItems(...args),
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

describe('OrderPage — create order with sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupOpenDay();
  });

  it('dine-in + items + no table: Create button is enabled, shows error on click', async () => {
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

    // Create button should be ENABLED
    const createBtn = screen.getByText('Create Order');
    expect(createBtn).not.toBeDisabled();
  });

  it('dine-in + items + no table: clicking Create shows error, no API call', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 1, orderNo: 1, uuid: 'test' });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Burger'));

    await waitFor(() => {
      expect(screen.getByText('Select table…')).toBeInTheDocument();
    });

    const createBtn = screen.getByText('Create Order');
    expect(createBtn).not.toBeDisabled();
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Please select a table')).toBeInTheDocument();
    });

    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });

  it('select table then Create calls orders.create with dine_in + tableId + syncItems', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 10, orderNo: 42, uuid: 'test' });
    // B6: After creation, the code fetches the order to get updatedAt
    mockOrdersGet.mockResolvedValue({
      id: 10,
      orderNo: 42,
      uuid: 'test',
      type: 'dine_in',
      tableId: 1,
      status: 'open',
      updatedAt: 5000,
      items: [],
      events: [],
    });
    mockOrdersSyncItems.mockResolvedValue({
      id: 10,
      orderNo: 42,
      type: 'dine_in',
      tableId: 1,
      status: 'open',
      updatedAt: 6000,
      items: [
        {
          id: 201,
          orderId: 10,
          itemId: 1,
          itemName: 'Burger',
          unitPriceHalalas: 2300,
          vatRateBp: 1500,
          qty: 1,
          totalHalalas: 2300,
          notes: null,
          createdAt: 1000,
          updatedAt: 1000,
          createdBy: null,
          updatedBy: null,
        },
      ],
      events: [],
    });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Add item
    fireEvent.click(screen.getByText('Burger'));

    // Select table via picker
    fireEvent.click(screen.getByText('Select table…'));

    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('T1'));

    await waitFor(() => {
      expect(screen.getByText('Table: T1')).toBeInTheDocument();
    });

    // Click create
    fireEvent.click(screen.getByText('Create Order'));

    await waitFor(() => {
      expect(mockOrdersCreate).toHaveBeenCalledWith({
        type: 'dine_in',
        tableId: 1,
      });
    });

    // B6: After creation, the code fetches the order first to get updatedAt
    // mockOrdersGet was already set up in beforeEach

    await waitFor(() => {
      expect(mockOrdersSyncItems).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          baseUpdatedAt: 5000,
          items: [{ itemId: 1, qty: 1 }],
        }),
      );
    });
  });

  it('takeaway + items, no table: Create calls create+sync', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 20, orderNo: 5, uuid: 'test' });
    // B6: After creation, the code fetches the order to get updatedAt
    mockOrdersGet.mockResolvedValue({
      id: 20,
      orderNo: 5,
      uuid: 'test',
      type: 'takeaway',
      status: 'open',
      updatedAt: 5000,
      items: [],
      events: [],
    });
    mockOrdersSyncItems.mockResolvedValue({
      id: 20,
      orderNo: 5,
      type: 'takeaway',
      status: 'open',
      updatedAt: 6000,
      items: [],
      events: [],
    });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Switch to takeaway
    fireEvent.click(screen.getByText('Takeaway'));

    // Add item
    fireEvent.click(screen.getByText('Burger'));

    // Create
    fireEvent.click(screen.getByText('Create Order'));

    await waitFor(() => {
      expect(mockOrdersCreate).toHaveBeenCalledWith({
        type: 'takeaway',
        tableId: undefined,
      });
    });

    await waitFor(() => {
      expect(mockOrdersSyncItems).toHaveBeenCalledWith(
        20,
        expect.objectContaining({
          items: [{ itemId: 1, qty: 1 }],
        }),
      );
    });
  });

  it('deep-link /?tableId=5 pre-selects table, Create works with sync', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 30, orderNo: 7, uuid: 'test' });
    // B6: After creation, the code fetches the order to get updatedAt
    mockOrdersGet.mockResolvedValue({
      id: 30,
      orderNo: 7,
      uuid: 'test',
      type: 'dine_in',
      tableId: 5,
      status: 'open',
      updatedAt: 5000,
      items: [],
      events: [],
    });
    mockOrdersSyncItems.mockResolvedValue({
      id: 30,
      orderNo: 7,
      type: 'dine_in',
      tableId: 5,
      status: 'open',
      updatedAt: 6000,
      items: [],
      events: [],
    });

    renderOrderPage(['/?tableId=5']);

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Table: T5')).toBeInTheDocument();
    });

    // Add item
    fireEvent.click(screen.getByText('Burger'));

    // Click create
    fireEvent.click(screen.getByText('Create Order'));

    await waitFor(() => {
      expect(mockOrdersCreate).toHaveBeenCalledWith({
        type: 'dine_in',
        tableId: 5,
      });
    });
  });

  it('dine-in with table: re-clicking Dine-in preserves table selection', async () => {
    mockOrdersCreate.mockResolvedValue({ id: 1, orderNo: 1, uuid: 'test' });

    renderOrderPage(['/?tableId=1']);

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Table: T1')).toBeInTheDocument();
    });

    // Click Dine-in button again
    fireEvent.click(screen.getByText('Dine-in'));

    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });

    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) fireEvent.click(backdrop);

    await waitFor(() => {
      expect(screen.getByText('Table: T1')).toBeInTheDocument();
    });
  });

  it('shows "Select table…" when dine-in and no tableId', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    expect(screen.getByText('Select table…')).toBeInTheDocument();
    expect(screen.queryByText(/^Table:/)).not.toBeInTheDocument();
  });

  it('hides table control when takeaway is selected', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Takeaway'));
    expect(screen.queryByText('Select table…')).not.toBeInTheDocument();
  });
});
