import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderPage } from '../pages/OrderPage';

// Mock API client
const mockDayCurrent = vi.fn();
const mockListCategories = vi.fn();
const mockListItems = vi.fn();
const mockTablesList = vi.fn();
const mockOrdersGet = vi.fn();
const mockOrdersSyncItems = vi.fn();
const mockOrdersSendToKitchen = vi.fn();
const mockOrdersAddPayment = vi.fn();
const mockOrdersSubmit = vi.fn();
const mockOrdersUpdateStandardInvoice = vi.fn();
const mockOrdersReprint = vi.fn();
const mockOrdersGetZatcaInvoice = vi.fn();
const mockPaymentMethodsListEnabled = vi.fn();
const mockGetMe = vi.fn();
const mockListActiveUsers = vi.fn();

function makeMe(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

vi.mock('../api', () => ({
  client: {
    auth: {
      login: vi.fn(),
      me: vi.fn(),
      listActiveUsers: (...args: any[]) => mockListActiveUsers(...args),
    },
    menu: {
      listCategories: (...args: any[]) => mockListCategories(...args),
      listItems: (...args: any[]) => mockListItems(...args),
    },
    tables: {
      list: (...args: any[]) => mockTablesList(...args),
    },
    paymentMethods: {
      listEnabled: (...args: any[]) => mockPaymentMethodsListEnabled(...args),
    },
    orders: {
      list: vi.fn().mockResolvedValue([]),
      get: (...args: any[]) => mockOrdersGet(...args),
      create: vi.fn(),
      syncItems: (...args: any[]) => mockOrdersSyncItems(...args),
      sendToKitchen: (...args: any[]) => mockOrdersSendToKitchen(...args),
      addPayment: (...args: any[]) => mockOrdersAddPayment(...args),
      submit: (...args: any[]) => mockOrdersSubmit(...args),
      updateStandardInvoice: (...args: any[]) => mockOrdersUpdateStandardInvoice(...args),
      void: vi.fn(),
      refund: vi.fn(),
      getRefunds: vi.fn(),
      getEvents: vi.fn(),
      verifyEvents: vi.fn(),
      reprint: (...args: any[]) => mockOrdersReprint(...args),
      getZatcaInvoice: (...args: any[]) => mockOrdersGetZatcaInvoice(...args),
      retryZatcaClearance: vi.fn(),
      reissueZatcaInvoice: vi.fn(),
    },
    day: {
      current: (...args: any[]) => mockDayCurrent(...args),
      open: vi.fn(),
      close: vi.fn(),
      list: vi.fn(),
    },
    reports: {
      x: vi.fn(),
      z: vi.fn(),
      printX: vi.fn(),
      printZ: vi.fn(),
    },
  },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  getMe: () => mockGetMe(),
  isAuthenticated: vi.fn(() => true),
}));

const categories = [
  { id: 1, name: 'Burgers', sortOrder: 0, isActive: true, createdAt: 0, updatedAt: 0 },
];

const items = [
  {
    id: 1,
    categoryId: 1,
    name: 'Burger',
    priceHalalas: 2300,
    vatRateBp: 1500,
    sortOrder: 0,
    isActive: true,
    nameAr: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
  },
  {
    id: 2,
    categoryId: 1,
    name: 'Fries',
    priceHalalas: 1150,
    vatRateBp: 1500,
    sortOrder: 1,
    isActive: true,
    nameAr: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
  },
];

const tables = [{ id: 1, name: 'T1', isActive: true, createdAt: 1000, updatedAt: 1000 }];

function makeOrderItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    orderId: 1,
    itemId: 1,
    itemName: 'Burger',
    unitPriceHalalas: 2300,
    vatRateBp: 1500,
    qty: 2,
    totalHalalas: 4600,
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    methodId: 'cash',
    methodTitle: 'Cash',
    zatcaPaymentMeansCode: '10',
    amountHalalas: 4600,
    tenderedHalalas: 4600,
    changeHalalas: 0,
    createdAt: 5000,
    ...overrides,
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orderNo: 42,
    documentId: 'INV26-0042',
    uuid: 'test-uuid',
    type: 'dine_in',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 4600,
    vatHalalas: 600,
    totalHalalas: 4600,
    discountHalalas: 0,
    isStandardInvoice: false,
    zatcaBuyerDetails: null,
    createdAt: 1000,
    updatedAt: 5000,
    createdBy: null,
    updatedBy: null,
    items: [makeOrderItem()],
    events: [],
    payments: [],
    ...overrides,
  };
}

function renderOrderPage(initialEntries: string[] = ['/?orderId=1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<OrderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockDayIsOpen() {
  mockDayCurrent.mockResolvedValue({ status: 'open', businessDate: '2026-07-22' });
  mockListCategories.mockResolvedValue(categories);
  mockListItems.mockResolvedValue(items);
  mockTablesList.mockResolvedValue(tables);
}

function mockGetReturns(order: Record<string, unknown>) {
  mockOrdersGet.mockResolvedValue(Promise.resolve(order));
}

function fillBuyerForm(buyer: Record<string, string>) {
  fireEvent.change(screen.getByPlaceholderText('Company / Legal Name'), {
    target: { value: buyer.name },
  });
  fireEvent.change(screen.getByPlaceholderText('300123456789012'), {
    target: { value: buyer.vatNumber },
  });
  fireEvent.change(screen.getByPlaceholderText('King Fahd Road'), {
    target: { value: buyer.street },
  });
  fireEvent.change(screen.getByPlaceholderText('7845'), {
    target: { value: buyer.buildingNumber },
  });
  fireEvent.change(screen.getByPlaceholderText('Al-Olaya'), {
    target: { value: buyer.citySubdivision },
  });
  fireEvent.change(screen.getByPlaceholderText('Riyadh'), {
    target: { value: buyer.city },
  });
  fireEvent.change(screen.getByPlaceholderText('12271'), {
    target: { value: buyer.postalCode },
  });
  fireEvent.change(screen.getByPlaceholderText('SA'), {
    target: { value: buyer.country },
  });
}

describe('OrderPage — ADR 0006 tabs (Items | Payments | Summary)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListActiveUsers.mockResolvedValue([]);
    mockGetMe.mockReturnValue(makeMe());
    mockDayIsOpen();
    mockPaymentMethodsListEnabled.mockResolvedValue([
      { id: 'cash', title: 'Cash' },
      { id: 'card', title: 'Card' },
    ]);
  });

  it('open order shows the three tabs; pre-create does not', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  // ---- Payments tab ----

  it('payments tab: outstanding comes from SERVER totals (not the dirty cart)', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Dirty the cart: +1 Fries (local total becomes 57.50)
    fireEvent.click(screen.getAllByText('Fries')[0]);
    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Payments'));

    // Outstanding still 46.00 (server total), not 57.50 (local cart)
    await waitFor(() => {
      expect(screen.getByText('46.00 SAR')).toBeInTheDocument();
    });
    expect(screen.queryByText('57.50 SAR')).not.toBeInTheDocument();
    expect(screen.getByText('No payments yet')).toBeInTheDocument();
  });

  it('payments tab: Add Payment disabled with hint when cart dirty', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Fries')[0]);
    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Payments'));

    await waitFor(() => {
      expect(screen.getByText('Save items before adding payments')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Add Payment' })).toBeDisabled();
  });

  it('payments tab: appending a payment hydrates the log; overpay is allowed', async () => {
    mockGetReturns(makeOrder());
    // Server accepts a line larger than the total (temporary overpay)
    mockOrdersAddPayment.mockResolvedValue(
      makeOrder({
        updatedAt: 6000,
        payments: [makePayment({ amountHalalas: 4640 })],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Payments'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Payment' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Payment' }));
    // No auto-select on open: the amount block stays hidden until a method
    // chip is picked.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cash' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('payment-amount-input')).not.toBeInTheDocument();

    // Clicking a method prefills the amount from outstanding (46.00).
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    await waitFor(() => {
      expect(screen.getByTestId('payment-amount-input')).toBeInTheDocument();
    });
    // Money field is a text input — the prefill is the string "46.00".
    expect(screen.getByTestId('payment-amount-input')).toHaveValue('46.00');

    // Clear the prefill and enter 46.40 via the money text input (sign
    // defaults to +) — above the 46.00 total. The tendered input appears
    // once the amount > 0.
    const amountInput = screen.getByTestId('payment-amount-input');
    fireEvent.change(amountInput, { target: { value: '' } });
    fireEvent.change(amountInput, { target: { value: '46.40' } });

    // Modal confirm button — the footer Add Payment button is also in the DOM
    const confirmButtons = screen.getAllByRole('button', { name: 'Add Payment' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockOrdersAddPayment).toHaveBeenCalledWith(1, {
        methodId: 'cash',
        amountHalalas: 4640,
      });
    });

    // Modal closed, ledger hydrated from the returned order — overpaid by 40
    await waitFor(() => {
      expect(screen.getByText('0.40 SAR')).toBeInTheDocument();
      expect(screen.getByText('(overpaid)')).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading payment methods...')).not.toBeInTheDocument();
  });

  it('payments tab: negative sign produces a correction line (no tendered)', async () => {
    mockGetReturns(makeOrder({ payments: [makePayment()] }));
    mockOrdersAddPayment.mockResolvedValue(
      makeOrder({
        updatedAt: 6000,
        payments: [makePayment(), makePayment({ id: 2, amountHalalas: -1000 })],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Payments'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Payment' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Payment' }));
    // No auto-select on open; picking Cash with 0 outstanding prefills
    // nothing (empty amount, sign +1).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cash' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('payment-amount-input')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    await waitFor(() => {
      expect(screen.getByTestId('payment-amount-input')).toBeInTheDocument();
    });
    const amountInput = screen.getByTestId('payment-amount-input');

    fireEvent.click(screen.getByText('−')); // sign toggle (U+2212)
    fireEvent.change(amountInput, { target: { value: '10' } });

    const confirmButtons = screen.getAllByRole('button', { name: 'Add Payment' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockOrdersAddPayment).toHaveBeenCalledWith(1, {
        methodId: 'cash',
        amountHalalas: -1000,
      });
    });

    // Outstanding rises back to 10.00 after the correction
    await waitFor(() => {
      expect(screen.getByText('10.00 SAR')).toBeInTheDocument();
    });
  });

  it('payments tab: log renders oldest-first (append order)', async () => {
    mockGetReturns(
      makeOrder({
        payments: [
          makePayment({ id: 1, amountHalalas: 4600 }),
          makePayment({
            id: 2,
            methodId: 'card',
            methodTitle: 'Card',
            zatcaPaymentMeansCode: '48',
            amountHalalas: -3000,
          }),
        ],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Payments'));

    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
      expect(screen.getByText('Card')).toBeInTheDocument();
    });

    // Log rows in array (append) order: 46.00 before the −30.00 correction.
    // Outstanding (30.00) must not collide with the correction row text.
    const amounts = screen
      .getAllByText(/SAR$/)
      .map((el) => el.textContent)
      .filter((t): t is string => t !== null);
    const cashIdx = amounts.findIndex((t) => t === '46.00 SAR');
    const correctionIdx = amounts.findIndex((t) => t === '−30.00 SAR');
    expect(cashIdx).toBeGreaterThanOrEqual(0);
    expect(correctionIdx).toBeGreaterThanOrEqual(0);
    expect(cashIdx).toBeLessThan(correctionIdx);
  });

  // ---- ADR 0007: delivery-partner payment method filtering ----

  it('payments tab: partner order modal shows ONLY the partner method; one tap selects + prefills', async () => {
    mockGetReturns(
      makeOrder({
        type: 'takeaway',
        tableId: null,
        deliveryPartnerId: 'hungerstation',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-1',
      }),
    );
    mockPaymentMethodsListEnabled.mockResolvedValue([
      { id: 'cash', title: 'Cash', isDeliveryPartner: false },
      { id: 'card', title: 'Card', isDeliveryPartner: false },
      { id: 'hungerstation', title: 'HungerStation', isDeliveryPartner: true },
      { id: 'keeta', title: 'Keeta', isDeliveryPartner: true },
    ]);
    mockOrdersAddPayment.mockResolvedValue(
      makeOrder({
        type: 'takeaway',
        tableId: null,
        deliveryPartnerId: 'hungerstation',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-1',
        updatedAt: 6000,
        payments: [
          makePayment({
            methodId: 'hungerstation',
            methodTitle: 'HungerStation',
            zatcaPaymentMeansCode: '30',
            tenderedHalalas: null,
            changeHalalas: null,
          }),
        ],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Payments'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Payment' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Payment' }));
    // No auto-select — even a sole partner method still requires one tap.
    await waitFor(() => {
      expect(screen.getByText('HungerStation')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('payment-amount-input')).not.toBeInTheDocument();

    // Partner method chip is present (the order header also shows the
    // partner title + ref as the type label); non-partner and
    // other-partner methods are NOT rendered.
    expect(screen.getByText('HungerStation / HS-1')).toBeInTheDocument(); // header type label
    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
    expect(screen.queryByText('Keeta')).not.toBeInTheDocument();

    // Tapping the sole partner method selects it and prefills the
    // outstanding 46.00: confirming sends its id.
    fireEvent.click(screen.getByText('HungerStation'));
    await waitFor(() => {
      expect(screen.getByTestId('payment-amount-input')).toHaveValue('46.00');
    });
    const confirmButtons = screen.getAllByRole('button', { name: 'Add Payment' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockOrdersAddPayment).toHaveBeenCalledWith(1, {
        methodId: 'hungerstation',
        amountHalalas: 4600,
      });
    });
  });

  it('payments tab: no-partner order hides partner-owned methods (ADR 0007)', async () => {
    mockGetReturns(makeOrder());
    mockPaymentMethodsListEnabled.mockResolvedValue([
      { id: 'cash', title: 'Cash', isDeliveryPartner: false },
      { id: 'card', title: 'Card', isDeliveryPartner: false },
      { id: 'hungerstation', title: 'HungerStation', isDeliveryPartner: true },
      { id: 'keeta', title: 'Keeta', isDeliveryPartner: true },
    ]);

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Payments'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Payment' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Payment' }));
    // No auto-select on open: the amount block only appears after a method
    // chip is picked.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cash' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('payment-amount-input')).not.toBeInTheDocument();

    // Normal methods remain visible; partner-owned methods are hidden.
    expect(screen.getByRole('button', { name: 'Card' })).toBeInTheDocument();
    expect(screen.queryByText('HungerStation')).not.toBeInTheDocument();
    expect(screen.queryByText('Keeta')).not.toBeInTheDocument();

    // Picking a method reveals the amount block.
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    await waitFor(() => {
      expect(screen.getByTestId('payment-amount-input')).toBeInTheDocument();
    });
  });

  // ---- Summary tab ----

  it('summary tab: Submit disabled while outstanding', async () => {
    mockGetReturns(
      makeOrder({
        payments: [makePayment({ amountHalalas: 2300 })],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    // Outstanding displayed (23.00 also appears in the menu grid — presence
    // is what matters here); the real assertion is the disabled Submit
    expect(screen.getAllByText('23.00 SAR').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('summary tab: Submit finalizes when balanced, then hydrates paid state', async () => {
    // First get (deep-link) returns the open order; later gets (refresh after
    // submit) return the paid order
    mockOrdersGet.mockResolvedValueOnce(
      Promise.resolve(
        makeOrder({
          payments: [makePayment()],
        }),
      ),
    );
    mockOrdersGet.mockResolvedValue(
      Promise.resolve(makeOrder({ status: 'paid', updatedAt: 6000, payments: [makePayment()] })),
    );
    mockOrdersSubmit.mockResolvedValue({ success: true, status: 'paid' });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(mockOrdersSubmit).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 5000,
        printReceipt: false,
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Paid')).toBeInTheDocument();
    });
  });

  it('summary tab: standard invoice toggle opens the buyer details modal', async () => {
    mockGetReturns(
      makeOrder({
        payments: [makePayment()],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
    });
    // No inline form before checking
    expect(screen.queryByText('Standard Invoice — Buyer Details')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Issue ZATCA Standard Invoice'));

    // The modal opens (not an inline expand) with the buyer form + OSK dock
    await waitFor(() => {
      expect(screen.getByText('Standard Invoice — Buyer Details')).toBeInTheDocument();
    });
    expect(screen.getByText('Buyer Name')).toBeInTheDocument();
    expect(screen.getByTestId('osk-dock')).toBeInTheDocument();
  });

  it('summary tab: standard invoice modal — Cancel with empty buyer closes and unchecks', async () => {
    mockGetReturns(
      makeOrder({
        payments: [makePayment()],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
    });

    const toggle = screen.getByLabelText('Issue ZATCA Standard Invoice');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText('Standard Invoice — Buyer Details')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByText('Standard Invoice — Buyer Details')).not.toBeInTheDocument();
    });
    // Empty/invalid buyer → the toggle is un-checked so no incomplete
    // standard invoice can be left armed; the checkbox is back
    expect(toggle).not.toBeChecked();
    expect(screen.getByLabelText('Issue ZATCA Standard Invoice')).toBeInTheDocument();
    expect(screen.queryByText('Standard Invoice')).not.toBeInTheDocument();
  });

  it('summary tab: standard invoice modal — valid buyer + Done PATCHes immediately and Submit sends standard payload', async () => {
    const validBuyer = {
      name: 'Abdullah Al-Otaibi Est.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
      country: 'SA',
    };
    mockGetReturns(
      makeOrder({
        payments: [makePayment()],
      }),
    );
    // Done → PATCH resolves with the persisted standard order (updatedAt bumped)
    mockOrdersUpdateStandardInvoice.mockResolvedValue(
      makeOrder({
        updatedAt: 6000,
        isStandardInvoice: true,
        zatcaBuyerDetails: validBuyer,
        payments: [makePayment()],
      }),
    );
    mockOrdersSubmit.mockResolvedValue({ success: true, status: 'paid' });
    mockOrdersGetZatcaInvoice.mockResolvedValue({
      invoiceType: 'standard',
      current: {
        id: 1,
        attemptNo: 1,
        status: 'pending',
        icv: 1,
        uuid: 'abc',
        errors: [],
        warnings: [],
        httpStatus: null,
        createdAt: 0,
        updatedAt: 0,
      },
      attempts: [],
      canRetryClearance: false,
      canReissue: false,
    });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
    });

    const toggle = screen.getByLabelText('Issue ZATCA Standard Invoice');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText('Standard Invoice — Buyer Details')).toBeInTheDocument();
    });

    fillBuyerForm(validBuyer);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    // Done PATCHes the buyer onto the open order right away
    await waitFor(() => {
      expect(mockOrdersUpdateStandardInvoice).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 5000,
        isStandardInvoice: true,
        zatcaBuyerDetails: validBuyer,
      });
    });

    // Modal closes after the PATCH resolves; the checkbox is replaced by the
    // buyer callout (hydrated from the response)
    await waitFor(() => {
      expect(screen.queryByText('Standard Invoice — Buyer Details')).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Issue ZATCA Standard Invoice')).not.toBeInTheDocument();
    expect(screen.getByText('Standard Invoice')).toBeInTheDocument();
    expect(screen.getByText(validBuyer.name)).toBeInTheDocument();
    expect(screen.getByText(`VAT ${validBuyer.vatNumber}`)).toBeInTheDocument();
    expect(
      screen.getByText(`${validBuyer.city} · ${validBuyer.citySubdivision}`),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(mockOrdersSubmit).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 6000,
        isStandardInvoice: true,
        zatcaBuyerDetails: validBuyer,
      });
    });
  });

  it('summary tab: standard invoice modal — Cancel from editing keeps the previously saved valid buyer', async () => {
    const savedBuyer = {
      name: 'Abdullah Al-Otaibi Est.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
      country: 'SA',
    };
    mockGetReturns(
      makeOrder({
        payments: [makePayment()],
      }),
    );
    mockOrdersUpdateStandardInvoice.mockResolvedValue(
      makeOrder({
        updatedAt: 6000,
        isStandardInvoice: true,
        zatcaBuyerDetails: savedBuyer,
        payments: [makePayment()],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
    });

    const toggle = screen.getByLabelText('Issue ZATCA Standard Invoice');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText('Standard Invoice — Buyer Details')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Company / Legal Name'), {
      target: { value: savedBuyer.name },
    });
    fireEvent.change(screen.getByPlaceholderText('300123456789012'), {
      target: { value: savedBuyer.vatNumber },
    });
    fireEvent.change(screen.getByPlaceholderText('King Fahd Road'), {
      target: { value: savedBuyer.street },
    });
    fireEvent.change(screen.getByPlaceholderText('7845'), {
      target: { value: savedBuyer.buildingNumber },
    });
    fireEvent.change(screen.getByPlaceholderText('Al-Olaya'), {
      target: { value: savedBuyer.citySubdivision },
    });
    fireEvent.change(screen.getByPlaceholderText('Riyadh'), {
      target: { value: savedBuyer.city },
    });
    fireEvent.change(screen.getByPlaceholderText('12271'), {
      target: { value: savedBuyer.postalCode },
    });
    fireEvent.change(screen.getByPlaceholderText('SA'), {
      target: { value: savedBuyer.country },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(mockOrdersUpdateStandardInvoice).toHaveBeenCalledTimes(1);
    });

    // Re-open via the callout body — the draft is seeded with saved data
    fireEvent.click(screen.getByLabelText('Edit standard invoice buyer details'));
    await waitFor(() => {
      expect(screen.getByText('Standard Invoice — Buyer Details')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Company / Legal Name')).toHaveValue(savedBuyer.name);

    // Edit the draft, then Cancel — the draft change must not clobber the
    // committed buyer on the parent
    fireEvent.change(screen.getByPlaceholderText('Company / Legal Name'), {
      target: { value: 'Changed Co.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByText('Standard Invoice — Buyer Details')).not.toBeInTheDocument();
    });
    // Callout still shows the committed buyer; checkbox stays hidden
    expect(screen.queryByLabelText('Issue ZATCA Standard Invoice')).not.toBeInTheDocument();
    expect(screen.getByText(savedBuyer.name)).toBeInTheDocument();
    expect(screen.queryByText('Changed Co.')).not.toBeInTheDocument();
  });

  it('summary tab: standard invoice callout X PATCHes a clear and restores the checkbox', async () => {
    const savedBuyer = {
      name: 'Abdullah Al-Otaibi Est.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
      country: 'SA',
    };
    mockGetReturns(
      makeOrder({
        payments: [makePayment()],
      }),
    );
    // Done → PATCH resolves with the persisted standard order
    mockOrdersUpdateStandardInvoice.mockResolvedValueOnce(
      makeOrder({
        updatedAt: 6000,
        isStandardInvoice: true,
        zatcaBuyerDetails: savedBuyer,
        payments: [makePayment()],
      }),
    );
    // X → PATCH clear resolves with the flag off
    mockOrdersUpdateStandardInvoice.mockResolvedValueOnce(
      makeOrder({
        updatedAt: 7000,
        isStandardInvoice: false,
        zatcaBuyerDetails: null,
        payments: [makePayment()],
      }),
    );
    mockOrdersSubmit.mockResolvedValue({ success: true, status: 'paid' });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByLabelText('Issue ZATCA Standard Invoice'));
    await waitFor(() => {
      expect(screen.getByText('Standard Invoice — Buyer Details')).toBeInTheDocument();
    });

    fillBuyerForm(savedBuyer);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(mockOrdersUpdateStandardInvoice).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 5000,
        isStandardInvoice: true,
        zatcaBuyerDetails: savedBuyer,
      });
    });
    expect(screen.getByText(savedBuyer.name)).toBeInTheDocument();

    // X clears the buyer via PATCH: callout gone, checkbox back and unchecked
    fireEvent.click(screen.getByLabelText('Clear standard invoice buyer'));
    await waitFor(() => {
      expect(mockOrdersUpdateStandardInvoice).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 6000,
        isStandardInvoice: false,
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('Standard Invoice')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(savedBuyer.name)).not.toBeInTheDocument();
    const toggle = screen.getByLabelText('Issue ZATCA Standard Invoice');
    expect(toggle).not.toBeChecked();

    // isStandardInvoice is off after the clear: Submit sends a plain payload
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(mockOrdersSubmit).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 7000,
        printReceipt: false,
      });
    });
  });

  it('summary tab: hydrated order with persisted standard invoice shows the callout without checking', async () => {
    const persistedBuyer = {
      name: 'Abdullah Al-Otaibi Est.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
      country: 'SA',
    };
    mockGetReturns(
      makeOrder({
        isStandardInvoice: true,
        zatcaBuyerDetails: persistedBuyer,
        payments: [makePayment()],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    // Callout directly — no checkbox to check, no modal to open
    await waitFor(() => {
      expect(screen.getByText('Standard Invoice')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Issue ZATCA Standard Invoice')).not.toBeInTheDocument();
    expect(screen.queryByText('Standard Invoice — Buyer Details')).not.toBeInTheDocument();
    expect(screen.getByText(persistedBuyer.name)).toBeInTheDocument();
    expect(screen.getByText(`VAT ${persistedBuyer.vatNumber}`)).toBeInTheDocument();
  });

  // ---- Print Open Receipt (non-ZATCA guest slip) ----

  it('summary tab: Print Open Receipt sits beside Void Order on a clean open order', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    expect(screen.getByRole('button', { name: 'Print Open Receipt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Void Order' })).toBeInTheDocument();
  });

  it('summary tab: Print Open Receipt prints via reprint(open_receipt) and confirms', async () => {
    mockGetReturns(makeOrder());
    mockOrdersReprint.mockResolvedValue({ success: true, errors: [] });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    const printBtn = screen.getByRole('button', { name: 'Print Open Receipt' });
    expect(printBtn).not.toBeDisabled();

    fireEvent.click(printBtn);

    await waitFor(() => {
      expect(mockOrdersReprint).toHaveBeenCalledWith(1, { target: 'open_receipt' });
    });
    await waitFor(() => {
      expect(screen.getByText('Open receipt printed')).toBeInTheDocument();
    });
  });

  it('summary tab: Print Open Receipt surfaces API errors under the button', async () => {
    mockGetReturns(makeOrder());
    mockOrdersReprint.mockResolvedValue({
      success: false,
      errors: ['No active receipt printer configured'],
    });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));
    fireEvent.click(screen.getByRole('button', { name: 'Print Open Receipt' }));

    await waitFor(() => {
      expect(screen.getByText('No active receipt printer configured')).toBeInTheDocument();
    });
    expect(screen.queryByText('Open receipt printed')).not.toBeInTheDocument();
  });

  it('summary tab: Print Open Receipt shows error text when the request rejects', async () => {
    mockGetReturns(makeOrder());
    mockOrdersReprint.mockRejectedValue(new Error('Printer offline'));

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));
    fireEvent.click(screen.getByRole('button', { name: 'Print Open Receipt' }));

    await waitFor(() => {
      expect(screen.getByText('Printer offline')).toBeInTheDocument();
    });
  });

  it('summary tab: Print Open Receipt hidden while the cart is dirty', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Dirty the cart: +1 Fries
    fireEvent.click(screen.getAllByText('Fries')[0]);
    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    expect(screen.queryByRole('button', { name: 'Print Open Receipt' })).not.toBeInTheDocument();
  });

  it('summary tab: Print Open Receipt hidden without updateOrder permission', async () => {
    mockGetMe.mockReturnValue(makeMe({ updateOrder: false }));
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    expect(screen.queryByRole('button', { name: 'Print Open Receipt' })).not.toBeInTheDocument();
  });

  it('summary tab: Print Open Receipt hidden for paid orders', async () => {
    mockGetReturns(makeOrder({ status: 'paid', payments: [makePayment()] }));

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    expect(screen.queryByRole('button', { name: 'Print Open Receipt' })).not.toBeInTheDocument();
  });

  // ---- Send to Kitchen ----

  it('items tab: Send to Kitchen sends deltas and hides once caught up', async () => {
    mockGetReturns(makeOrder());
    mockOrdersSendToKitchen.mockResolvedValue(
      makeOrder({
        updatedAt: 6000,
        events: [
          {
            id: 1,
            orderId: 1,
            eventIdx: 1,
            userId: 1,
            type: 'kitchen_print_enqueued',
            payload: JSON.stringify({
              printer: 'Kitchen A',
              printerId: 1,
              items: [{ orderItemId: 101, itemName: 'Burger', printedQty: 2 }],
            }),
            prevHash: '',
            hash: 'h',
            createdAt: 6000,
          },
        ],
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Clean + qty 2 + nothing printed → unsent deltas → button visible
    expect(screen.getByText('Send to Kitchen')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Send to Kitchen'));

    await waitFor(() => {
      expect(mockOrdersSendToKitchen).toHaveBeenCalledWith(1);
    });

    // Events now cover qty 2 → deltas gone → button hidden
    await waitFor(() => {
      expect(screen.queryByText('Send to Kitchen')).not.toBeInTheDocument();
    });
  });

  // ---- OrderHeader: creator name + notes placement ----

  it('header: hydrated order with createdBy shows the creator name (no prefix) from listActiveUsers', async () => {
    mockGetReturns(makeOrder({ createdBy: 1, createdAt: 1000 }));
    mockListActiveUsers.mockResolvedValue([
      { id: 1, username: 'sara', name: 'Sara' },
      { id: 2, username: 'ahmed', name: 'Ahmed' },
    ]);

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Sara')).toBeInTheDocument();
    });
    // Creator sits on the same row as the type label (type left, name right),
    // no "Created by" prefix
    const sara = screen.getByText('Sara');
    expect(sara.previousElementSibling?.textContent).toBe('Dine-in');
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();
  });

  it('header: unknown createdBy does not show a creator name', async () => {
    mockGetReturns(makeOrder({ createdBy: 99 }));
    mockListActiveUsers.mockResolvedValue([{ id: 1, username: 'sara', name: 'Sara' }]);

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sara')).not.toBeInTheDocument();
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();
  });

  it('items tab: order notes input pinned above Total in the Items footer, hidden on other tabs', async () => {
    mockGetReturns(makeOrder());

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Items tab is the default — the notes input is present, above the Total row
    const notesInput = screen.getByPlaceholderText('Order notes');
    expect(notesInput).toBeInTheDocument();
    const totalRow = screen.getByText('Total');
    expect(
      notesInput.compareDocumentPosition(totalRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Switching to Payments hides it (notes live only in the Items tab)
    fireEvent.click(screen.getByText('Payments'));
    expect(screen.queryByPlaceholderText('Order notes')).not.toBeInTheDocument();
  });

  it('pre-create: notes input visible in the empty-cart Items footer', async () => {
    renderOrderPage(['/']);

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Order notes')).toBeInTheDocument();
    expect(screen.getByText('New Order')).toBeInTheDocument();
  });
});
