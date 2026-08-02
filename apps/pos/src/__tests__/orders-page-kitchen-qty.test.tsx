import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrdersPage } from '../pages/OrdersPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockList, mockListActiveUsers, mockRealtimeSubscribe, mockRealtimeOnReconnect } =
  vi.hoisted(() => {
    const mockList = vi.fn();
    const mockListActiveUsers = vi.fn();
    return {
      mockList,
      mockListActiveUsers,
      mockRealtimeSubscribe: vi.fn(() => vi.fn()),
      mockRealtimeOnReconnect: vi.fn(),
    };
  });

vi.mock('../api', () => ({
  client: {
    auth: {
      listActiveUsers: (...args: any[]) => mockListActiveUsers(...args),
    },
    orders: {
      list: (...args: any[]) => mockList(...args),
      get: vi.fn(),
      getRefunds: vi.fn().mockResolvedValue([]),
      getEvents: vi.fn().mockResolvedValue([]),
    },
  },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  getMe: vi.fn(() => ({ id: 1, username: 'admin', name: 'Admin' })),
  isAuthenticated: vi.fn(() => true),
}));

vi.mock('../realtime', () => ({
  realtime: {
    subscribe: mockRealtimeSubscribe,
    onReconnect: mockRealtimeOnReconnect,
    offReconnect: vi.fn(),
  },
}));

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orderNo: 42,
    documentId: 'INV26-0042',
    uuid: 'u1',
    type: 'dine_in',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 4000,
    vatHalalas: 600,
    totalHalalas: 4600,
    discountHalalas: 0,
    createdAt: 1700000000,
    updatedAt: 1700000000,
    createdBy: null,
    updatedBy: null,
    kitchenPrintedQty: 0,
    itemQtyTotal: 0,
    ...overrides,
  };
}

function renderOrdersPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  );
}

describe('OrdersPage — kitchen qty printed subtitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([summary()]);
    mockListActiveUsers.mockResolvedValue([]);
    mockRealtimeSubscribe.mockReturnValue(vi.fn());
  });

  it('open order shows "Kitchen Qty Printed: 2 / 5" from list payload fields', async () => {
    mockList.mockResolvedValue([summary({ kitchenPrintedQty: 2, itemQtyTotal: 5 })]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText(/Kitchen Qty Printed: 2 \/ 5/)).toBeInTheDocument();
    });
    // Time and kitchen qty coexist inline in the same card meta row.
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument();
  });

  it('mismatch (printed < total) applies the amber highlight class', async () => {
    mockList.mockResolvedValue([summary({ kitchenPrintedQty: 2, itemQtyTotal: 5 })]);

    renderOrdersPage();

    await waitFor(() => {
      const line = screen.getByText(/Kitchen Qty Printed: 2 \/ 5/);
      expect(line.className).toContain('text-amber-400');
    });
  });

  it('match (printed === total) stays gray without the amber highlight', async () => {
    mockList.mockResolvedValue([summary({ kitchenPrintedQty: 5, itemQtyTotal: 5 })]);

    renderOrdersPage();

    await waitFor(() => {
      const line = screen.getByText(/Kitchen Qty Printed: 5 \/ 5/);
      // Match case: no highlight on the span itself; gray comes from the
      // parent meta row (inherited color).
      expect(line.className).not.toContain('text-amber-400');
      expect(line.className).not.toContain('font-semibold');
      expect(line.closest('.text-gray-400')).not.toBeNull();
    });
  });

  it('printed exceeding total (qty decreased after print) is still highlighted', async () => {
    mockList.mockResolvedValue([summary({ kitchenPrintedQty: 5, itemQtyTotal: 2 })]);

    renderOrdersPage();

    await waitFor(() => {
      const line = screen.getByText(/Kitchen Qty Printed: 5 \/ 2/);
      expect(line.className).toContain('text-amber-400');
    });
  });

  it('empty open order still shows the line (0 / 0)', async () => {
    mockList.mockResolvedValue([summary({ kitchenPrintedQty: 0, itemQtyTotal: 0 })]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText(/Kitchen Qty Printed: 0 \/ 0/)).toBeInTheDocument();
    });
  });

  it('paid order does NOT show the kitchen qty line even when fields are present', async () => {
    mockList.mockResolvedValue([
      summary({ status: 'paid', kitchenPrintedQty: 4, itemQtyTotal: 4 }),
    ]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Kitchen Qty Printed/)).not.toBeInTheDocument();
  });

  it('voided order does NOT show the kitchen qty line', async () => {
    mockList.mockResolvedValue([
      summary({ status: 'voided', kitchenPrintedQty: 1, itemQtyTotal: 3 }),
    ]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Kitchen Qty Printed/)).not.toBeInTheDocument();
  });
});
