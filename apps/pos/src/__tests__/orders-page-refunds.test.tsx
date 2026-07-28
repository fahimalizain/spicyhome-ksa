import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrdersPage } from '../pages/OrdersPage';
import type { OrderRefundResponse } from '@spicyhome/client-ts';

const mockList = vi.fn();
const mockGet = vi.fn();
const mockGetRefunds = vi.fn();
const mockGetEvents = vi.fn();
const mockVerifyEvents = vi.fn();
const mockReprint = vi.fn();

const { mockRealtimeSubscribe, mockRealtimeOnReconnect, mockRealtimeOffReconnect } = vi.hoisted(
  () => ({
    mockRealtimeSubscribe: vi.fn(() => vi.fn()),
    mockRealtimeOnReconnect: vi.fn(),
    mockRealtimeOffReconnect: vi.fn(),
  }),
);

vi.mock('../api', () => ({
  client: {
    orders: {
      list: (...args: any[]) => mockList(...args),
      get: (...args: any[]) => mockGet(...args),
      getRefunds: (...args: any[]) => mockGetRefunds(...args),
      getEvents: (...args: any[]) => mockGetEvents(...args),
      verifyEvents: (...args: any[]) => mockVerifyEvents(...args),
      reprint: (...args: any[]) => mockReprint(...args),
      refund: vi.fn(),
    },
    paymentMethods: {
      listEnabled: vi.fn().mockResolvedValue([]),
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

vi.mock('../realtime', () => ({
  realtime: {
    subscribe: mockRealtimeSubscribe,
    onReconnect: mockRealtimeOnReconnect,
    offReconnect: mockRealtimeOffReconnect,
  },
}));

const paidOrder = {
  id: 1,
  orderNo: 42,
  uuid: 'u1',
  type: 'dine_in',
  tableId: null,
  dayOpeningId: 1,
  status: 'paid',
  subtotalHalalas: 4000,
  vatHalalas: 600,
  totalHalalas: 4600,
  discountHalalas: 0,
  createdAt: 1700000000,
  updatedAt: 1700000000,
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
      qty: 2,
      totalHalalas: 4600,
      notes: null,
      createdAt: 1700000000,
      updatedAt: 1700000000,
      createdBy: null,
      updatedBy: null,
    },
  ],
  events: [],
  payments: [
    {
      methodId: 'cash',
      methodTitle: 'Cash',
      amountHalalas: 4600,
      tenderedHalalas: 5000,
      changeHalalas: 400,
    },
  ],
};

const orderSummary = {
  id: 1,
  orderNo: 42,
  uuid: 'u1',
  type: 'dine_in',
  tableId: null,
  dayOpeningId: 1,
  status: 'paid',
  subtotalHalalas: 4000,
  vatHalalas: 600,
  totalHalalas: 4600,
  discountHalalas: 0,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: null,
  updatedBy: null,
};

const sampleRefund: OrderRefundResponse = {
  id: 1,
  orderId: 1,
  userId: 1,
  methodId: 'cash',
  methodTitle: 'Cash',
  subtotalHalalas: 2000,
  vatHalalas: 300,
  totalHalalas: 2300,
  reason: 'Customer changed mind',
  createdAt: 1700001000,
  items: [
    {
      id: 1,
      orderItemId: 101,
      itemName: 'Burger',
      unitPriceHalalas: 2300,
      vatRateBp: 1500,
      qty: 1,
      totalHalalas: 2300,
    },
  ],
};

function renderOrdersPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  );
}

describe('OrdersPage — refunds list and modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([orderSummary]);
    mockGet.mockResolvedValue(paidOrder);
    mockGetEvents.mockResolvedValue([]);
    mockVerifyEvents.mockResolvedValue({ valid: true });
    mockRealtimeSubscribe.mockReturnValue(vi.fn());
  });

  it('does not show Refunds section when order has no refunds', async () => {
    mockGetRefunds.mockResolvedValue([]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    // Click order to open detail
    fireEvent.click(screen.getByText('#42'));

    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    // Refunds section should NOT be visible
    expect(screen.queryByText('Refunds')).not.toBeInTheDocument();
  });

  it('shows Refunds section with correct data when order has refunds', async () => {
    mockGetRefunds.mockResolvedValue([sampleRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#42'));

    // Wait for order detail to load
    await waitFor(() => {
      expect(screen.getByText('Order #42')).toBeInTheDocument();
    });

    // Refunds section should be visible
    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // Should show method title (Cash appears in both Payments and Refunds section)
    const cashElements = screen.getAllByText('Cash');
    expect(cashElements.length).toBeGreaterThanOrEqual(2);

    // 2300 halalas = 23.00 SAR — unique refund total
    expect(screen.getByText('23.00 SAR')).toBeInTheDocument();
  });

  it('opens RefundDetailModal when a refund row is clicked', async () => {
    mockGetRefunds.mockResolvedValue([sampleRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#42'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // Click the refund row via its unique total (23.00 SAR)
    fireEvent.click(screen.getByText('23.00 SAR'));

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText('Refund #1')).toBeInTheDocument();
    });

    // Modal should show method
    expect(screen.getByText('(cash)')).toBeInTheDocument();

    // Modal should show reason
    expect(screen.getByText('Customer changed mind')).toBeInTheDocument();

    // Modal should show item (Burger appears in order items too, verify 2+)
    const burgerElements = screen.getAllByText('Burger');
    expect(burgerElements.length).toBeGreaterThanOrEqual(2);

    // Modal should show totals
    // Constraint: the totals section has multiple elements; verify at least the Total label appears
    const totalLabels = screen.getAllByText('Total');
    expect(totalLabels.length).toBeGreaterThanOrEqual(1);

    // Modal should show subtotal
    expect(screen.getByText('20.00 SAR')).toBeInTheDocument();
  });

  it('closes RefundDetailModal when close button (✕) is clicked', async () => {
    mockGetRefunds.mockResolvedValue([sampleRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#42'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // Click the refund row via its unique total
    fireEvent.click(screen.getByText('23.00 SAR'));

    await waitFor(() => {
      expect(screen.getByText('Refund #1')).toBeInTheDocument();
    });

    // Click close button (✕)
    const closeBtn = screen.getByText('\u2715');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Refund #1')).not.toBeInTheDocument();
    });
  });

  it('closes RefundDetailModal when backdrop is clicked', async () => {
    mockGetRefunds.mockResolvedValue([sampleRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#42'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // Click the refund row via its unique total
    fireEvent.click(screen.getByText('23.00 SAR'));

    await waitFor(() => {
      expect(screen.getByText('Refund #1')).toBeInTheDocument();
    });

    // Click backdrop (the outer fixed inset-0 div)
    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) fireEvent.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByText('Refund #1')).not.toBeInTheDocument();
    });
  });

  it('hides Refunds section when switching to an order without refunds', async () => {
    mockGetRefunds.mockResolvedValueOnce([sampleRefund]);
    mockGetRefunds.mockResolvedValueOnce([]);

    const orderWithoutRefunds = {
      ...orderSummary,
      id: 2,
      orderNo: 99,
    };
    const orderDetailNoRefunds = {
      ...paidOrder,
      id: 2,
      orderNo: 99,
    };

    mockList.mockResolvedValue([orderSummary, orderWithoutRefunds]);
    mockGet.mockResolvedValueOnce(paidOrder);
    mockGet.mockResolvedValueOnce(orderDetailNoRefunds);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    // Click first order (has refunds)
    fireEvent.click(screen.getByText('#42'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // Click second order (no refunds)
    fireEvent.click(screen.getByText('#99'));

    await waitFor(() => {
      expect(screen.getByText('Order #99')).toBeInTheDocument();
    });

    // Refunds section should disappear
    expect(screen.queryByText('Refunds')).not.toBeInTheDocument();
  });

  it('shows truncated reason in list row', async () => {
    const longReasonRefund: OrderRefundResponse = {
      ...sampleRefund,
      reason:
        'This is a very long reason string that should be truncated at thirty characters in the list',
    };
    mockGetRefunds.mockResolvedValue([longReasonRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#42'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // The truncated reason should appear (first 30 chars + ...)
    const truncated = 'This is a very long reason str...';
    expect(screen.getByText(truncated, { exact: false })).toBeInTheDocument();
  });
});
