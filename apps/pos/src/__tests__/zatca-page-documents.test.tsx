import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ZatcaPage } from '../pages/admin/ZatcaPage';

const mockGetConfig = vi.fn();
const mockGetStatus = vi.fn();
const mockListInvoices = vi.fn();
const mockListCreditNotes = vi.fn();
const mockGetDocumentsSummary = vi.fn();
const mockGetInvoice = vi.fn();
const mockGetCreditNote = vi.fn();
const mockRetryReporting = vi.fn();

vi.mock('../api', () => ({
  client: {
    zatca: {
      getConfig: (...args: any[]) => mockGetConfig(...args),
      getStatus: (...args: any[]) => mockGetStatus(...args),
      listInvoices: (...args: any[]) => mockListInvoices(...args),
      listCreditNotes: (...args: any[]) => mockListCreditNotes(...args),
      getDocumentsSummary: (...args: any[]) => mockGetDocumentsSummary(...args),
      getInvoice: (...args: any[]) => mockGetInvoice(...args),
      getCreditNote: (...args: any[]) => mockGetCreditNote(...args),
      retryReporting: (...args: any[]) => mockRetryReporting(...args),
    },
  },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(() => 'test-token'),
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

const sampleConfig = {
  sellerName: 'Test',
  sellerNameAr: 'مطعم تجريبي',
  sellerStreetAr: 'شارع الاختبار',
  sellerCityAr: 'الرياض',
  sellerDistrict: 'Al Olaya',
  sellerDistrictAr: 'العليا',
  vatNumber: '300123456789003',
  crNumber: '',
  street: '',
  building: '',
  city: 'Riyadh',
  postalCode: '',
  country: 'SA',
  orgUnit: 'test',
  apiBaseUrl: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
};

const emptySummary = {
  invoices: { submitted: 0, queued: 0, failed: 0, rejected: 0, total: 0 },
  creditNotes: { submitted: 0, queued: 0, failed: 0, rejected: 0, total: 0 },
  overall: { submitted: 0, queued: 0, failed: 0, rejected: 0, total: 0, health: 'ok' as const },
};

const sampleOnboarding = {
  state: 'not_started' as const,
  keyGenerated: false,
  complianceDone: false,
  productionDone: false,
  complianceCertExpiry: null,
  productionCertExpiry: null,
  publicKeyPem: null,
  complianceResults: [],
};

const sampleInvoice = {
  id: 1,
  orderId: 1,
  icv: 1,
  uuid: 'inv-uuid-1',
  invoiceHash: 'abcdef1234567890abcdef1234567890abcd',
  prevInvoiceHash: '',
  xml: '<Invoice/>',
  qrTlv: 'tlv',
  status: 'signed',
  reportedAt: null,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  documentId: 'INV-TEST-001',
};

const sampleCreditNote = {
  id: 10,
  orderId: 2,
  refundId: 5,
  relatedInvoiceUuid: 'inv-uuid-2',
  icv: 3,
  uuid: 'cn-uuid-1',
  invoiceHash: 'cnhash1234567890cnhash1234567890abcd',
  prevInvoiceHash: 'abcdef1234567890abcdef1234567890abcd',
  xml: '<CreditNote/>',
  qrTlv: 'tlv',
  status: 'signed',
  reportedAt: null,
  totalHalalas: 11500,
  vatHalalas: 1500,
  reason: 'Customer refund',
  createdAt: 1700000100,
  updatedAt: 1700000100,
  documentId: 'CN-TEST-001',
};

function renderZatcaPage() {
  return render(
    <MemoryRouter>
      <ZatcaPage />
    </MemoryRouter>,
  );
}

describe('ZatcaPage — documents list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockResolvedValue(sampleConfig);
    mockGetStatus.mockResolvedValue(sampleOnboarding);
    mockListInvoices.mockResolvedValue([sampleInvoice]);
    mockListCreditNotes.mockResolvedValue([sampleCreditNote]);
    mockGetDocumentsSummary.mockResolvedValue({
      ...emptySummary,
      invoices: { submitted: 0, queued: 1, failed: 0, rejected: 0, total: 1 },
      creditNotes: { submitted: 0, queued: 1, failed: 0, rejected: 0, total: 1 },
      overall: { submitted: 0, queued: 2, failed: 0, rejected: 0, total: 2, health: 'ok' },
    });
    mockRetryReporting.mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 });
  });

  it('renders both invoice and credit note rows with type badges', async () => {
    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('Invoices & Credit Notes')).toBeInTheDocument();
    });

    // Both rows should render by ICV
    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    // documentId should be the primary label for each row
    expect(screen.getByText('INV-TEST-001')).toBeInTheDocument();
    expect(screen.getByText('CN-TEST-001')).toBeInTheDocument();

    // Type badges should be visible
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('Credit Note')).toBeInTheDocument();

    // Status badges
    const signedBadges = screen.getAllByText('signed');
    expect(signedBadges.length).toBe(2);
  });

  it('Retry All calls retryReporting without ids', async () => {
    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('Invoices & Credit Notes')).toBeInTheDocument();
    });

    const retryAllBtn = screen.getByText('Retry All Pending');
    fireEvent.click(retryAllBtn);

    await waitFor(() => {
      expect(mockRetryReporting).toHaveBeenCalledWith(undefined);
    });
  });

  it('clicking a credit note row fetches and opens detail modal', async () => {
    mockGetCreditNote.mockResolvedValue(sampleCreditNote);

    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    // Click credit note row (ICV 3)
    fireEvent.click(screen.getByText('#3'));

    await waitFor(() => {
      expect(mockGetCreditNote).toHaveBeenCalledWith(10);
    });

    await waitFor(() => {
      expect(screen.getByText('Credit Note CN-TEST-001')).toBeInTheDocument();
    });

    // Should show document ID (in the modal grid; also rendered in the list behind the overlay)
    expect(screen.getAllByText('CN-TEST-001').length).toBeGreaterThan(0);

    // Should show refund id
    expect(screen.getByText('#5')).toBeInTheDocument();

    // Should show related invoice UUID
    expect(screen.getByText('inv-uuid-2')).toBeInTheDocument();

    // Should show reason
    expect(screen.getByText('Customer refund')).toBeInTheDocument();

    // Should show totals formatted as SAR
    expect(screen.getByText('115.00 SAR')).toBeInTheDocument();
    expect(screen.getByText('15.00 SAR')).toBeInTheDocument();
  });

  it('clicking an invoice row fetches and opens detail modal', async () => {
    mockGetInvoice.mockResolvedValue(sampleInvoice);

    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#1'));

    await waitFor(() => {
      expect(mockGetInvoice).toHaveBeenCalledWith(1);
    });

    await waitFor(() => {
      expect(screen.getByText('Invoice INV-TEST-001')).toBeInTheDocument();
    });

    // Should show document ID in the modal grid
    expect(screen.getAllByText('INV-TEST-001').length).toBeGreaterThan(0);
  });

  it('shows empty state when no documents exist', async () => {
    mockListInvoices.mockResolvedValue([]);
    mockListCreditNotes.mockResolvedValue([]);

    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('No documents yet')).toBeInTheDocument();
    });
  });

  it('per-row retry for credit note calls retryReporting with creditNoteId', async () => {
    mockRetryReporting.mockResolvedValue({ processed: 1, succeeded: 1, failed: 0 });

    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    // Click Retry button on the credit note row
    const retryButtons = screen.getAllByText('Retry');
    // The credit note row is at ICV 3, which is higher than 1, so it appears first (sorted desc)
    // The first Retry button should be for the credit note
    fireEvent.click(retryButtons[0]);

    await waitFor(() => {
      // Should be called with invoiceId=undefined, creditNoteId=10
      expect(mockRetryReporting).toHaveBeenCalledWith(undefined, 10);
    });
  });

  it('renders the documents status card from the summary endpoint', async () => {
    mockGetDocumentsSummary.mockResolvedValue({
      invoices: { submitted: 10, queued: 1, failed: 1, rejected: 0, total: 12 },
      creditNotes: { submitted: 2, queued: 1, failed: 0, rejected: 0, total: 3 },
      overall: { submitted: 12, queued: 2, failed: 1, rejected: 0, total: 15, health: 'attention' },
    });

    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('Documents Status')).toBeInTheDocument();
    });

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('10 submitted · 1 queued · 1 failed · 0 rejected')).toBeInTheDocument();
    expect(screen.getByText('2 submitted · 1 queued · 0 failed · 0 rejected')).toBeInTheDocument();
  });

  it('shows All submitted when every current document succeeded', async () => {
    mockGetDocumentsSummary.mockResolvedValue({
      invoices: { submitted: 4, queued: 0, failed: 0, rejected: 0, total: 4 },
      creditNotes: { submitted: 1, queued: 0, failed: 0, rejected: 0, total: 1 },
      overall: { submitted: 5, queued: 0, failed: 0, rejected: 0, total: 5, health: 'ok' },
    });

    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('All submitted')).toBeInTheDocument();
    });
  });

  it('per-row retry for invoice calls retryReporting with invoiceId', async () => {
    mockRetryReporting.mockResolvedValue({ processed: 1, succeeded: 1, failed: 0 });

    // Make credit note have lower ICV so invoice is first
    mockListCreditNotes.mockResolvedValue([{ ...sampleCreditNote, icv: 2 }]);
    mockListInvoices.mockResolvedValue([{ ...sampleInvoice, icv: 5 }]);

    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('#5')).toBeInTheDocument();
    });

    const retryButtons = screen.getAllByText('Retry');
    // First button should be for the invoice (#5, highest ICV)
    fireEvent.click(retryButtons[0]);

    await waitFor(() => {
      expect(mockRetryReporting).toHaveBeenCalledWith(1);
    });
  });
});
