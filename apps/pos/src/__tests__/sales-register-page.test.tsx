import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getServiceDayString } from '@spicyhome/shared';
import { SalesRegisterPage } from '../pages/SalesRegisterPage';
import type { SalesRegisterResponse } from '@spicyhome/client-ts';

const mockSalesRegister = vi.fn();

vi.mock('../api', () => ({
  client: {
    reports: {
      salesRegister: (...args: any[]) => mockSalesRegister(...args),
    },
    deliveryPartners: {
      list: vi.fn().mockResolvedValue([]),
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
  });

  it('shows sale/refund counts and signed totals in the footer', async () => {
    mockSalesRegister.mockResolvedValue(saleResponse());

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('1 sales · 1 refunds')).toBeInTheDocument();
    });
    // Footer signed subtotal / VAT / total all net to zero in this fixture.
    expect(screen.getAllByLabelText('SAR 0.00').length).toBeGreaterThanOrEqual(3);
  });

  it('recalls with kind refund when the Kind filter changes', async () => {
    mockSalesRegister.mockResolvedValue(saleResponse());
    const today = getServiceDayString(Date.now());

    renderPage();

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'refund' } });

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenLastCalledWith({
        from: today,
        to: today,
        type: undefined,
        partner: undefined,
        kind: 'refund',
      });
    });
  });

  it('sends the type and partner query params when those filters change', async () => {
    mockSalesRegister.mockResolvedValue(saleResponse());
    const today = getServiceDayString(Date.now());

    renderPage();

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'takeaway' } });

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenLastCalledWith({
        from: today,
        to: today,
        type: 'takeaway',
        partner: undefined,
        kind: undefined,
      });
    });

    fireEvent.change(screen.getByLabelText('Partner'), { target: { value: 'none' } });

    await waitFor(() => {
      expect(mockSalesRegister).toHaveBeenLastCalledWith({
        from: today,
        to: today,
        type: 'takeaway',
        partner: 'none',
        kind: undefined,
      });
    });
  });
});
