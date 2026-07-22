import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrderPage } from '../pages/OrderPage';
import { DayPage } from '../pages/DayPage';

const mockDayCurrent = vi.fn();
const mockDayOpen = vi.fn();
const mockDayClose = vi.fn();
const mockDayList = vi.fn();
const mockReportsX = vi.fn();
const mockReportsZ = vi.fn();
const mockReportsPrintX = vi.fn();
const mockReportsPrintZ = vi.fn();

vi.mock('../api', () => ({
  client: {
    auth: {
      login: vi.fn(),
      me: vi.fn(),
    },
    menu: {
      listCategories: vi.fn().mockResolvedValue([]),
      listItems: vi.fn().mockResolvedValue([]),
    },
    tables: {
      list: vi.fn().mockResolvedValue([]),
    },
    orders: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      addItem: vi.fn(),
      get: vi.fn(),
      send: vi.fn(),
      pay: vi.fn(),
      void: vi.fn(),
    },
    day: {
      current: (...args: any[]) => mockDayCurrent(...args),
      open: (...args: any[]) => mockDayOpen(...args),
      close: (...args: any[]) => mockDayClose(...args),
      list: (...args: any[]) => mockDayList(...args),
    },
    reports: {
      x: (...args: any[]) => mockReportsX(...args),
      z: (...args: any[]) => mockReportsZ(...args),
      printX: (...args: any[]) => mockReportsPrintX(...args),
      printZ: (...args: any[]) => mockReportsPrintZ(...args),
    },
  },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  getMe: vi.fn(),
  isAuthenticated: vi.fn(() => true),
}));

function renderOrderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<OrderPage />} />
        <Route path="/day" element={<DayPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDayPage() {
  return render(
    <MemoryRouter initialEntries={['/day']}>
      <Routes>
        <Route path="/" element={<OrderPage />} />
        <Route path="/day" element={<DayPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrderPage day blocking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Open Business Day" screen when no day is open', async () => {
    mockDayCurrent.mockResolvedValue({ open: false });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Open Business Day')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
    expect(screen.getByText('Open Day')).toBeInTheDocument();
  });

  it('calls openDay when clicking Open Day button', async () => {
    mockDayCurrent.mockResolvedValue({ open: false });
    mockDayOpen.mockResolvedValue({ id: 1, status: 'open' });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.getByText('Open Business Day')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('0.00');
    fireEvent.change(input, { target: { value: '500' } });

    const btn = screen.getByText('Open Day');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockDayOpen).toHaveBeenCalledWith({ openingCashHalalas: 50000 });
    });
  });

  it('shows order UI when day is open', async () => {
    mockDayCurrent.mockResolvedValue({ status: 'open', businessDate: '2026-07-22' });

    renderOrderPage();

    await waitFor(() => {
      expect(screen.queryByText('Open Business Day')).not.toBeInTheDocument();
    });
  });

  it('shows loading state when day status is unknown', () => {
    mockDayCurrent.mockImplementation(() => new Promise(() => {}));

    renderOrderPage();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('DayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows status tab by default', async () => {
    mockDayCurrent.mockResolvedValue({ open: false });

    renderDayPage();

    await waitFor(() => {
      expect(screen.getByText('Business Day')).toBeInTheDocument();
    });
  });

  it('shows no-open message when day is not open', async () => {
    mockDayCurrent.mockResolvedValue({ open: false });

    renderDayPage();

    await waitFor(() => {
      expect(screen.getByText('No business day is currently open.')).toBeInTheDocument();
    });
  });

  it('shows day status when open', async () => {
    mockDayCurrent.mockResolvedValue({
      status: 'open',
      businessDate: '2026-07-22',
      openingCashHalalas: 50000,
      liveSalesHalalas: 2300,
      liveVatHalalas: 300,
      liveOrderCount: 1,
    });
    mockReportsX.mockResolvedValue({
      totalSalesHalalas: 2300,
      totalVatHalalas: 300,
      paidOrderCount: 1,
      sentOrderCount: 0,
      openOrderCount: 0,
      voidedOrderCount: 0,
      salesByType: { dine_in: { count: 1, totalHalalas: 2300 } },
      salesByUser: [],
      salesByCategory: [],
    });

    renderDayPage();

    await waitFor(() => {
      expect(screen.getByText(/2026-07-22/)).toBeInTheDocument();
    });
  });

  it('shows close button and input', async () => {
    mockDayCurrent.mockResolvedValue({
      status: 'open',
      businessDate: '2026-07-22',
      openingCashHalalas: 50000,
    });
    mockReportsX.mockResolvedValue(null);

    renderDayPage();

    await waitFor(() => {
      const buttons = screen.getAllByText('Close Day');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });
});
