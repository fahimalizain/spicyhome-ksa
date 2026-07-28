import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RefundPanel } from '../components/RefundPanel';
import type { OrderResponse, OrderRefundResponse } from '@spicyhome/client-ts';

const mockRefund = vi.fn();
const mockGetRefunds = vi.fn();
const mockListEnabled = vi.fn();

vi.mock('../api', () => ({
  client: {
    orders: {
      refund: (...args: any[]) => mockRefund(...args),
      getRefunds: (...args: any[]) => mockGetRefunds(...args),
    },
    paymentMethods: {
      listEnabled: (...args: any[]) => mockListEnabled(...args),
    },
  },
}));

const defaultMethods = [
  { id: 'cash', title: 'Cash', enabled: true, sortOrder: 0 },
  { id: 'card', title: 'Card', enabled: true, sortOrder: 1 },
];

const mockOrder: OrderResponse = {
  id: 1,
  orderNo: 42,
  uuid: 'test-uuid',
  type: 'dine_in',
  tableId: null,
  dayOpeningId: 1,
  status: 'paid',
  subtotalHalalas: 4600,
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
      qty: 3,
      totalHalalas: 6900,
      notes: null,
      createdAt: 1700000000,
      updatedAt: 1700000000,
      createdBy: null,
      updatedBy: null,
    },
    {
      id: 102,
      orderId: 1,
      itemId: 1,
      itemName: 'Fries',
      unitPriceHalalas: 1150,
      vatRateBp: 1500,
      qty: 2,
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

const emptyRefunds: OrderRefundResponse[] = [];

describe('RefundPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRefunds.mockResolvedValue(emptyRefunds);
    mockListEnabled.mockResolvedValue(defaultMethods);
  });

  it('renders order items with refund steppers', async () => {
    mockGetRefunds.mockResolvedValue(emptyRefunds);
    render(<RefundPanel order={mockOrder} onClose={vi.fn()} onRefunded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Refund for Order #42')).toBeInTheDocument();
    });

    expect(screen.getByText('Burger')).toBeInTheDocument();
    expect(screen.getByText('Fries')).toBeInTheDocument();
    // Each item should have + and - buttons
    const plusButtons = screen.getAllByText('+');
    const minusButtons = screen.getAllByText('-');
    expect(plusButtons.length).toBe(2);
    expect(minusButtons.length).toBe(2);
  });

  it('increments and decrements refund qty', async () => {
    mockGetRefunds.mockResolvedValue(emptyRefunds);
    render(<RefundPanel order={mockOrder} onClose={vi.fn()} onRefunded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Refund for Order #42')).toBeInTheDocument();
    });

    // Find the plus button for Burger (first item)
    const plusButtons = screen.getAllByText('+');
    const minusButtons = screen.getAllByText('-');

    // Initial qty = 0
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);

    // Click + for first item
    fireEvent.click(plusButtons[0]);
    // Should now show 1 for that row
    const qtySpans = screen.getAllByText('1');
    expect(qtySpans.length).toBeGreaterThanOrEqual(1);

    // Click - for first item
    fireEvent.click(minusButtons[0]);
    // Should go back to 0
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
  });

  it('shows refund total when items selected', async () => {
    mockGetRefunds.mockResolvedValue(emptyRefunds);
    render(<RefundPanel order={mockOrder} onClose={vi.fn()} onRefunded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Refund for Order #42')).toBeInTheDocument();
    });

    // Initially no total shown
    expect(screen.queryByText('Refund Total')).not.toBeInTheDocument();

    // Select 1 Burger
    const plusButtons = screen.getAllByText('+');
    fireEvent.click(plusButtons[0]);

    // Total should now appear (Burger is 2300 halalas = 23.00 SAR)
    await waitFor(() => {
      expect(screen.getByText('Refund Total')).toBeInTheDocument();
      expect(screen.getByText('23.00 SAR')).toBeInTheDocument();
    });
  });

  it('processes refund and calls onRefunded on success', async () => {
    mockGetRefunds.mockResolvedValue(emptyRefunds);
    mockListEnabled.mockResolvedValue(defaultMethods);
    mockRefund.mockResolvedValue({ success: true, refundId: 1, status: 'paid' });

    const onRefunded = vi.fn();
    render(<RefundPanel order={mockOrder} onClose={vi.fn()} onRefunded={onRefunded} />);

    await waitFor(() => {
      expect(screen.getByText('Refund for Order #42')).toBeInTheDocument();
    });

    // Select 1 Burger
    fireEvent.click(screen.getAllByText('+')[0]);

    // Select Cash method
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cash'));

    // Click Process Refund
    fireEvent.click(screen.getByText('Process Refund'));
    // Click Confirm Refund
    fireEvent.click(screen.getByText('Confirm Refund'));

    await waitFor(() => {
      expect(mockRefund).toHaveBeenCalledWith(1, {
        items: [{ orderItemId: 101, qty: 1 }],
        methodId: 'cash',
      });
      expect(onRefunded).toHaveBeenCalled();
    });
  });

  it('shows error on refund failure', async () => {
    mockGetRefunds.mockResolvedValue(emptyRefunds);
    mockListEnabled.mockResolvedValue(defaultMethods);
    mockRefund.mockRejectedValue(new Error('Only paid orders can be refunded'));

    const onRefunded = vi.fn();
    render(<RefundPanel order={mockOrder} onClose={vi.fn()} onRefunded={onRefunded} />);

    await waitFor(() => {
      expect(screen.getByText('Refund for Order #42')).toBeInTheDocument();
    });

    // Select 1 item
    fireEvent.click(screen.getAllByText('+')[0]);

    // Select Cash method
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cash'));

    fireEvent.click(screen.getByText('Process Refund'));
    fireEvent.click(screen.getByText('Confirm Refund'));

    await waitFor(() => {
      expect(screen.getByText('Only paid orders can be refunded')).toBeInTheDocument();
      expect(onRefunded).not.toHaveBeenCalled();
    });
  });

  it('calls onClose when close button clicked', async () => {
    mockGetRefunds.mockResolvedValue(emptyRefunds);
    const onClose = vi.fn();
    render(<RefundPanel order={mockOrder} onClose={onClose} onRefunded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Refund for Order #42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('\u2715'));
    expect(onClose).toHaveBeenCalled();
  });
});

// Test getRemainingQty standalone
import { getRemainingQty } from '../hooks/useRefund';

describe('getRemainingQty', () => {
  it('returns full qty when no refunds', () => {
    const result = getRemainingQty(3, 101, []);
    expect(result).toBe(3);
  });

  it('returns remaining qty after partial refund', () => {
    const refunds: OrderRefundResponse[] = [
      {
        id: 1,
        orderId: 1,
        userId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        subtotalHalalas: 2300,
        vatHalalas: 300,
        totalHalalas: 2300,
        reason: null,
        createdAt: 1700000000,
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
      },
    ];
    const result = getRemainingQty(3, 101, refunds);
    expect(result).toBe(2);
  });

  it('returns 0 when fully refunded', () => {
    const refunds: OrderRefundResponse[] = [
      {
        id: 1,
        orderId: 1,
        userId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        subtotalHalalas: 4600,
        vatHalalas: 600,
        totalHalalas: 4600,
        reason: null,
        createdAt: 1700000000,
        items: [
          {
            id: 1,
            orderItemId: 101,
            itemName: 'Burger',
            unitPriceHalalas: 2300,
            vatRateBp: 1500,
            qty: 2,
            totalHalalas: 4600,
          },
        ],
      },
    ];
    const result = getRemainingQty(2, 101, refunds);
    expect(result).toBe(0);
  });

  it('handles multiple refunds across different items', () => {
    const refunds: OrderRefundResponse[] = [
      {
        id: 1,
        orderId: 1,
        userId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        subtotalHalalas: 2300,
        vatHalalas: 300,
        totalHalalas: 2300,
        reason: null,
        createdAt: 1700000000,
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
      },
      {
        id: 2,
        orderId: 1,
        userId: 1,
        methodId: 'card',
        methodTitle: 'Card',
        subtotalHalalas: 2300,
        vatHalalas: 300,
        totalHalalas: 2300,
        reason: null,
        createdAt: 1700000001,
        items: [
          {
            id: 2,
            orderItemId: 102,
            itemName: 'Fries',
            unitPriceHalalas: 1150,
            vatRateBp: 1500,
            qty: 1,
            totalHalalas: 1150,
          },
        ],
      },
    ];
    expect(getRemainingQty(3, 101, refunds)).toBe(2);
    expect(getRemainingQty(2, 102, refunds)).toBe(1);
  });
});
