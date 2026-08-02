import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrdersPage } from '../pages/OrdersPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockList, mockGet, mockListActiveUsers, mockRealtimeSubscribe, mockRealtimeOnReconnect } =
  vi.hoisted(() => {
    const mockList = vi.fn();
    const mockGet = vi.fn();
    const mockListActiveUsers = vi.fn();
    return {
      mockList,
      mockGet,
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
      get: (...args: any[]) => mockGet(...args),
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

function orderDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orderNo: 42,
    documentId: 'INV26-0042',
    uuid: 'u1',
    type: 'takeaway',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 4000,
    vatHalalas: 600,
    totalHalalas: 4600,
    discountHalalas: 0,
    notes: null,
    createdAt: 1700000000,
    updatedAt: 1700000000,
    createdBy: null,
    updatedBy: null,
    kitchenPrintedQty: 0,
    itemQtyTotal: 0,
    items: [],
    payments: [],
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

describe('OrdersPage — order type labels (delivery partner hints)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([summary()]);
    mockListActiveUsers.mockResolvedValue([]);
    mockRealtimeSubscribe.mockReturnValue(vi.fn());
  });

  it('list row shows partner title and ref for takeaway + partner order', async () => {
    mockList.mockResolvedValue([
      summary({
        type: 'takeaway',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-883129',
      }),
    ]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('HungerStation / HS-883129')).toBeInTheDocument();
    });
    expect(screen.queryByText('Takeaway')).not.toBeInTheDocument();
  });

  it('list row shows bare partner title when ref is empty', async () => {
    mockList.mockResolvedValue([
      summary({ type: 'takeaway', deliveryPartnerTitle: 'HungerStation', deliveryExternalRef: '' }),
    ]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('HungerStation')).toBeInTheDocument();
    });
  });

  it('walk-in takeaway still shows "Takeaway"', async () => {
    mockList.mockResolvedValue([summary({ type: 'takeaway' })]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('Takeaway')).toBeInTheDocument();
    });
  });

  it('dine-in still shows "Dine-in" even when partner fields are present', async () => {
    mockList.mockResolvedValue([
      summary({
        type: 'dine_in',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-1',
      }),
    ]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('Dine-in')).toBeInTheDocument();
    });
  });

  it('detail header uses the same partner label', async () => {
    mockList.mockResolvedValue([
      summary({
        id: 7,
        documentId: 'INV26-0042',
        type: 'takeaway',
        deliveryPartnerTitle: 'Jahez',
        deliveryExternalRef: 'JH-42',
      }),
    ]);
    mockGet.mockResolvedValue(
      orderDetail({
        id: 7,
        type: 'takeaway',
        deliveryPartnerTitle: 'Jahez',
        deliveryExternalRef: 'JH-42',
      }),
    );

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('Jahez / JH-42')).toBeInTheDocument();
    });

    const row = screen.getByText('Jahez / JH-42');
    fireEvent.click(row);

    await waitFor(() => {
      // Detail header paragraph shows the same label (getAllByText because
      // the list row remains mounted next to the detail pane).
      expect(screen.getAllByText('Jahez / JH-42').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });
  });
});
