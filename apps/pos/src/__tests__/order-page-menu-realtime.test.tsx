import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderPage } from '../pages/OrderPage';

// --- realtime mock (subscribers + reconnect callback captured for tests) ---
const listeners = new Map<string, (...args: unknown[]) => void>();
let onReconnectCb: (() => void) | null = null;

vi.mock('../realtime', () => ({
  realtime: {
    subscribe: (type: string, fn: (...args: unknown[]) => void) => {
      listeners.set(type, fn);
      return () => {
        listeners.delete(type);
      };
    },
    onReconnect: (cb: () => void) => {
      onReconnectCb = cb;
    },
    offReconnect: () => {
      onReconnectCb = null;
    },
  },
}));

// Mock API client (same pattern as order-page-item-tile.test.tsx)
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

const categories = [
  { id: 1, name: 'Creams', sortOrder: 0, isActive: true, createdAt: 0, updatedAt: 0 },
];

const subcategories = [
  {
    id: 1,
    categoryId: 1,
    name: 'Cold',
    sortOrder: 0,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: null,
    updatedBy: null,
  },
  {
    id: 2,
    categoryId: 1,
    name: 'Hot',
    sortOrder: 1,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: null,
    updatedBy: null,
  },
];

const itemA = {
  id: 1,
  categoryId: 1,
  subcategoryId: 1,
  name: 'Cold Zinger',
  priceHalalas: 2300,
  vatRateBp: 1500,
  sortOrder: 0,
  isActive: true,
  nameAr: null,
  createdAt: 1000,
  updatedAt: 1000,
  createdBy: null,
  updatedBy: null,
};

const itemB = {
  id: 2,
  categoryId: 1,
  subcategoryId: 2,
  name: 'Hot Zinger',
  priceHalalas: 2600,
  vatRateBp: 1500,
  sortOrder: 1,
  isActive: true,
  nameAr: null,
  createdAt: 1000,
  updatedAt: 1000,
  createdBy: null,
  updatedBy: null,
};

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

/** Fire a captured realtime event; wraps state updates in act. */
async function fireWsEvent(type: string): Promise<void> {
  const handler = listeners.get(type);
  await act(async () => {
    handler?.({ itemId: 1, userId: 1 }, Date.now());
  });
}

/** Invoke the captured reconnect callback. */
async function fireReconnect(): Promise<void> {
  await act(async () => {
    onReconnectCb?.();
  });
}

describe('OrderPage — live menu updates over WebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    onReconnectCb = null;
    mockListActiveUsers.mockResolvedValue([]);
    mockDayCurrent.mockResolvedValue({ status: 'open', businessDate: '2026-07-22' });
    mockListCategories.mockResolvedValue(categories);
    mockListSubcategories.mockResolvedValue(subcategories);
    mockListItems.mockResolvedValue([itemA]);
    mockTablesList.mockResolvedValue(tables);
  });

  it('item.updated hides a now-inactive item', async () => {
    renderOrderPage();

    expect(await screen.findByText('Cold Zinger')).toBeInTheDocument();

    // Admin toggled the item inactive on another terminal.
    mockListItems.mockResolvedValue([{ ...itemA, isActive: false }]);
    await fireWsEvent('item.updated');

    await waitFor(() => {
      expect(screen.queryByText('Cold Zinger')).not.toBeInTheDocument();
    });
  });

  it('item.created reloads and shows a new item', async () => {
    renderOrderPage();

    expect(await screen.findByText('Cold Zinger')).toBeInTheDocument();
    expect(screen.queryByText('Hot Zinger')).not.toBeInTheDocument();

    // Admin created a new item on another terminal.
    mockListItems.mockResolvedValue([itemA, itemB]);
    await fireWsEvent('item.created');

    expect(await screen.findByText('Hot Zinger')).toBeInTheDocument();
  });

  it('WS reload preserves the selected subcategory chip', async () => {
    mockListItems.mockResolvedValue([itemA, itemB]);
    renderOrderPage();

    expect(await screen.findByText('Cold Zinger')).toBeInTheDocument();
    expect(screen.getByText('Hot Zinger')).toBeInTheDocument();

    // Drill into the "Hot" subcategory.
    fireEvent.click(screen.getByRole('button', { name: 'Hot' }));
    await waitFor(() => {
      expect(screen.queryByText('Cold Zinger')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Hot Zinger')).toBeInTheDocument();

    // A WS menu reload must keep the "Hot" chip selected.
    await fireWsEvent('item.updated');

    const hotChip = screen.getByRole('button', { name: 'Hot' });
    expect(hotChip).toHaveClass('text-brand-500');
    expect(hotChip).toHaveClass('border-b-2');
    expect(hotChip).toHaveClass('border-brand-500');
    expect(screen.getByText('Hot Zinger')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Cold Zinger')).not.toBeInTheDocument();
    });
  });

  it('reconnect reloads the menu', async () => {
    renderOrderPage();

    expect(await screen.findByText('Cold Zinger')).toBeInTheDocument();
    expect(onReconnectCb).not.toBeNull();

    mockListItems.mockResolvedValue([itemA, itemB]);
    await fireReconnect();

    expect(await screen.findByText('Hot Zinger')).toBeInTheDocument();
  });
});
