import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MeResponse } from '@spicyhome/client-ts';
import { AdminPage } from '../pages/AdminPage';

const mockGetMe = vi.fn();

vi.mock('../api', () => ({
  getMe: () => mockGetMe(),
}));

function makeMe(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: 1,
    username: 'cashier',
    name: 'Cashier',
    roleId: 2,
    roleName: 'staff',
    isActive: true,
    createOrder: true,
    updateOrder: true,
    deleteOrderItem: true,
    voidOrder: true,
    refundOrder: true,
    payOrder: true,
    manageMenu: true,
    manageTables: false,
    managePrinters: true,
    manageUsers: false,
    manageSettings: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Promotions tile for a cashier (manage_menu) without manage_settings', () => {
    mockGetMe.mockReturnValue(makeMe());
    renderPage();

    expect(screen.getByText('Promotions')).toBeInTheDocument();
    expect(screen.queryByText('ZATCA')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment Methods')).not.toBeInTheDocument();
  });

  it('hides the Promotions tile when manage_menu is false', () => {
    mockGetMe.mockReturnValue(makeMe({ manageMenu: false }));
    renderPage();

    expect(screen.queryByText('Promotions')).not.toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
  });
});
