import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderPage } from '../pages/OrderPage';

// Mock API client
const mockDayCurrent = vi.fn();
const mockListCategories = vi.fn();
const mockListItems = vi.fn();
const mockTablesList = vi.fn();
const mockDeliveryPartnersListEnabled = vi.fn();
const mockOrdersList = vi.fn().mockResolvedValue([]);
const mockOrdersGet = vi.fn();
const mockOrdersUpdateItemUnitPrice = vi.fn();
const mockListActiveUsers = vi.fn();

/** Mutable current user — flip updateOrder per test. */
let mockMe: Record<string, unknown> = {};

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
    deliveryPartners: {
      listEnabled: (...args: any[]) => mockDeliveryPartnersListEnabled(...args),
    },
    orders: {
      list: (...args: any[]) => mockOrdersList(...args),
      get: (...args: any[]) => mockOrdersGet(...args),
      create: vi.fn(),
      syncItems: vi.fn(),
      update: vi.fn(),
      updatePartner: vi.fn(),
      updateItemUnitPrice: (...args: any[]) => mockOrdersUpdateItemUnitPrice(...args),
      pay: vi.fn(),
      void: vi.fn(),
      refund: vi.fn(),
      getRefunds: vi.fn(),
      getEvents: vi.fn(),
      verifyEvents: vi.fn(),
      reprint: vi.fn(),
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
  getMe: () => mockMe,
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
    name: 'Pepsi',
    priceHalalas: 575,
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

const partners = [
  {
    id: 'hungerstation',
    title: 'HungerStation',
    enabled: true,
    sortOrder: 0,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
  },
];

function makeLine(overrides: Record<string, unknown> = {}) {
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

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orderNo: 42,
    documentId: 'INV26-0042',
    uuid: 'test-uuid',
    type: 'takeaway',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 4000,
    vatHalalas: 600,
    totalHalalas: 4600,
    discountHalalas: 0,
    isStandardInvoice: false,
    zatcaBuyerDetails: null,
    deliveryPartnerId: 'hungerstation',
    deliveryPartnerTitle: 'HungerStation',
    deliveryExternalRef: 'HS-P7',
    createdAt: 1000,
    updatedAt: 5000,
    createdBy: null,
    updatedBy: null,
    items: [makeLine()],
    events: [],
    payments: [],
    ...overrides,
  };
}

function renderOrderPage(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<OrderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockBaseData() {
  mockDayCurrent.mockResolvedValue({ status: 'open', businessDate: '2026-07-22' });
  mockListCategories.mockResolvedValue(categories);
  mockListItems.mockResolvedValue(items);
  mockTablesList.mockResolvedValue(tables);
  mockDeliveryPartnersListEnabled.mockResolvedValue(partners);
}

/** Renders an open takeaway order with a partner set and waits for it. */
async function renderPartnerOrder(overrides: Record<string, unknown> = {}) {
  mockOrdersGet.mockResolvedValue(makeOrder(overrides));
  renderOrderPage(['/?orderId=1']);
  await waitFor(() => {
    expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
  });
}

describe('OrderPage — Edit partner prices (ADR 0007, Phase 7)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockListActiveUsers.mockResolvedValue([]);
    mockOrdersList.mockResolvedValue([]);
    mockBaseData();
    mockMe = {
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
    };
  });

  it('button hidden pre-create, on dine-in, on partnerless open orders', async () => {
    // Pre-create cart → no button
    renderOrderPage();
    await waitFor(() => expect(screen.getByText('Burger')).toBeInTheDocument());
    expect(screen.queryByText(/Edit partner prices/i)).not.toBeInTheDocument();

    // Dine-in open order → no button
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1 }));
    renderOrderPage(['/?orderId=1']);
    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Edit partner prices/i)).not.toBeInTheDocument();

    // Partnerless takeaway open order → no button
    mockOrdersGet.mockResolvedValue(
      makeOrder({ deliveryPartnerId: null, deliveryPartnerTitle: null, deliveryExternalRef: null }),
    );
    renderOrderPage(['/?orderId=1']);
    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Edit partner prices/i)).not.toBeInTheDocument();
  });

  it('button hidden without update_order permission', async () => {
    mockMe = { ...mockMe, updateOrder: false };
    await renderPartnerOrder();
    expect(screen.queryByText(/Edit partner prices/i)).not.toBeInTheDocument();
  });

  it('button visible on an open partner order with permission; opens the modal listing lines, prices and floors', async () => {
    mockOrdersGet.mockResolvedValue(
      makeOrder({
        items: [
          makeLine({ id: 101, itemName: 'Burger', unitPriceHalalas: 2300, qty: 2 }),
          makeLine({ id: 102, itemName: 'Pepsi', itemId: 2, unitPriceHalalas: 575, qty: 1 }),
        ],
      }),
    );
    renderOrderPage(['/?orderId=1']);
    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    const button = screen.getByText(/Edit partner prices/i);
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText('Edit Partner Prices')).toBeInTheDocument();
    });

    // Lines show name, current unit price (SAR) and the catalog floor hint
    // (names also appear in the menu grid + cart, so use getAllByText)
    expect(screen.getAllByText('Burger').length).toBeGreaterThan(0);
    expect(screen.getByText('×2 · 23.00 SAR each')).toBeInTheDocument();
    expect(screen.getByText('Min 23.00 SAR')).toBeInTheDocument();
    expect(screen.getByText('×1 · 5.75 SAR each')).toBeInTheDocument();
    expect(screen.getByText('Min 5.75 SAR')).toBeInTheDocument();

    // Inputs initialized to the current price in SAR
    const burgerInput = screen.getByLabelText('New price for Burger') as HTMLInputElement;
    expect(burgerInput.value).toBe('23.00');
  });

  it('client-side validation: below-floor value shows an error and disables Save', async () => {
    await renderPartnerOrder();

    fireEvent.click(screen.getByText(/Edit partner prices/i));
    await waitFor(() => {
      expect(screen.getByText('Edit Partner Prices')).toBeInTheDocument();
    });

    const burgerInput = screen.getByLabelText('New price for Burger');
    fireEvent.change(burgerInput, { target: { value: '22.99' } });

    await waitFor(() => {
      expect(screen.getByText('Below minimum of 23.00 SAR')).toBeInTheDocument();
    });

    const save = screen.getByText('Save Changes') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(mockOrdersUpdateItemUnitPrice).not.toHaveBeenCalled();
  });

  it('legacy line (item_id null) is listed but not editable', async () => {
    mockOrdersGet.mockResolvedValue(
      makeOrder({
        items: [
          makeLine(),
          makeLine({
            id: 102,
            itemId: null,
            itemName: 'Legacy Special',
            unitPriceHalalas: 2000,
            qty: 1,
          }),
        ],
      }),
    );
    renderOrderPage(['/?orderId=1']);
    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Edit partner prices/i));
    await waitFor(() => {
      // Appears in the cart items list AND the modal line list
      expect(screen.getAllByText('Legacy Special').length).toBe(2);
    });
    expect(
      screen.getByText('Catalog item missing — price cannot be overridden.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('New price for Legacy Special')).not.toBeInTheDocument();
  });

  it('save runs one PATCH per changed line threading baseUpdatedAt; cart hydrates from the final response', async () => {
    mockOrdersGet.mockResolvedValue(
      makeOrder({
        items: [
          makeLine({ id: 101, itemName: 'Burger', unitPriceHalalas: 2300, qty: 2 }),
          makeLine({ id: 102, itemName: 'Pepsi', itemId: 2, unitPriceHalalas: 575, qty: 1 }),
        ],
      }),
    );
    renderOrderPage(['/?orderId=1']);
    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    // Sequential responses: updatedAt ticks after each PATCH.
    mockOrdersUpdateItemUnitPrice
      .mockResolvedValueOnce(
        makeOrder({
          updatedAt: 6000,
          totalHalalas: 5100,
          items: [
            makeLine({
              id: 101,
              itemName: 'Burger',
              unitPriceHalalas: 2500,
              qty: 2,
              totalHalalas: 5000,
            }),
            makeLine({ id: 102, itemName: 'Pepsi', itemId: 2, unitPriceHalalas: 575, qty: 1 }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        makeOrder({
          updatedAt: 7000,
          totalHalalas: 5500,
          items: [
            makeLine({
              id: 101,
              itemName: 'Burger',
              unitPriceHalalas: 2500,
              qty: 2,
              totalHalalas: 5000,
            }),
            makeLine({ id: 102, itemName: 'Pepsi', itemId: 2, unitPriceHalalas: 575, qty: 1 }),
          ],
        }),
      );

    fireEvent.click(screen.getByText(/Edit partner prices/i));
    await waitFor(() => {
      expect(screen.getByText('Edit Partner Prices')).toBeInTheDocument();
    });

    // Change both lines (SAR decimal input → halalas)
    fireEvent.change(screen.getByLabelText('New price for Burger'), {
      target: { value: '25' },
    });
    fireEvent.change(screen.getByLabelText('New price for Pepsi'), {
      target: { value: '6.00' },
    });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockOrdersUpdateItemUnitPrice).toHaveBeenCalledTimes(2);
    });

    // Sequential PATCHes: second uses the first response's updatedAt
    expect(mockOrdersUpdateItemUnitPrice.mock.calls[0]).toEqual([
      1,
      101,
      { baseUpdatedAt: 5000, unitPriceHalalas: 2500 },
    ]);
    expect(mockOrdersUpdateItemUnitPrice.mock.calls[1]).toEqual([
      1,
      102,
      { baseUpdatedAt: 6000, unitPriceHalalas: 600 },
    ]);

    // Modal closes and the cart hydrates from the final response
    await waitFor(() => {
      expect(screen.queryByText('Edit Partner Prices')).not.toBeInTheDocument();
    });
    // Items tab line total now reflects the overridden unit price (25.00 × 2)
    expect(screen.getByText('50.00')).toBeInTheDocument();
  });

  it('server 400 (floor raised) is surfaced inside the modal and the modal stays open', async () => {
    await renderPartnerOrder();

    mockOrdersUpdateItemUnitPrice.mockRejectedValue(
      new Error(
        'HTTP 400 Bad Request: Unit price must be at least the catalog price of 2500 halalas (floor)',
      ),
    );

    fireEvent.click(screen.getByText(/Edit partner prices/i));
    await waitFor(() => {
      expect(screen.getByText('Edit Partner Prices')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('New price for Burger'), {
      target: { value: '24' },
    });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(screen.getByTestId('price-save-error')).toHaveTextContent(/floor/i);
    });
    // Modal stays open so the cashier can adjust
    expect(screen.getByText('Edit Partner Prices')).toBeInTheDocument();
  });
});
