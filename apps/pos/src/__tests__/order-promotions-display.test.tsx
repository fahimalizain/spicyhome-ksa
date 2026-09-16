import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderPage } from '../pages/OrderPage';
import { RefundPanel } from '../components/RefundPanel';

// Mock API client (same shape as order-page-tabs.test.tsx)
const mockDayCurrent = vi.fn();
const mockListCategories = vi.fn();
const mockListSubcategories = vi.fn();
const mockListItems = vi.fn();
const mockTablesList = vi.fn();
const mockOrdersGet = vi.fn();
const mockPaymentMethodsListEnabled = vi.fn();
const mockGetMe = vi.fn();
const mockListActiveUsers = vi.fn();
const mockRefund = vi.fn();
const mockGetRefunds = vi.fn();

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
      listSubcategories: (...args: any[]) => mockListSubcategories(...args),
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
      syncItems: vi.fn(),
      sendToKitchen: vi.fn(),
      addPayment: vi.fn(),
      submit: vi.fn(),
      updateStandardInvoice: vi.fn(),
      void: vi.fn(),
      refund: (...args: any[]) => mockRefund(...args),
      getRefunds: (...args: any[]) => mockGetRefunds(...args),
      getEvents: vi.fn(),
      verifyEvents: vi.fn(),
      reprint: vi.fn(),
      getZatcaInvoice: vi.fn(),
      getZatcaCreditNote: vi.fn(),
      retryZatcaCreditNoteClearance: vi.fn(),
      reissueZatcaCreditNote: vi.fn(),
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
  { id: 1, name: 'Mains', sortOrder: 0, isActive: true, createdAt: 0, updatedAt: 0 },
];

const subcategories = [
  {
    id: 1,
    categoryId: 1,
    name: 'Rice',
    sortOrder: 0,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: null,
    updatedBy: null,
  },
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

const tables = [{ id: 1, name: 'T1', isActive: true, createdAt: 1000, updatedAt: 1000 }];

// Server-stamped Promotion snapshot: gross 100.00, Discount 10.00,
// payable 90.00. Post-Allowance VAT = decompose(9000 @ 15%) = 1174.
function makePromoOrderItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 901,
    orderId: 9,
    itemId: 1,
    itemName: 'Kabsa',
    unitPriceHalalas: 5000,
    vatRateBp: 1500,
    qty: 1,
    totalHalalas: 5000,
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makePromoOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    orderNo: 43,
    documentId: 'INV26-0043',
    uuid: 'promo-uuid',
    type: 'dine_in',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 8696,
    vatHalalas: 1304,
    totalHalalas: 10000,
    discountHalalas: 1000,
    promotionId: 7,
    promotionName: 'National Day',
    promotionNameAr: 'اليوم الوطني',
    promotionPercentBp: 1000,
    isStandardInvoice: false,
    zatcaBuyerDetails: null,
    deliveryPartnerId: null,
    deliveryPartnerTitle: null,
    deliveryExternalRef: null,
    notes: null,
    createdAt: 1000,
    updatedAt: 5000,
    createdBy: null,
    updatedBy: null,
    items: [
      makePromoOrderItem({ itemId: 11 }),
      makePromoOrderItem({ id: 902, itemId: 12, itemName: 'Foul' }),
    ],
    events: [],
    payments: [],
    ...overrides,
  };
}

function makePlainOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orderNo: 42,
    documentId: 'INV26-0042',
    uuid: 'plain-uuid',
    type: 'dine_in',
    tableId: null,
    dayOpeningId: 1,
    status: 'open',
    subtotalHalalas: 4000,
    vatHalalas: 600,
    totalHalalas: 4600,
    discountHalalas: 0,
    promotionId: null,
    promotionName: null,
    promotionNameAr: null,
    promotionPercentBp: null,
    isStandardInvoice: false,
    zatcaBuyerDetails: null,
    deliveryPartnerId: null,
    deliveryPartnerTitle: null,
    deliveryExternalRef: null,
    notes: null,
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
        qty: 2,
        totalHalalas: 4600,
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

function renderOrderPage(initialEntries: string[] = ['/?orderId=9']) {
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
  mockListSubcategories.mockResolvedValue(subcategories);
  mockListItems.mockResolvedValue(items);
  mockTablesList.mockResolvedValue(tables);
}

describe('OrderPage — Promotion Discount display (slice 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListActiveUsers.mockResolvedValue([]);
    mockGetMe.mockReturnValue(makeMe());
    mockDayIsOpen();
    mockPaymentMethodsListEnabled.mockResolvedValue([
      { id: 'cash', title: 'Cash' },
      { id: 'card', title: 'Card' },
    ]);
    mockGetRefunds.mockResolvedValue([]);
  });

  it('summary shows the stamped Promotion line and payable; outstanding uses payable', async () => {
    mockOrdersGet.mockResolvedValue(Promise.resolve(makePromoOrder()));

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0043')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    await waitFor(() => {
      expect(screen.getByText('National Day 10%')).toBeInTheDocument();
    });
    // Server Discount (never recomputed client-side)
    expect(screen.getByText('−10.00 SAR')).toBeInTheDocument();
    // Gross total stays visible…
    expect(screen.getByText('100.00 SAR')).toBeInTheDocument();
    // …with post-Allowance VAT (1174, not the line-sum 1304)
    expect(screen.getByText('11.74 SAR')).toBeInTheDocument();
    expect(screen.queryByText('13.04 SAR')).not.toBeInTheDocument();
    // Payable + outstanding both 90.00 (no payments yet)
    expect(screen.getByText('Payable')).toBeInTheDocument();
    expect(screen.getAllByText('90.00 SAR').length).toBeGreaterThanOrEqual(2);
  });

  it('outstanding nets payments against payable, not gross', async () => {
    mockOrdersGet.mockResolvedValue(
      Promise.resolve(
        makePromoOrder({
          payments: [
            {
              id: 1,
              methodId: 'cash',
              methodTitle: 'Cash',
              zatcaPaymentMeansCode: '10',
              amountHalalas: 4000,
              tenderedHalalas: 4000,
              changeHalalas: 0,
              createdAt: 5000,
            },
          ],
        }),
      ),
    );

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0043')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    // 9000 payable − 4000 paid = 5000 outstanding (gross would give 6000)
    await waitFor(() => {
      expect(screen.getByText('National Day 10%')).toBeInTheDocument();
    });
    expect(screen.getByText('50.00 SAR')).toBeInTheDocument();
    expect(screen.queryByText('60.00 SAR')).not.toBeInTheDocument();
  });

  it('cart footer shows payable after hydrate, not gross', async () => {
    mockOrdersGet.mockResolvedValue(Promise.resolve(makePromoOrder()));

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0043')).toBeInTheDocument();
    });

    // Items tab footer: payable 90.00, never the 100.00 gross
    expect(screen.getByText('90.00 SAR')).toBeInTheDocument();
    expect(screen.queryByText('100.00 SAR')).not.toBeInTheDocument();
  });

  it('dirty cart keeps the local item sum in the footer', async () => {
    mockOrdersGet.mockResolvedValue(Promise.resolve(makePromoOrder()));

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0043')).toBeInTheDocument();
    });

    // +1 Burger dirties the cart: footer falls back to the local item sum
    // (10000 server lines + 2300 local = 123.00), no Promotion math applied.
    fireEvent.click(screen.getByText('Burger'));
    await waitFor(() => {
      expect(screen.getByText('Unsent changes')).toBeInTheDocument();
    });
    expect(screen.getByText('123.00 SAR')).toBeInTheDocument();
    expect(screen.queryByText('90.00 SAR')).not.toBeInTheDocument();
  });

  it('pre-create footer still shows the item sum', async () => {
    renderOrderPage(['/']);

    await waitFor(() => {
      expect(screen.getByText('Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Burger'));

    // The cart line and the footer Total row both show 23.00 — assert the
    // footer row specifically so the pre-create item sum is pinned.
    await waitFor(() => {
      expect(screen.getAllByText('23.00 SAR').length).toBeGreaterThanOrEqual(2);
    });
    const footerTotal = screen.getByText('Total').closest('div');
    expect(footerTotal?.textContent).toContain('23.00 SAR');
    expect(screen.queryByText('Payable')).not.toBeInTheDocument();
  });

  it('summary hides Promotion + Payable when no Promotion is stamped', async () => {
    mockOrdersGet.mockResolvedValue(Promise.resolve(makePlainOrder()));
    render(
      <MemoryRouter initialEntries={['/?orderId=1']}>
        <Routes>
          <Route path="/" element={<OrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Summary'));

    // Total and Outstanding agree at 46.00 with no payments and no Promotion
    await waitFor(() => {
      expect(screen.getAllByText('46.00 SAR').length).toBe(2);
    });
    expect(screen.queryByText('Payable')).not.toBeInTheDocument();
    expect(screen.queryByText(/National Day/)).not.toBeInTheDocument();
    // Line-sum VAT passes through untouched when there is no Discount
    expect(screen.getByText('6.00 SAR')).toBeInTheDocument();
  });
});

describe('RefundPanel — stamped Discount preview (slice 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRefunds.mockResolvedValue([]);
    mockPaymentMethodsListEnabled.mockResolvedValue([
      { id: 'cash', title: 'Cash', enabled: true, sortOrder: 0 },
    ]);
  });

  function promoRefundOrder() {
    return {
      ...makePromoOrder(),
      status: 'paid',
    };
  }

  it('selecting every line previews the exact payable', async () => {
    render(
      <RefundPanel order={promoRefundOrder() as any} onClose={vi.fn()} onRefunded={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Refund for Order INV26-0043')).toBeInTheDocument();
    });

    const plusButtons = screen.getAllByText('+');
    fireEvent.click(plusButtons[0]);
    fireEvent.click(plusButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('Refund Total')).toBeInTheDocument();
      expect(screen.getByText('90.00 SAR')).toBeInTheDocument();
    });
    expect(screen.queryByText('100.00 SAR')).not.toBeInTheDocument();
  });

  it('a partial selection previews gross minus a pro-rata Discount share', async () => {
    render(
      <RefundPanel order={promoRefundOrder() as any} onClose={vi.fn()} onRefunded={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Refund for Order INV26-0043')).toBeInTheDocument();
    });

    // One of two equal 50.00 lines: 5000 − round(1000 × 5000 / 10000) = 4500
    fireEvent.click(screen.getAllByText('+')[0]);

    await waitFor(() => {
      expect(screen.getByText('Refund Total')).toBeInTheDocument();
      expect(screen.getByText('45.00 SAR')).toBeInTheDocument();
    });
  });

  it('an order without a Promotion previews the plain gross', async () => {
    render(
      <RefundPanel
        order={{ ...makePlainOrder(), status: 'paid' } as any}
        onClose={vi.fn()}
        onRefunded={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Refund for Order INV26-0042')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('+')[0]);

    await waitFor(() => {
      expect(screen.getByText('Refund Total')).toBeInTheDocument();
      expect(screen.getByText('23.00 SAR')).toBeInTheDocument();
    });
  });
});
