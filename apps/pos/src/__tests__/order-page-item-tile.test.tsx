import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderPage } from '../pages/OrderPage';

// Mock API client (same pattern as order-cart-sync.test.tsx)
const mockDayCurrent = vi.fn();
const mockListCategories = vi.fn();
const mockListSubcategories = vi.fn();
const mockListItems = vi.fn();
const mockTablesList = vi.fn();
const mockListActiveUsers = vi.fn();

vi.mock('../api', () => ({
  client: {
    auth: {
      login: vi.fn(),
      me: vi.fn(),
      listActiveUsers: (...args: any[]) => mockListActiveUsers(...args),
    },
    menu: {
      listCategories: (...args: any[]) => mockListCategories(...args),
      listSubcategories: (...args: any[]) => mockListSubcategories(...args),
      listItems: (...args: any[]) => mockListItems(...args),
    },
    tables: {
      list: (...args: any[]) => mockTablesList(...args),
    },
    deliveryPartners: {
      listEnabled: vi.fn().mockResolvedValue([]),
    },
    orders: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      syncItems: vi.fn(),
      get: vi.fn(),
      pay: vi.fn(),
      void: vi.fn(),
      refund: vi.fn(),
      getRefunds: vi.fn(),
      getEvents: vi.fn(),
      verifyEvents: vi.fn(),
      reprint: vi.fn(),
      sendToKitchen: vi.fn(),
      submit: vi.fn(),
      update: vi.fn(),
      updatePartner: vi.fn(),
      updateStandardInvoice: vi.fn(),
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

const LONG_NAME = 'Cream MushroomChicken Super Long Name That Wraps';

const categories = [
  { id: 1, name: 'Creams', sortOrder: 0, isActive: true, createdAt: 0, updatedAt: 0 },
];

const subcategories = [
  {
    id: 1,
    categoryId: 1,
    name: 'All',
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
    name: LONG_NAME,
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
];

const tables = [{ id: 1, name: 'T1', isActive: true, createdAt: 1000, updatedAt: 1000 }];

function renderOrderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<OrderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrderPage — menu item tile overflow containment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListActiveUsers.mockResolvedValue([]);
    mockDayCurrent.mockResolvedValue({ status: 'open', businessDate: '2026-07-22' });
    mockListCategories.mockResolvedValue(categories);
    mockListSubcategories.mockResolvedValue(subcategories);
    mockListItems.mockResolvedValue(items);
    mockTablesList.mockResolvedValue(tables);
  });

  it('menu tile button and name span contain long item names', async () => {
    renderOrderPage();

    // The long name renders inside the tile
    const nameSpan = await screen.findByText(LONG_NAME);
    expect(nameSpan).toBeInTheDocument();

    // Tile button: grid-safe containment classes
    const tileButton = nameSpan.closest('button')!;
    expect(tileButton).not.toBeNull();
    expect(tileButton).toHaveClass('min-w-0');
    expect(tileButton).toHaveClass('w-full');
    expect(tileButton).toHaveClass('overflow-hidden');
    expect(tileButton).toHaveClass('justify-start');
    expect(tileButton).toHaveClass('touch-target');

    // Name span: wraps long unbroken tokens, clamps to 3 lines, full width,
    // and exposes the full name via title for clamped text
    expect(nameSpan).toHaveClass('w-full');
    expect(nameSpan).toHaveClass('break-words');
    expect(nameSpan).toHaveClass('line-clamp-3');
    expect(nameSpan).toHaveAttribute('title', LONG_NAME);

    // Price span: never squashed
    const priceSpan = within(tileButton).getByText(/SAR$/);
    expect(priceSpan).toHaveClass('shrink-0');
  });
});
