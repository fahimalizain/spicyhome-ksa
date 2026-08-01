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
const mockOrdersList = vi.fn().mockResolvedValue([]);
const mockOrdersUpdate = vi.fn();
const mockOrdersCreate = vi.fn();
const mockOrdersSyncItems = vi.fn();

/** Mutable current user — flip updateOrder per test. */
let mockMe: Record<string, unknown> = {};

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
      list: (...args: any[]) => mockOrdersList(...args),
      get: (...args: any[]) => mockOrdersGet(...args),
      create: (...args: any[]) => mockOrdersCreate(...args),
      syncItems: (...args: any[]) => mockOrdersSyncItems(...args),
      update: (...args: any[]) => mockOrdersUpdate(...args),
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
  getMe: () => mockMe,
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
];

const tables = [
  { id: 1, name: 'T1', isActive: true, createdAt: 1000, updatedAt: 1000 },
  { id: 2, name: 'T2', isActive: true, createdAt: 1000, updatedAt: 1000 },
];

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
    subtotalHalalas: 2300,
    vatHalalas: 300,
    totalHalalas: 2600,
    discountHalalas: 0,
    isStandardInvoice: false,
    zatcaBuyerDetails: null,
    createdAt: 1000,
    updatedAt: 5000,
    createdBy: null,
    updatedBy: null,
    items: [
      {
        id: 101,
        orderId: 1,
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
    payments: [],
    ...overrides,
  };
}

function makeOpenOrderSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 99,
    orderNo: 7,
    documentId: 'INV26-0007',
    uuid: 'occ-uuid',
    type: 'dine_in',
    tableId: 2,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 0,
    vatHalalas: 0,
    totalHalalas: 0,
    discountHalalas: 0,
    createdAt: 5000,
    updatedAt: 5000,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function renderOrderPage(initialEntries: string[] = ['/']) {
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
  mockListItems.mockResolvedValue(items);
  mockTablesList.mockResolvedValue(tables);
}

describe('OrderPage — type/table switch on open orders (#109)', () => {
  beforeEach(() => {
    // resetAllMocks so mockResolvedValue implementations from previous tests
    // (e.g. occupied open-order lists) do not leak into this test.
    vi.resetAllMocks();
    mockOrdersList.mockResolvedValue([]);
    mockDayIsOpen();
    mockMe = {
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
    };
  });

  // ── Pre-order: local-only staging ──

  it('pre-order: Takeaway toggle is local, no API call', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Takeaway'));

    expect(mockOrdersUpdate).not.toHaveBeenCalled();
    // Table control hidden for takeaway
    expect(screen.queryByText('Select table…')).not.toBeInTheDocument();
  });

  it('pre-order: table picker selects locally without API', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Select table…'));
    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('T2'));

    await waitFor(() => {
      expect(screen.getByText('Table: T2')).toBeInTheDocument();
    });
    expect(mockOrdersUpdate).not.toHaveBeenCalled();
  });

  it('pre-order without update_order permission: controls still enabled, local-only', async () => {
    mockMe = { ...mockMe, updateOrder: false };

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Pre-create type/table toggles stay ungated by update_order (pre-#109)
    expect(screen.getByText('Takeaway').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Dine-in').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Select table…').closest('button')).not.toBeDisabled();

    // Switching is local-only — no API calls
    fireEvent.click(screen.getByText('Takeaway'));
    expect(mockOrdersUpdate).not.toHaveBeenCalled();
    expect(screen.queryByText('Select table…')).not.toBeInTheDocument();

    // Table picker still works locally
    fireEvent.click(screen.getByText('Dine-in'));
    await waitFor(() => {
      expect(screen.getByText('Select table…')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Select table…'));
    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('T2'));

    await waitFor(() => {
      expect(screen.getByText('Table: T2')).toBeInTheDocument();
    });
    expect(mockOrdersUpdate).not.toHaveBeenCalled();
  });

  // ── Open clean order: API calls with expected bodies ──

  it('open clean order: Takeaway click PATCHes type only and hides table control', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1 }));
    mockOrdersUpdate.mockResolvedValue(
      makeOrder({ type: 'takeaway', tableId: null, updatedAt: 6000 }),
    );

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Clean open order → controls enabled
    expect(screen.getByText('Takeaway').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Dine-in').closest('button')).not.toBeDisabled();

    fireEvent.click(screen.getByText('Takeaway'));

    await waitFor(() => {
      expect(mockOrdersUpdate).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 5000,
        type: 'takeaway',
      });
    });

    // Takeaway has no table control
    await waitFor(() => {
      expect(screen.queryByText(/Table:/)).not.toBeInTheDocument();
    });
  });

  it('open clean order: already takeaway → Takeaway click is a no-op', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'takeaway', tableId: null }));
    mockOrdersUpdate.mockResolvedValue(makeOrder({ type: 'takeaway', tableId: null }));

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Takeaway'));

    // No update call — already takeaway
    expect(mockOrdersUpdate).not.toHaveBeenCalled();
  });

  it('open clean order: Dine-in opens picker, selecting free table PATCHes dine_in + tableId and closes picker', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'takeaway', tableId: null }));
    mockOrdersUpdate.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 2, updatedAt: 6000 }));

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Switch to dine-in: opens the picker without PATCHing yet
    fireEvent.click(screen.getByText('Dine-in'));
    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });
    expect(mockOrdersUpdate).not.toHaveBeenCalled();

    // Pick T2 (free)
    fireEvent.click(screen.getByText('T2'));

    await waitFor(() => {
      expect(mockOrdersUpdate).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 5000,
        type: 'dine_in',
        tableId: 2,
      });
    });

    // Picker closed, table shown
    await waitFor(() => {
      expect(screen.queryByText('Select Table')).not.toBeInTheDocument();
      expect(screen.getByText('Table: T2')).toBeInTheDocument();
    });
  });

  // ── Occupancy: own table selectable, other occupied not ──

  it('open clean order: own table selectable, other occupied table disabled', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1 }));
    // The current order (id 1) sits on T1 — exclude-self must keep T1 enabled.
    // A different open order (id 100) sits on T2 — T2 must be disabled.
    mockOrdersList.mockResolvedValue([
      makeOpenOrderSummary({ id: 1, tableId: 1 }),
      makeOpenOrderSummary({ id: 100, tableId: 2 }),
    ]);

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dine-in'));
    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });

    // Own table (T1) is NOT disabled even though an open order (this one) sits on it
    const t1Btn = screen.getByText('T1').closest('button')!;
    expect(t1Btn).not.toBeDisabled();

    // Other order's table (T2) IS disabled
    const t2Btn = screen.getByText('T2').closest('button')!;
    expect(t2Btn).toBeDisabled();
  });

  it('open clean order: selecting own table is a no-op PATCH (same table)', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1 }));
    mockOrdersUpdate.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1 }));

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dine-in'));
    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('T1'));

    await waitFor(() => {
      expect(mockOrdersUpdate).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 5000,
        type: 'dine_in',
        tableId: 1,
      });
    });
    // Picker closes
    await waitFor(() => {
      expect(screen.queryByText('Select Table')).not.toBeInTheDocument();
    });
  });

  // ── Dirty / permission / status gating ──

  it('open dirty order: type/table controls disabled', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1 }));
    mockOrdersUpdate.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1 }));

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Make the cart dirty
    fireEvent.click(screen.getAllByText('Burger')[0]);
    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });

    const takeawayBtn = screen.getByText('Takeaway').closest('button')!;
    expect(takeawayBtn).toBeDisabled();
    const dineInBtn = screen.getByText('Dine-in').closest('button')!;
    expect(dineInBtn).toBeDisabled();
    expect(screen.getByText(/Table: T1/).closest('button')).toBeDisabled();
  });

  it('open clean order without update_order permission: controls disabled', async () => {
    mockMe = { ...mockMe, updateOrder: false };
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1 }));

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    expect(screen.getByText('Takeaway').closest('button')).toBeDisabled();
    expect(screen.getByText('Dine-in').closest('button')).toBeDisabled();
    expect(screen.getByText(/Table: T1/).closest('button')).toBeDisabled();
  });

  it('paid order: type/table controls disabled', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ status: 'paid' }));

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    expect(screen.getByText('Takeaway').closest('button')).toBeDisabled();
    expect(screen.getByText('Dine-in').closest('button')).toBeDisabled();
  });

  // ── 409 occupied: error shown, picker stays open, state kept ──

  it('open order: 409 occupied shows error, keeps previous type and picker open', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'takeaway', tableId: null }));
    mockOrdersUpdate.mockRejectedValue(
      new Error('HTTP 409 Conflict: Table already has an open order #7 (id 99).'),
    );

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dine-in'));
    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('T2'));

    await waitFor(() => {
      expect(screen.getByText(/Table already has an open order #7 \(id 99\)/)).toBeInTheDocument();
    });

    // Picker stays open; order is still takeaway (no table control shown)
    expect(screen.getByText('Select Table')).toBeInTheDocument();
    expect(screen.queryByText(/Table:/)).not.toBeInTheDocument();
  });

  // ── Remote change while clean: silent hydrate (decision A) ──

  it('clean open order: remote type/table change hydrates without conflict dialog', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'takeaway', tableId: null }));
    mockOrdersList.mockResolvedValue([]);

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Simulate another terminal switching this order to dine_in on T1
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1, updatedAt: 9000 }));

    await waitFor(
      () => {
        expect(screen.getByText('Table: T1')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // No conflict dialog — the cart was clean
    expect(screen.queryByText('Order Updated Elsewhere')).not.toBeInTheDocument();
  }, 8000);
});
