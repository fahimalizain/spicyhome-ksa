import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RefundDetailModal } from '../components/RefundDetailModal';
import type { OrderRefundResponse } from '@spicyhome/client-ts';

const mockReprintRefund = vi.fn();
const mockGetMe = vi.fn();

vi.mock('../api', () => {
  // getMe is a sync function — mockGetMe is set per-test
  return {
    client: {
      orders: {
        reprintRefund: (...args: any[]) => mockReprintRefund(...args),
      },
    },
    getMe: () => mockGetMe(),
    setToken: vi.fn(),
    setMe: vi.fn(),
    clearToken: vi.fn(),
    getToken: vi.fn(),
    isAuthenticated: vi.fn(),
  };
});

function makeMe(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    username: 'test',
    name: 'Test',
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
    ...overrides,
  };
}

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

describe('RefundDetailModal — Print Receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockReturnValue(makeMe());
  });

  it('shows Print Receipt button when updateOrder is true', () => {
    render(<RefundDetailModal refund={sampleRefund} onClose={vi.fn()} />);

    expect(screen.getByText('Print Receipt')).toBeInTheDocument();
  });

  it('does not show Print Receipt button when updateOrder is false', () => {
    mockGetMe.mockReturnValue(makeMe({ updateOrder: false }));
    render(<RefundDetailModal refund={sampleRefund} onClose={vi.fn()} />);

    expect(screen.queryByText('Print Receipt')).not.toBeInTheDocument();
  });

  it('does not show Print Receipt button when getMe returns null', () => {
    mockGetMe.mockReturnValue(null);
    render(<RefundDetailModal refund={sampleRefund} onClose={vi.fn()} />);

    expect(screen.queryByText('Print Receipt')).not.toBeInTheDocument();
  });

  it('calls reprintRefund with orderId and refundId on click', async () => {
    mockReprintRefund.mockResolvedValue({ success: true, errors: [] });

    render(<RefundDetailModal refund={sampleRefund} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => {
      expect(mockReprintRefund).toHaveBeenCalledWith(1, 1);
    });
  });

  it('shows success message after print', async () => {
    mockReprintRefund.mockResolvedValue({ success: true, errors: [] });

    render(<RefundDetailModal refund={sampleRefund} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => {
      expect(screen.getByText('Receipt printed')).toBeInTheDocument();
    });
  });

  it('shows error message on print failure', async () => {
    mockReprintRefund.mockRejectedValue(new Error('Printer offline'));

    render(<RefundDetailModal refund={sampleRefund} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => {
      expect(screen.getByText('Printer offline')).toBeInTheDocument();
    });
  });

  it('shows error message when server returns success: false', async () => {
    mockReprintRefund.mockResolvedValue({
      success: false,
      errors: ['No active receipt printer configured'],
    });

    render(<RefundDetailModal refund={sampleRefund} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => {
      expect(screen.getByText('No active receipt printer configured')).toBeInTheDocument();
    });
    expect(screen.queryByText('Receipt printed')).not.toBeInTheDocument();
  });

  it('shows generic error when server returns success: false with no errors', async () => {
    mockReprintRefund.mockResolvedValue({ success: false, errors: [] });

    render(<RefundDetailModal refund={sampleRefund} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => {
      expect(screen.getByText('Print failed')).toBeInTheDocument();
    });
  });

  it('disables button while printing', async () => {
    // Never resolves
    mockReprintRefund.mockReturnValue(new Promise(() => {}));

    render(<RefundDetailModal refund={sampleRefund} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => {
      expect(screen.getByText('Printing...')).toBeDisabled();
    });
  });
});
