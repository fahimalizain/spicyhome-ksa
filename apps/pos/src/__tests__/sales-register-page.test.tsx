import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getServiceDayString } from '@spicyhome/shared';
import { SalesRegisterPage } from '../pages/SalesRegisterPage';
import type { SalesRegisterResponse } from '@spicyhome/client-ts';

const mockSalesRegister = vi.fn();
const mockListActiveUsers = vi.fn();

vi.mock('../api', () => ({
  client: {
    reports: {
      salesRegister: (...args: any[]) => mockSalesRegister(...args),
    },
    deliveryPartners: {
      list: vi.fn().mockResolvedValue([]),
    },
    auth: {
      listActiveUsers: (...args: any[]) => mockListActiveUsers(...args),
    },
  },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  getMe: vi.fn(() => null),
  isAuthenticated: vi.fn(() => true),
}));

function saleResponse(): SalesRegisterResponse {
  return {
    rows: [
      {
        kind: 'sale',
        postedAt: 1787220000,
        businessDate: '2026-08-20',
        documentId: 'INV26-0001',
        orderId: 1,
        refundId: null,
        orderNo: 1,
        type: 'dine_in',
        tableId: 2,
        tableName: 'T1',
        deliveryPartnerId: null,
        deliveryPartnerTitle: null,
        deliveryExternalRef: null,
        subtotalHalalas: 2000,
        vatHalalas: 300,
        totalHalalas: 2300,
        tenders: [{ methodId: 'cash', methodTitle: 'Cash', amountHalalas: 2300 }],
        createdByUserId: 2,
        createdByName: 'Waiter',
        cashierUserId: 1,
        cashierName: 'Admin',
        notes: null,
      },
      {
        kind: 'refund',
        postedAt: 1787223600,
        businessDate: '2026-08-20',
        documentId: 'CR26-0001',
        orderId: 1,
        refundId: 1,
        orderNo: 1,
        type: 'dine_in',
        tableId: 2,
        tableName: 'T1',
        deliveryPartnerId: null,
        deliveryPartnerTitle: null,
        deliveryExternalRef: null,
        subtotalHalalas: -2000,
        vatHalalas: -300,
        totalHalalas: -2300,
        tenders: [{ methodId: 'cash', methodTitle: 'Cash', amountHalalas: 2300 }],
        createdByUserId: 2,
        createdByName: 'Waiter',
        cashierUserId: 1,
        cashierName: 'Admin',
        notes: 'Refund of INV26-0001',
      },
    ],
    footer: { saleCount: 1, refundCount: 1, subtotalHalalas: 0, vatHalalas: 0, totalHalalas: 0 },
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reports/sales-register']}>
      <SalesRegisterPage />
    </MemoryRouter>,
  );
}

describe('SalesRegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListActiveUsers.mockResolvedValue([]);
  });

  it('calls salesRegister with the current service day as from and to on mount', async () => {
    mockSalesRegister.mockResolvedValue(saleResponse());
    const today = getServiceDayString(Date.now());

    renderPage();

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenCalledWith({
        from: today,
        to: today,
        type: undefined,
        partner: undefined,
        kind: undefined,
        userId: undefined,
      });
    });
  });

  it('renders a sale row and a refund row (signed amounts, refund note)', async () => {
    mockSalesRegister.mockResolvedValue(saleResponse());

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('INV26-0001')).toBeInTheDocument();
      expect(screen.getAllByText('Sale').length).toBeGreaterThanOrEqual(1); // Kind badge (option in filter bar also matches)
      // Sale total 2300 halalas; the sale and refund tender cells also show 23.00.
      expect(screen.getAllByLabelText('SAR 23.00').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText('CR26-0001')).toBeInTheDocument();
    expect(screen.getAllByText('Refund').length).toBeGreaterThanOrEqual(1); // Kind badge
    expect(screen.getByLabelText('− SAR 23.00')).toBeInTheDocument();
    expect(screen.getByText('Refund of INV26-0001')).toBeInTheDocument();
    // Opened by (parent order creator) and Cashier (payment/refund poster) are
    // separate columns; both rows are opened by the waiter, paid by the admin.
    expect(screen.getByRole('columnheader', { name: 'Opened by' })).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'Waiter' })).toHaveLength(2);
    expect(screen.getAllByRole('cell', { name: 'Admin' })).toHaveLength(2);
  });

  it('shows sale/refund counts and signed totals in the footer', async () => {
    mockSalesRegister.mockResolvedValue(saleResponse());

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('1 sales · 1 refunds')).toBeInTheDocument();
    });
    // Footer signed subtotal / VAT / total all net to zero in this fixture.
    expect(screen.getAllByLabelText('SAR 0.00').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId('report-table-scroll')).toContainElement(screen.getByRole('table'));
    expect(screen.getByRole('columnheader', { name: 'Business Date' })).toHaveClass('sticky');
    expect(screen.getByText('1 sales · 1 refunds')).toHaveClass('sticky', 'bottom-0');
    expect(screen.getByTestId('report-table-spacer')).toBeInTheDocument();
  });

  it('recalls with kind refund when the Kind filter changes', async () => {
    mockSalesRegister.mockResolvedValue(saleResponse());
    const today = getServiceDayString(Date.now());

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Kind')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'refund' } });

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenLastCalledWith({
        from: today,
        to: today,
        type: undefined,
        partner: undefined,
        kind: 'refund',
        userId: undefined,
      });
    });
  });

  it('sends the type and partner query params when those filters change', async () => {
    mockSalesRegister.mockResolvedValue(saleResponse());
    const today = getServiceDayString(Date.now());

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Type')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'takeaway' } });

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenLastCalledWith({
        from: today,
        to: today,
        type: 'takeaway',
        partner: undefined,
        kind: undefined,
        userId: undefined,
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Partner')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Partner'), { target: { value: 'none' } });

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenLastCalledWith({
        from: today,
        to: today,
        type: 'takeaway',
        partner: 'none',
        kind: undefined,
        userId: undefined,
      });
    });
  });

  it('sends the selected user as a numeric userId when the User filter changes', async () => {
    mockSalesRegister.mockResolvedValue(saleResponse());
    const today = getServiceDayString(Date.now());
    mockListActiveUsers.mockResolvedValue([
      { id: 1, username: 'admin', name: 'Admin' },
      { id: 2, username: 'waiter', name: 'Waiter' },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('User')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Waiter' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('User'), { target: { value: '2' } });

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenLastCalledWith({
        from: today,
        to: today,
        type: undefined,
        partner: undefined,
        kind: undefined,
        userId: 2,
      });
    });
  });
});
