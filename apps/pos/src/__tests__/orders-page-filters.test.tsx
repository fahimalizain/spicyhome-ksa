import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { getServiceDayString } from '@spicyhome/shared';
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

const orderSummary = {
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
};

function renderOrdersPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  );
}

/** Last call's filter object passed to client.orders.list. */
function lastListFilters(): Record<string, unknown> {
  const calls = mockList.mock.calls as unknown as Array<[unknown]>;
  const last = calls[calls.length - 1];
  return (last?.[0] ?? {}) as Record<string, unknown>;
}

describe('OrdersPage — filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([orderSummary]);
    mockListActiveUsers.mockResolvedValue([
      { id: 1, username: 'admin', name: 'Administrator' },
      { id: 2, username: 'cashier', name: 'Cashier' },
    ]);
    mockRealtimeSubscribe.mockReturnValue(vi.fn());
  });

  it('loads with default filters: current service day + open only + no user', async () => {
    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    const filters = lastListFilters();
    expect(filters.date).toBe(getServiceDayString(Date.now()));
    expect(filters.status).toBe('open');
    expect(filters.userId).toBeUndefined();

    // Open chip is active by default
    const openChip = screen.getByRole('button', { name: 'Open' });
    expect(openChip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Paid' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Voided' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Refunded' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('date change reloads with the new date', async () => {
    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    const dateInput = screen.getByLabelText('Date') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-07-20' } });

    await waitFor(() => {
      expect(lastListFilters().date).toBe('2026-07-20');
    });
    expect(mockList).toHaveBeenCalled();
  });

  it('status multiselect sends comma-joined statuses; clearing all omits status', async () => {
    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    // Add Paid → open,paid
    fireEvent.click(screen.getByRole('button', { name: 'Paid' }));
    await waitFor(() => {
      expect(lastListFilters().status).toBe('open,paid');
    });

    // Remove Open → paid
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => {
      expect(lastListFilters().status).toBe('paid');
    });

    // Remove Paid → no status filter (undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Paid' }));
    await waitFor(() => {
      expect(lastListFilters().status).toBeUndefined();
    });
  });

  it('user select sends userId; All users sends undefined', async () => {
    const user = userEvent.setup();
    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    // Filter changes keep the page chrome (incl. the filter bar) mounted —
    // only the list area shows a spinner while the reload is in flight.
    await user.selectOptions(screen.getByLabelText('User') as HTMLSelectElement, '2');
    await waitFor(() => {
      expect(lastListFilters().userId).toBe(2);
    });

    await user.selectOptions(screen.getByLabelText('User') as HTMLSelectElement, '');
    await waitFor(() => {
      expect(lastListFilters().userId).toBeUndefined();
    });
  });

  it('realtime refresh reuses the current filters', async () => {
    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    // Change a filter first
    fireEvent.change(screen.getByLabelText('Date') as HTMLInputElement, {
      target: { value: '2026-07-20' },
    });
    await waitFor(() => {
      expect(lastListFilters().date).toBe('2026-07-20');
    });

    // Trigger a realtime refresh
    const calls = mockRealtimeSubscribe.mock.calls as unknown as [string, () => Promise<void>][];
    const handler = calls.find(([e]) => e === 'order.created')![1];
    await act(async () => {
      await handler();
    });

    expect(lastListFilters()).toEqual({ date: '2026-07-20', status: 'open' });
    expect(lastListFilters().userId).toBeUndefined();
  });

  it('keeps the filter bar mounted while a filter reload is in flight', async () => {
    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    // Delay the next list response so the reload stays in flight below.
    let resolveList!: (value: unknown) => void;
    mockList.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );

    // Toggle a status chip → filter-driven reload begins
    fireEvent.click(screen.getByRole('button', { name: 'Paid' }));

    // Page chrome + filter chips stay in the document (no full-page spinner)
    expect(screen.getByRole('heading', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voided' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refunded' })).toBeInTheDocument();
    expect(screen.queryByText('Loading orders...')).not.toBeInTheDocument();
    // Only the list area shows the reload spinner
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await act(async () => {
      resolveList([orderSummary]);
    });
  });

  it('shows "No orders match filters" when the filtered list is empty', async () => {
    mockList.mockResolvedValue([]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('No orders match filters')).toBeInTheDocument();
    });
  });
});
