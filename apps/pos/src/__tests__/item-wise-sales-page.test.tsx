import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getServiceDayString } from '@spicyhome/shared';
import { ItemWiseSalesPage } from '../pages/ItemWiseSalesPage';
import type { ItemWiseSalesResponse } from '@spicyhome/client-ts';

const mockItemWise = vi.fn();

vi.mock('../api', () => ({
  client: {
    reports: {
      itemWise: (...args: any[]) => mockItemWise(...args),
    },
    deliveryPartners: {
      list: vi.fn().mockResolvedValue([]),
    },
    menu: {
      listCategories: vi.fn().mockResolvedValue([
        { id: 1, name: 'Burgers', sortOrder: 0, printerId: null, isActive: true },
        { id: 2, name: 'Sides', sortOrder: 1, printerId: null, isActive: true },
      ]),
    },
  },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  getMe: vi.fn(() => null),
  isAuthenticated: vi.fn(() => true),
}));

function itemWiseResponse(): ItemWiseSalesResponse {
  return {
    rows: [
      {
        itemId: 1,
        itemName: 'Zinger',
        categoryId: 1,
        categoryName: 'Burgers',
        qtySold: 3,
        grossHalalas: 6900,
        refundedQty: 1,
        refundedHalalas: 2300,
        netQty: 2,
        netHalalas: 4600,
        vatHalalas: 600,
      },
    ],
    footer: {
      qtySold: 3,
      grossHalalas: 6900,
      refundedQty: 1,
      refundedHalalas: 2300,
      netQty: 2,
      netHalalas: 4600,
      vatHalalas: 600,
    },
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reports/item-wise']}>
      <ItemWiseSalesPage />
    </MemoryRouter>,
  );
}

describe('ItemWiseSalesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls itemWise with the current service day as from and to on mount', async () => {
    mockItemWise.mockResolvedValue(itemWiseResponse());
    const today = getServiceDayString(Date.now());

    renderPage();

    await waitFor(() => {
      expect(mockItemWise).toHaveBeenCalledWith({
        from: today,
        to: today,
        type: undefined,
        partner: undefined,
        category: undefined,
      });
    });
  });

  it('renders item name, category, quantities and net amounts', async () => {
    mockItemWise.mockResolvedValue(itemWiseResponse());

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Zinger')).toBeInTheDocument();
      // Category cell — the Category filter option also says "Burgers".
      expect(screen.getAllByText('Burgers').length).toBeGreaterThanOrEqual(1);
    });

    // Gross / net / VAT appear in both the row and the footer.
    expect(screen.getAllByLabelText('SAR 69.00').length).toBeGreaterThanOrEqual(1); // gross
    expect(screen.getAllByLabelText('SAR 23.00').length).toBeGreaterThanOrEqual(1); // refunded
    expect(screen.getAllByLabelText('SAR 46.00').length).toBeGreaterThanOrEqual(1); // net
    expect(screen.getAllByLabelText('SAR 6.00').length).toBeGreaterThanOrEqual(1); // VAT
    // Footer comes from the API footer, not client-side sums.
    expect(screen.getByText('Totals')).toBeInTheDocument();
  });

  it('sends category none when Uncategorized is picked', async () => {
    mockItemWise.mockResolvedValue(itemWiseResponse());
    const today = getServiceDayString(Date.now());

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Category')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'none' } });

    await waitFor(() => {
      expect(mockItemWise).toHaveBeenLastCalledWith({
        from: today,
        to: today,
        type: undefined,
        partner: undefined,
        category: 'none',
      });
    });
  });

  it('lists menu categories as Category options', async () => {
    mockItemWise.mockResolvedValue(itemWiseResponse());

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Category')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Category') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['', 'none', '1', '2']);
  });
});
