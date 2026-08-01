import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
const mockOrdersReprint = vi.fn();
const mockPaymentMethodsListEnabled = vi.fn();
const mockGetMe = vi.fn();

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
    auth: { login: vi.fn(), me: vi.fn() },
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
      void: vi.fn(),
      refund: vi.fn(),
      getRefunds: vi.fn(),
      getEvents: vi.fn(),
      verifyEvents: vi.fn(),
      reprint: (...args: any[]) => mockOrdersReprint(...args),
      getZatcaInvoice: vi.fn(),
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

describe('OrderPage — ADR 0006 tabs (Items | Payments | Summary)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    // Wait for the modal numpad (rendered after payment methods load)
    await waitFor(() => {
      expect(screen.getByTestId('amount-numpad')).toBeInTheDocument();
    });
    const amountNumpad = within(screen.getByTestId('amount-numpad'));

    // Enter 46.40 via numpad (sign defaults to +) — above the 46.00 total.
    // The tendered numpad appears once the amount > 0, so scope all key taps.
    fireEvent.click(amountNumpad.getByText('4'));
    fireEvent.click(amountNumpad.getByText('6'));
    fireEvent.click(amountNumpad.getByText('.'));
    fireEvent.click(amountNumpad.getByText('4'));
    fireEvent.click(amountNumpad.getByText('0'));

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
    await waitFor(() => {
      expect(screen.getByTestId('amount-numpad')).toBeInTheDocument();
    });
    const amountNumpad = within(screen.getByTestId('amount-numpad'));

    fireEvent.click(screen.getByText('−')); // sign toggle (U+2212)
    fireEvent.click(amountNumpad.getByText('1'));
    fireEvent.click(amountNumpad.getByText('0'));

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
      expect(mockOrdersSubmit).toHaveBeenCalledWith(1, { baseUpdatedAt: 5000 });
    });
    await waitFor(() => {
      expect(screen.getByText('paid')).toBeInTheDocument();
    });
  });

  it('summary tab: standard invoice toggle reveals the buyer form', async () => {
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
    expect(screen.queryByText('Buyer Name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Issue ZATCA Standard Invoice'));

    await waitFor(() => {
      expect(screen.getByText('Buyer Name')).toBeInTheDocument();
    });
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
});
