import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrdersPage } from '../pages/OrdersPage';
import type { OrderRefundResponse } from '@spicyhome/client-ts';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockList = vi.fn();
const mockGet = vi.fn();
const mockGetRefunds = vi.fn();
const mockGetEvents = vi.fn();
const mockVerifyEvents = vi.fn();
const mockReprint = vi.fn();
const mockReprintRefund = vi.fn();

const { mockRealtimeSubscribe, mockRealtimeOnReconnect, mockRealtimeOffReconnect } = vi.hoisted(
  () => ({
    mockRealtimeSubscribe: vi.fn(() => vi.fn()),
    mockRealtimeOnReconnect: vi.fn(),
    mockRealtimeOffReconnect: vi.fn(),
  }),
);

vi.mock('../api', () => ({
  client: {
    auth: {
      listActiveUsers: vi.fn().mockResolvedValue([]),
    },
    orders: {
      list: (...args: any[]) => mockList(...args),
      get: (...args: any[]) => mockGet(...args),
      getRefunds: (...args: any[]) => mockGetRefunds(...args),
      getEvents: (...args: any[]) => mockGetEvents(...args),
      verifyEvents: (...args: any[]) => mockVerifyEvents(...args),
      reprint: (...args: any[]) => mockReprint(...args),
      reprintRefund: (...args: any[]) => mockReprintRefund(...args),
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
  documentId: 'INV26-0042',
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
  documentId: 'INV26-0042',
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
  zatcaPaymentMeansCode: '10',
  documentId: 'REF26-0001',
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

const openOrderSummary = {
  id: 2,
  orderNo: 55,
  documentId: 'INV26-0055',
  uuid: 'u2',
  type: 'dine_in',
  tableId: null,
  dayOpeningId: 1,
  status: 'open',
  subtotalHalalas: 2000,
  vatHalalas: 300,
  totalHalalas: 2300,
  discountHalalas: 0,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: null,
  updatedBy: null,
};

const openOrder = {
  ...openOrderSummary,
  documentId: 'INV26-0055',
  items: [
    {
      id: 201,
      orderId: 2,
      itemId: 2,
      itemName: 'Pizza',
      unitPriceHalalas: 2300,
      vatRateBp: 1500,
      qty: 1,
      totalHalalas: 2300,
      notes: null,
      createdAt: 1700000000,
      updatedAt: 1700000000,
      createdBy: null,
      updatedBy: null,
    },
  ],
  events: [],
  payments: [],
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
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    // Click order to open detail
    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Refunds section should NOT be visible
    expect(screen.queryByText('Refunds')).not.toBeInTheDocument();
  });

  it('shows Refunds section with correct data when order has refunds', async () => {
    mockGetRefunds.mockResolvedValue([sampleRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    // Wait for order detail to load
    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
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
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // Click the refund row via its unique total (23.00 SAR)
    fireEvent.click(screen.getByText('23.00 SAR'));

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText('Refund REF26-0001')).toBeInTheDocument();
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
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // Click the refund row via its unique total
    fireEvent.click(screen.getByText('23.00 SAR'));

    await waitFor(() => {
      expect(screen.getByText('Refund REF26-0001')).toBeInTheDocument();
    });

    // Click close button (✕)
    const closeBtn = screen.getByText('\u2715');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Refund REF26-0001')).not.toBeInTheDocument();
    });
  });

  it('closes RefundDetailModal when backdrop is clicked', async () => {
    mockGetRefunds.mockResolvedValue([sampleRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // Click the refund row via its unique total
    fireEvent.click(screen.getByText('23.00 SAR'));

    await waitFor(() => {
      expect(screen.getByText('Refund REF26-0001')).toBeInTheDocument();
    });

    // Click backdrop (the outer fixed inset-0 div)
    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) fireEvent.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByText('Refund REF26-0001')).not.toBeInTheDocument();
    });
  });

  it('opens RefundPanel in a fixed overlay modal when Refund button is clicked', async () => {
    mockGetRefunds.mockResolvedValue([sampleRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Refund panel must NOT be rendered inline before opening
    expect(screen.queryByText('Refund for Order INV26-0042')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Refund'));

    await waitFor(() => {
      expect(screen.getByText('Refund for Order INV26-0042')).toBeInTheDocument();
    });

    // The panel should be inside a fixed inset-0 overlay (not the detail column)
    const overlay = document.querySelector('.fixed.inset-0');
    expect(overlay).not.toBeNull();
    expect(overlay!.className).toContain('bg-black/60');
  });

  it('closes Refund modal when backdrop is clicked', async () => {
    mockGetRefunds.mockResolvedValue([sampleRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Refund'));

    await waitFor(() => {
      expect(screen.getByText('Refund for Order INV26-0042')).toBeInTheDocument();
    });

    // Click the backdrop (the outer fixed inset-0 div)
    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) fireEvent.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByText('Refund for Order INV26-0042')).not.toBeInTheDocument();
    });
  });

  it('hides Refunds section when switching to an order without refunds', async () => {
    mockGetRefunds.mockResolvedValueOnce([sampleRefund]);
    mockGetRefunds.mockResolvedValueOnce([]);

    const orderWithoutRefunds = {
      ...orderSummary,
      id: 2,
      orderNo: 99,
      documentId: 'INV26-0099',
    };
    const orderDetailNoRefunds = {
      ...paidOrder,
      id: 2,
      orderNo: 99,
      documentId: 'INV26-0099',
    };

    mockList.mockResolvedValue([orderSummary, orderWithoutRefunds]);
    mockGet.mockResolvedValueOnce(paidOrder);
    mockGet.mockResolvedValueOnce(orderDetailNoRefunds);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    // Click first order (has refunds)
    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // Click second order (no refunds)
    fireEvent.click(screen.getByText('INV26-0099'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0099')).toBeInTheDocument();
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
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Refunds')).toBeInTheDocument();
    });

    // The truncated reason should appear (first 30 chars + ...)
    const truncated = 'This is a very long reason str...';
    expect(screen.getByText(truncated, { exact: false })).toBeInTheDocument();
  });

  it('shows previous burned invoice document IDs in the detail header', async () => {
    mockGetRefunds.mockResolvedValue([]);
    mockGetEvents.mockResolvedValue([
      {
        id: 1,
        orderId: 1,
        eventIdx: 1,
        userId: 1,
        type: 'zatca_clearance_rejected',
        payload: JSON.stringify({
          documentKind: 'invoice',
          documentId: 'INV26-0041',
          cbcId: 'INV26-0041',
          orderId: 1,
          errors: ['Invalid buyer'],
        }),
        prevHash: '',
        hash: 'abc123',
        createdAt: 1700000000,
      },
      {
        id: 2,
        orderId: 1,
        eventIdx: 2,
        userId: 1,
        type: 'zatca_clearance_approved',
        payload: JSON.stringify({
          documentKind: 'invoice',
          documentId: 'INV26-0042',
          cbcId: 'INV26-0042',
          orderId: 1,
        }),
        prevHash: 'abc123',
        hash: 'def456',
        createdAt: 1700000100,
      },
    ]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Previous burned document ID shown in muted header text; current
    // document (INV26-0042) is not listed
    await waitFor(() => {
      expect(screen.getByText('Previous: INV26-0041')).toBeInTheDocument();
    });
    expect(screen.queryByText('Previous: INV26-0041, INV26-0042')).not.toBeInTheDocument();
  });

  it('does not show Previous line when no burned invoice document IDs exist', async () => {
    mockGetRefunds.mockResolvedValue([sampleRefund]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Previous:/)).not.toBeInTheDocument();
  });
});

describe('OrdersPage — realtime detail refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([orderSummary]);
    mockGet.mockResolvedValue(paidOrder);
    mockGetRefunds.mockResolvedValue([]);
    mockGetEvents.mockResolvedValue([]);
    mockVerifyEvents.mockResolvedValue({ valid: true });
    mockRealtimeSubscribe.mockReturnValue(vi.fn());
  });

  function realtimeHandler(event: string): () => Promise<void> {
    const calls = mockRealtimeSubscribe.mock.calls as unknown as [string, () => Promise<void>][];
    const sub = calls.find(([e]) => e === event);
    expect(sub).toBeDefined();
    return sub![1];
  }

  it('live-refreshes selected order detail on order.updated without the loading spinner', async () => {
    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // The server now has notes on the order (e.g. another terminal saved them)
    const updatedOrder = { ...paidOrder, notes: 'extra napkins' };
    mockGet.mockResolvedValue(updatedOrder);

    await act(async () => {
      await realtimeHandler('order.updated')();
    });

    // Detail pane shows the live notes without a full-page loading flash
    expect(screen.getByText('extra napkins')).toBeInTheDocument();
    expect(screen.queryByText('Loading orders...')).not.toBeInTheDocument();
  });

  it('live-refreshes selected order notes when cleared to empty string', async () => {
    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Another terminal cleared the notes → server returns null
    const clearedOrder = { ...paidOrder, notes: null };
    mockGet.mockResolvedValue(clearedOrder);

    await act(async () => {
      await realtimeHandler('order.updated')();
    });

    // Notes paragraph disappears, detail stays mounted
    expect(screen.queryByText('extra napkins')).not.toBeInTheDocument();
    expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    expect(screen.queryByText('Loading orders...')).not.toBeInTheDocument();
  });

  it('refreshes list and detail on order.item.updated for the selected order', async () => {
    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Server returns a newer order: qty 2 → 3
    const updatedOrder = {
      ...paidOrder,
      items: [{ ...paidOrder.items[0], qty: 3, totalHalalas: 6900 }],
      totalHalalas: 6900,
    };
    mockGet.mockResolvedValue(updatedOrder);

    await act(async () => {
      await realtimeHandler('order.item.updated')();
    });

    expect(screen.getByText('3 × 23.00')).toBeInTheDocument();
    expect(screen.queryByText('Loading orders...')).not.toBeInTheDocument();
  });
});

describe('OrdersPage — Open Order pinned footer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEvents.mockResolvedValue([]);
    mockVerifyEvents.mockResolvedValue({ valid: true });
    mockRealtimeSubscribe.mockReturnValue(vi.fn());
  });

  it('shows Open Order button when selected order status is open', async () => {
    mockList.mockResolvedValue([openOrderSummary]);
    mockGet.mockResolvedValue(openOrder);
    mockGetRefunds.mockResolvedValue([]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0055')).toBeInTheDocument();
    });

    // Click open order to view detail
    fireEvent.click(screen.getByText('INV26-0055'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0055')).toBeInTheDocument();
    });

    // Open Order button should be visible
    expect(screen.getByText('Open Order')).toBeInTheDocument();
  });

  it('clicking Open Order navigates to /?orderId=<id>', async () => {
    mockList.mockResolvedValue([openOrderSummary]);
    mockGet.mockResolvedValue(openOrder);
    mockGetRefunds.mockResolvedValue([]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0055')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0055'));

    await waitFor(() => {
      expect(screen.getByText('Open Order')).toBeInTheDocument();
    });

    // Click the Open Order button
    fireEvent.click(screen.getByText('Open Order'));

    // Should navigate to /?orderId=2
    expect(mockNavigate).toHaveBeenCalledWith('/?orderId=2');
  });

  it('does not show Open Order button for paid orders', async () => {
    mockList.mockResolvedValue([orderSummary]);
    mockGet.mockResolvedValue(paidOrder);
    mockGetRefunds.mockResolvedValue([]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0042'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Open Order button must NOT be visible
    expect(screen.queryByText('Open Order')).not.toBeInTheDocument();
  });

  it('does not show Open Order button for voided orders', async () => {
    const voidedSummary = {
      ...orderSummary,
      id: 3,
      orderNo: 99,
      documentId: 'INV26-0099',
      status: 'voided',
    };
    const voidedOrder = {
      ...paidOrder,
      id: 3,
      orderNo: 99,
      documentId: 'INV26-0099',
      status: 'voided',
    };

    mockList.mockResolvedValue([voidedSummary]);
    mockGet.mockResolvedValue(voidedOrder);
    mockGetRefunds.mockResolvedValue([]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0099')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0099'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0099')).toBeInTheDocument();
    });

    expect(screen.queryByText('Open Order')).not.toBeInTheDocument();
  });

  it('does not show Open Order button for refunded orders', async () => {
    const refundedSummary = {
      ...orderSummary,
      id: 4,
      orderNo: 77,
      documentId: 'INV26-0077',
      status: 'refunded',
    };
    const refundedOrder = {
      ...paidOrder,
      id: 4,
      orderNo: 77,
      documentId: 'INV26-0077',
      status: 'refunded',
    };

    mockList.mockResolvedValue([refundedSummary]);
    mockGet.mockResolvedValue(refundedOrder);
    mockGetRefunds.mockResolvedValue([]);

    renderOrdersPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0077')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('INV26-0077'));

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0077')).toBeInTheDocument();
    });

    expect(screen.queryByText('Open Order')).not.toBeInTheDocument();
  });
});
