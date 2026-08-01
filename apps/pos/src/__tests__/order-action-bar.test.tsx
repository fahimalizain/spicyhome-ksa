import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OrderActionBar } from '../components/OrderActionBar';

const mockReprint = vi.fn();
const mockGetMe = vi.fn();

vi.mock('../api', () => {
  // getMe is a sync function — mockGetMe is set per-test
  return {
    client: {
      orders: {
        reprint: (...args: any[]) => mockReprint(...args),
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

describe('OrderActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('permission gating', () => {
    it('renders nothing when updateOrder is false', () => {
      mockGetMe.mockReturnValue(makeMe({ updateOrder: false }));
      const { container } = render(<OrderActionBar orderId={1} status="paid" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when getMe returns null', () => {
      mockGetMe.mockReturnValue(null);
      const { container } = render(<OrderActionBar orderId={1} status="paid" />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('button visibility by status', () => {
    it('shows Reprint Receipt for paid status', () => {
      mockGetMe.mockReturnValue(makeMe());
      render(<OrderActionBar orderId={1} status="paid" />);

      expect(screen.getByText('Reprint Receipt')).toBeInTheDocument();
      expect(screen.queryByText('Reprint Kitchen')).not.toBeInTheDocument();
    });

    it('shows Reprint Receipt for refunded status', () => {
      mockGetMe.mockReturnValue(makeMe());
      render(<OrderActionBar orderId={1} status="refunded" />);

      expect(screen.getByText('Reprint Receipt')).toBeInTheDocument();
      expect(screen.queryByText('Reprint Kitchen')).not.toBeInTheDocument();
    });

    it('renders nothing for open status', () => {
      mockGetMe.mockReturnValue(makeMe());
      const { container } = render(<OrderActionBar orderId={1} status="open" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing for voided status', () => {
      mockGetMe.mockReturnValue(makeMe());
      const { container } = render(<OrderActionBar orderId={1} status="voided" />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('className prop', () => {
    it('applies className to the root element', () => {
      mockGetMe.mockReturnValue(makeMe());
      const { container } = render(
        <OrderActionBar orderId={1} status="paid" className="flex-1 min-w-0" />,
      );
      expect(container.firstChild).toHaveClass('flex-1', 'min-w-0');
    });
  });

  describe('reprint API calls', () => {
    it('calls reprint with receipt target', async () => {
      mockGetMe.mockReturnValue(makeMe());
      mockReprint.mockResolvedValue({ success: true, errors: [] });

      render(<OrderActionBar orderId={42} status="paid" />);

      fireEvent.click(screen.getByText('Reprint Receipt'));

      await waitFor(() => {
        expect(mockReprint).toHaveBeenCalledWith(42, { target: 'receipt' });
      });
    });

    it('shows success message after reprint', async () => {
      mockGetMe.mockReturnValue(makeMe());
      mockReprint.mockResolvedValue({ success: true, errors: [] });

      render(<OrderActionBar orderId={1} status="paid" />);

      fireEvent.click(screen.getByText('Reprint Receipt'));

      await waitFor(() => {
        expect(screen.getByText('Receipt reprinted')).toBeInTheDocument();
      });
    });

    it('shows error message on reprint failure', async () => {
      mockGetMe.mockReturnValue(makeMe());
      mockReprint.mockRejectedValue(new Error('Printer offline'));

      render(<OrderActionBar orderId={1} status="paid" />);

      fireEvent.click(screen.getByText('Reprint Receipt'));

      await waitFor(() => {
        expect(screen.getByText('Printer offline')).toBeInTheDocument();
      });
    });

    it('disables button during reprint', async () => {
      mockGetMe.mockReturnValue(makeMe());
      // Never resolves
      mockReprint.mockReturnValue(new Promise(() => {}));

      render(<OrderActionBar orderId={1} status="paid" />);

      const receiptBtn = screen.getByText('Reprint Receipt');
      fireEvent.click(receiptBtn);

      await waitFor(() => {
        expect(screen.getByText('Reprinting...')).toBeDisabled();
      });
    });
  });
});
