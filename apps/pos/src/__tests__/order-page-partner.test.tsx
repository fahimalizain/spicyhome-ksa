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
const mockOrdersCreate = vi.fn();
const mockOrdersSyncItems = vi.fn();
const mockOrdersUpdate = vi.fn();
const mockOrdersUpdatePartner = vi.fn();
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
      create: (...args: any[]) => mockOrdersCreate(...args),
      syncItems: (...args: any[]) => mockOrdersSyncItems(...args),
      update: (...args: any[]) => mockOrdersUpdate(...args),
      updatePartner: (...args: any[]) => mockOrdersUpdatePartner(...args),
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
];

const tables = [
  { id: 1, name: 'T1', isActive: true, createdAt: 1000, updatedAt: 1000 },
  { id: 2, name: 'T2', isActive: true, createdAt: 1000, updatedAt: 1000 },
];

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
  {
    id: 'keeta',
    title: 'Keeta',
    enabled: true,
    sortOrder: 1,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
  },
];

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
    subtotalHalalas: 2300,
    vatHalalas: 300,
    totalHalalas: 2600,
    discountHalalas: 0,
    isStandardInvoice: false,
    zatcaBuyerDetails: null,
    deliveryPartnerId: null,
    deliveryPartnerTitle: null,
    deliveryExternalRef: null,
    createdAt: 1000,
    updatedAt: 5000,
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
        qty: 1,
        totalHalalas: 2300,
        notes: null,
        createdAt: 1000,
        updatedAt: 1000,
        createdBy: null,
        updatedBy: null,
      },
    ],
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

describe('OrderPage — delivery partner picker + external ref (ADR 0007, Phase 6)', () => {
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

  // ── Visibility: takeaway shows the control, dine_in hides it ──

  it('pre-create: partner control hidden for dine_in, shown after Takeaway', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    expect(screen.queryByText('Delivery partner…')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Takeaway'));

    await waitFor(() => {
      expect(screen.getByText('Delivery partner…')).toBeInTheDocument();
    });
    // No API partner calls pre-create
    expect(mockOrdersUpdatePartner).not.toHaveBeenCalled();
  });

  it('existing dine_in order: partner control hidden', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'dine_in', tableId: 1 }));

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    expect(screen.queryByText('Delivery partner…')).not.toBeInTheDocument();
    expect(screen.queryByText(/Partner:/)).not.toBeInTheDocument();
  });

  // ── Pre-create: local staging only ──

  it('pre-create: picker lists None + enabled partners; selecting is local-only', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Takeaway'));
    fireEvent.click(screen.getByText('Delivery partner…'));

    await waitFor(() => {
      expect(screen.getByText('Select Delivery Partner')).toBeInTheDocument();
    });
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText('HungerStation')).toBeInTheDocument();
    expect(screen.getByText('Keeta')).toBeInTheDocument();

    fireEvent.click(screen.getByText('HungerStation'));

    // Picker closes; partner shown on the toggle; no API calls
    await waitFor(() => {
      expect(screen.queryByText('Select Delivery Partner')).not.toBeInTheDocument();
      expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
    });
    expect(mockOrdersUpdatePartner).not.toHaveBeenCalled();
    // No price-override button yet (Phase 7)
    expect(screen.queryByText(/Edit partner prices/i)).not.toBeInTheDocument();
  });

  it('pre-create: clearing back to None removes partner and ref input', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Takeaway'));
    fireEvent.click(screen.getByText('Delivery partner…'));
    await waitFor(() => {
      expect(screen.getByText('Select Delivery Partner')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('HungerStation'));
    await waitFor(() => {
      expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
    });

    // Ref input appears once a partner is set
    const refInput = screen.getByPlaceholderText('App order #');
    fireEvent.change(refInput, { target: { value: 'HS-1' } });
    fireEvent.blur(refInput);
    expect(mockOrdersUpdatePartner).not.toHaveBeenCalled();

    // Clear via picker → None
    fireEvent.click(screen.getByText('Partner: HungerStation'));
    await waitFor(() => {
      expect(screen.getByText('Select Delivery Partner')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('None'));
    await waitFor(() => {
      expect(screen.getByText('Delivery partner…')).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText('App order #')).not.toBeInTheDocument();
  });

  it('pre-create: external ref is staged locally, no API call on blur', async () => {
    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Takeaway'));
    fireEvent.click(screen.getByText('Delivery partner…'));
    await waitFor(() => {
      expect(screen.getByText('Select Delivery Partner')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Keeta'));

    await waitFor(() => {
      expect(screen.getByText('Partner: Keeta')).toBeInTheDocument();
    });

    const refInput = screen.getByPlaceholderText('App order #');
    fireEvent.change(refInput, { target: { value: 'K-7788' } });
    fireEvent.blur(refInput);

    expect(mockOrdersUpdatePartner).not.toHaveBeenCalled();
  });

  // ── Create with staged partner: create → get → sync → PATCH partner ──

  it('create with staged partner PATCHes partner after create+sync', async () => {
    mockOrdersCreate.mockResolvedValue({
      id: 20,
      orderNo: 5,
      documentId: 'INV26-0005',
      uuid: 'test',
    });
    mockOrdersGet.mockResolvedValue({
      id: 20,
      orderNo: 5,
      documentId: 'INV26-0005',
      uuid: 'test',
      type: 'takeaway',
      tableId: null,
      status: 'open',
      updatedAt: 5000,
      items: [],
      events: [],
      payments: [],
    });
    mockOrdersSyncItems.mockResolvedValue({
      id: 20,
      orderNo: 5,
      documentId: 'INV26-0005',
      type: 'takeaway',
      tableId: null,
      status: 'open',
      updatedAt: 6000,
      items: [
        {
          id: 201,
          orderId: 20,
          itemId: 1,
          itemName: 'Burger',
          unitPriceHalalas: 2300,
          vatRateBp: 1500,
          qty: 1,
          totalHalalas: 2300,
          notes: null,
          createdAt: 1000,
          updatedAt: 1000,
          createdBy: null,
          updatedBy: null,
        },
      ],
      events: [],
      payments: [],
    });
    mockOrdersUpdatePartner.mockResolvedValue(
      makeOrder({
        id: 20,
        documentId: 'INV26-0005',
        deliveryPartnerId: 'hungerstation',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-883129',
        updatedAt: 7000,
      }),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    // Takeaway + partner + ref + item
    fireEvent.click(screen.getByText('Takeaway'));
    fireEvent.click(screen.getByText('Delivery partner…'));
    await waitFor(() => {
      expect(screen.getByText('Select Delivery Partner')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('HungerStation'));
    await waitFor(() => {
      expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
    });
    const refInput = screen.getByPlaceholderText('App order #');
    fireEvent.change(refInput, { target: { value: 'HS-883129' } });
    fireEvent.blur(refInput);

    fireEvent.click(screen.getByText('Burger'));
    fireEvent.click(screen.getByText('Create Order'));

    // baseUpdatedAt must come from the sync response (6000), not the fetch (5000)
    await waitFor(() => {
      expect(mockOrdersUpdatePartner).toHaveBeenCalledWith(20, {
        baseUpdatedAt: 6000,
        deliveryPartnerId: 'hungerstation',
        deliveryExternalRef: 'HS-883129',
      });
    });

    // Panel shows the hydrated partner from the PATCH response
    await waitFor(() => {
      expect(screen.getByText('Order INV26-0005')).toBeInTheDocument();
    });
    expect(screen.getByText('HungerStation / HS-883129')).toBeInTheDocument();
    expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
  });

  it('create with staged partner but PATCH failure hydrates server truth and shows error', async () => {
    mockOrdersCreate.mockResolvedValue({
      id: 21,
      orderNo: 6,
      documentId: 'INV26-0006',
      uuid: 'test',
    });
    mockOrdersGet.mockResolvedValue({
      id: 21,
      orderNo: 6,
      documentId: 'INV26-0006',
      uuid: 'test',
      type: 'takeaway',
      tableId: null,
      status: 'open',
      updatedAt: 5000,
      items: [],
      events: [],
      payments: [],
    });
    mockOrdersSyncItems.mockResolvedValue({
      id: 21,
      orderNo: 6,
      documentId: 'INV26-0006',
      type: 'takeaway',
      tableId: null,
      status: 'open',
      updatedAt: 6000,
      items: [],
      events: [],
      payments: [],
    });
    mockOrdersUpdatePartner.mockRejectedValue(
      new Error('Delivery partner "hungerstation" is disabled'),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Takeaway'));
    fireEvent.click(screen.getByText('Delivery partner…'));
    await waitFor(() => {
      expect(screen.getByText('Select Delivery Partner')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('HungerStation'));
    await waitFor(() => {
      expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Burger'));
    fireEvent.click(screen.getByText('Create Order'));

    // Error surfaced; order still created (no partner) — panel shows no partner
    await waitFor(() => {
      expect(screen.getByText('Delivery partner "hungerstation" is disabled')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Partner:/)).not.toBeInTheDocument();
  });

  // ── Existing open order: API PATCH ──

  it('existing open takeaway order: selecting a partner PATCHes /orders/:id/partner', async () => {
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'takeaway', tableId: null }));
    mockOrdersUpdatePartner.mockResolvedValue(
      makeOrder({
        deliveryPartnerId: 'keeta',
        deliveryPartnerTitle: 'Keeta',
        deliveryExternalRef: null,
        updatedAt: 6000,
      }),
    );

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delivery partner…'));
    await waitFor(() => {
      expect(screen.getByText('Select Delivery Partner')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Keeta'));

    await waitFor(() => {
      expect(mockOrdersUpdatePartner).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          baseUpdatedAt: 5000,
          deliveryPartnerId: 'keeta',
        }),
      );
    });

    // Picker closed, hydrated from the response
    await waitFor(() => {
      expect(screen.queryByText('Select Delivery Partner')).not.toBeInTheDocument();
      expect(screen.getByText('Partner: Keeta')).toBeInTheDocument();
    });
    // No ref set → panel line shows only the title
    expect(screen.queryByText(/Keeta · Ref/)).not.toBeInTheDocument();
  });

  it('existing open order: clearing the partner PATCHes null and hides the panel partner', async () => {
    mockOrdersGet.mockResolvedValue(
      makeOrder({
        deliveryPartnerId: 'hungerstation',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-883129',
      }),
    );
    mockOrdersUpdatePartner.mockResolvedValue(
      makeOrder({
        deliveryPartnerId: null,
        deliveryPartnerTitle: null,
        deliveryExternalRef: null,
        updatedAt: 6000,
      }),
    );

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
    });
    expect(screen.getByText('HungerStation / HS-883129')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Partner: HungerStation'));
    await waitFor(() => {
      expect(screen.getByText('Select Delivery Partner')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('None'));

    await waitFor(() => {
      expect(mockOrdersUpdatePartner).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          baseUpdatedAt: 5000,
          deliveryPartnerId: null,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Delivery partner…')).toBeInTheDocument();
      expect(screen.queryByText(/HungerStation/)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('App order #')).not.toBeInTheDocument();
    });
  });

  it('existing open order: external ref edit PATCHes ref-only on blur', async () => {
    mockOrdersGet.mockResolvedValue(
      makeOrder({
        deliveryPartnerId: 'hungerstation',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-OLD',
      }),
    );
    mockOrdersUpdatePartner.mockResolvedValue(
      makeOrder({
        deliveryPartnerId: 'hungerstation',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-NEW',
        updatedAt: 6000,
      }),
    );

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
    });

    const refInput = screen.getByPlaceholderText('App order #') as HTMLInputElement;
    // The draft is synced from the cart via an effect after hydration —
    // wait for it instead of asserting the raw DOM right away (race under
    // parallel test load).
    await waitFor(() => {
      expect(refInput.value).toBe('HS-OLD');
    });

    fireEvent.change(refInput, { target: { value: 'HS-NEW' } });
    fireEvent.blur(refInput);

    await waitFor(() => {
      expect(mockOrdersUpdatePartner).toHaveBeenCalledWith(1, {
        baseUpdatedAt: 5000,
        deliveryExternalRef: 'HS-NEW',
      });
    });
  });

  it('existing open order: unchanged ref blur does not PATCH', async () => {
    mockOrdersGet.mockResolvedValue(
      makeOrder({
        deliveryPartnerId: 'hungerstation',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-OLD',
      }),
    );

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
    });

    const refInput = screen.getByPlaceholderText('App order #') as HTMLInputElement;
    // The draft is synced from the cart via an effect after hydration —
    // wait for it instead of blurring while the draft is still '' (race under
    // parallel test load would PATCH deliveryExternalRef: null).
    await waitFor(() => {
      expect(refInput.value).toBe('HS-OLD');
    });

    fireEvent.focus(refInput);
    fireEvent.blur(refInput);

    // The unchanged-ref guard in handleSaveExternalRef runs synchronously
    // before any await, so the assertion right after blur is deterministic.
    expect(mockOrdersUpdatePartner).not.toHaveBeenCalled();
  });

  // ── 409 stale: same conflict UX as type/table ──

  it('existing open order: 409 on partner PATCH refetches, hydrates and shows error', async () => {
    mockOrdersGet.mockResolvedValueOnce(
      makeOrder({ deliveryPartnerId: null, deliveryPartnerTitle: null, deliveryExternalRef: null }),
    );
    mockOrdersUpdatePartner.mockRejectedValue(
      new Error('HTTP 409 Conflict: Order was modified by another terminal'),
    );
    // Refetch after the 409 returns the remote state: partner changed to Keeta
    mockOrdersGet.mockResolvedValue(
      makeOrder({
        deliveryPartnerId: 'keeta',
        deliveryPartnerTitle: 'Keeta',
        deliveryExternalRef: 'K-REMOTE',
        updatedAt: 9000,
      }),
    );

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Delivery partner…')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delivery partner…'));
    await waitFor(() => {
      expect(screen.getByText('Select Delivery Partner')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('HungerStation'));

    await waitFor(() => {
      expect(screen.getByText(/modified by another terminal/)).toBeInTheDocument();
    });

    // Hydrated from the refetch: Keeta shows on the toggle; ref input reflects
    // the remote ref
    await waitFor(() => {
      expect(screen.getByText('Partner: Keeta')).toBeInTheDocument();
    });
    const refInput = screen.getByPlaceholderText('App order #') as HTMLInputElement;
    // Draft sync effect after hydration — wait for it (race under parallel load)
    await waitFor(() => {
      expect(refInput.value).toBe('K-REMOTE');
    });
  });

  // ── Gating ──

  it('existing open order without update_order permission: partner control disabled', async () => {
    mockMe = { ...mockMe, updateOrder: false };
    mockOrdersGet.mockResolvedValue(makeOrder({ type: 'takeaway', tableId: null }));

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    expect(screen.getByText('Delivery partner…').closest('button')).toBeDisabled();
  });

  it('existing open order with partner: dirty cart disables partner control and ref input', async () => {
    mockOrdersGet.mockResolvedValue(
      makeOrder({
        deliveryPartnerId: 'hungerstation',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-1',
      }),
    );

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
    });

    // Make the cart dirty
    fireEvent.click(screen.getAllByText('Burger')[0]);
    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });

    expect(screen.getByText('Partner: HungerStation').closest('button')).toBeDisabled();
    expect(screen.getByPlaceholderText('App order #')).toBeDisabled();
  });

  // ── takeaway → dine_in: server clears partner, UI follows the hydrate ──

  it('switching takeaway → dine_in clears the partner from the panel after hydrate', async () => {
    mockOrdersGet.mockResolvedValue(
      makeOrder({
        type: 'takeaway',
        tableId: null,
        deliveryPartnerId: 'hungerstation',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-883129',
      }),
    );
    mockOrdersUpdate.mockResolvedValue(
      makeOrder({
        type: 'dine_in',
        tableId: 2,
        deliveryPartnerId: null,
        deliveryPartnerTitle: null,
        deliveryExternalRef: null,
        updatedAt: 6000,
      }),
    );

    renderOrderPage(['/?orderId=1']);

    await waitFor(() => {
      expect(screen.getByText('Partner: HungerStation')).toBeInTheDocument();
    });

    // Switch to dine-in via the table picker (server clears partner + ref)
    fireEvent.click(screen.getByText('Dine-in'));
    await waitFor(() => {
      expect(screen.getByText('Select Table')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('T2'));

    await waitFor(() => {
      expect(screen.getByText('Table: T2')).toBeInTheDocument();
    });

    // Partner control hidden for dine_in, panel partner line gone
    expect(screen.queryByText(/Partner:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/HungerStation/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('App order #')).not.toBeInTheDocument();
  });
});
