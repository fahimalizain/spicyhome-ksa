import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ZatcaPage } from '../pages/admin/ZatcaPage';

const mockGetConfig = vi.fn();
const mockGetStatus = vi.fn();
const mockListInvoices = vi.fn();
const mockListCreditNotes = vi.fn();
const mockUpdateConfig = vi.fn();

vi.mock('../api', () => ({
  client: {
    zatca: {
      getConfig: (...args: any[]) => mockGetConfig(...args),
      getStatus: (...args: any[]) => mockGetStatus(...args),
      listInvoices: (...args: any[]) => mockListInvoices(...args),
      listCreditNotes: (...args: any[]) => mockListCreditNotes(...args),
      updateConfig: (...args: any[]) => mockUpdateConfig(...args),
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

/** Empty/minimal config to start with — fields should be overridden on Sandbox click. */
const emptyConfig = {
  sellerName: '',
  vatNumber: '',
  crNumber: '',
  street: '',
  building: '',
  city: '',
  postalCode: '',
  country: '',
  orgUnit: '',
  apiBaseUrl: '',
};

/** Onboarding where OTP input is visible (keyGenerated && !complianceDone). */
const otpVisibleOnboarding = {
  state: 'csr_generated' as const,
  keyGenerated: true,
  complianceDone: false,
  productionDone: false,
  complianceCertExpiry: null,
  productionCertExpiry: null,
  publicKeyPem: null,
  complianceResults: [],
};

function renderZatcaPage() {
  return render(
    <MemoryRouter>
      <ZatcaPage />
    </MemoryRouter>,
  );
}

describe('ZatcaPage — sandbox autofill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockResolvedValue(emptyConfig);
    mockGetStatus.mockResolvedValue(otpVisibleOnboarding);
    mockListInvoices.mockResolvedValue([]);
    mockListCreditNotes.mockResolvedValue([]);
  });

  it('fills seller config fields with sandbox defaults when Sandbox is clicked', async () => {
    renderZatcaPage();

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByText('Seller Configuration')).toBeInTheDocument();
    });

    // Click the "Sandbox" button
    const sandboxBtn = screen.getByText('Sandbox');
    fireEvent.click(sandboxBtn);

    // Assert seller config fields are filled
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test POS Sandbox')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('399999999900003')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1234567890')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Street')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1234')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Riyadh')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12345')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Riyadh Branch')).toBeInTheDocument();
  });

  it('prefills OTP with sandbox value when Sandbox is clicked', async () => {
    renderZatcaPage();

    // Wait for onboarding to load (OTP input is visible because keyGenerated=true, complianceDone=false)
    await waitFor(() => {
      expect(screen.getByText('Ready for OTP submission')).toBeInTheDocument();
    });

    // Click the "Sandbox" button
    const sandboxBtn = screen.getByText('Sandbox');
    fireEvent.click(sandboxBtn);

    // Assert OTP input is prefilled
    await waitFor(() => {
      const otpInput = screen.getByPlaceholderText('Enter OTP from ZATCA portal');
      expect(otpInput).toHaveValue('123456');
    });
  });

  it('does NOT call updateConfig (save) when Sandbox is clicked', async () => {
    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('Seller Configuration')).toBeInTheDocument();
    });

    const sandboxBtn = screen.getByText('Sandbox');
    fireEvent.click(sandboxBtn);

    // Give any async work time to settle
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test POS Sandbox')).toBeInTheDocument();
    });

    // updateConfig should not have been called just by selecting environment
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('Simulation button does NOT overwrite config with sandbox defaults', async () => {
    // Start by clicking Sandbox to fill config with sandbox defaults
    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('Seller Configuration')).toBeInTheDocument();
    });

    // Click Sandbox first
    fireEvent.click(screen.getByText('Sandbox'));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test POS Sandbox')).toBeInTheDocument();
    });

    // Now click Simulation — fields should still have sandbox values (no clearing)
    fireEvent.click(screen.getByText('Simulation'));

    // Values should still be present (not cleared)
    expect(screen.getByDisplayValue('Test POS Sandbox')).toBeInTheDocument();
    expect(screen.getByDisplayValue('399999999900003')).toBeInTheDocument();
  });

  it('Production button does NOT overwrite config with sandbox defaults', async () => {
    renderZatcaPage();

    await waitFor(() => {
      expect(screen.getByText('Seller Configuration')).toBeInTheDocument();
    });

    // Click Production — should not fill sandbox values
    fireEvent.click(screen.getByText('Production'));

    // Fields should remain empty (no sandbox defaults injected);
    // check that sandbox seller name is NOT present in any input
    expect(screen.queryByDisplayValue('Test POS Sandbox')).toBeNull();
    expect(screen.queryByDisplayValue('399999999900003')).toBeNull();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});
