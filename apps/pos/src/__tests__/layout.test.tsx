import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '../components/Layout';
import type { MeResponse } from '@spicyhome/client-ts';

const { mockClearToken, mockRealtimeDisconnect } = vi.hoisted(() => ({
  mockClearToken: vi.fn(),
  mockRealtimeDisconnect: vi.fn(),
}));

// Mutable per-test user; read lazily by the mocked getMe().
let me: MeResponse | null = null;

vi.mock('../api', () => ({
  client: { auth: { me: vi.fn() } },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: mockClearToken,
  getToken: vi.fn(() => 'test-token'),
  getMe: () => me,
  isAuthenticated: () => true,
}));

vi.mock('../realtime', () => ({
  realtime: {
    setToken: vi.fn(),
    connect: vi.fn(),
    disconnect: mockRealtimeDisconnect,
    subscribe: vi.fn(() => vi.fn()),
    onReconnect: vi.fn(),
    offReconnect: vi.fn(),
  },
}));

const adminMe: MeResponse = {
  id: 1,
  username: 'admin',
  name: 'Admin User',
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

const cashierMe: MeResponse = {
  ...adminMe,
  id: 2,
  username: 'cashier1',
  name: 'Cashier User',
  manageMenu: false,
};

const mockReload = vi.fn();

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>Home Content</div>} />
          <Route path="/day" element={<div>Day Page</div>} />
          <Route path="/orders" element={<div>Orders Page</div>} />
          <Route path="/tables" element={<div>Tables Page</div>} />
          <Route path="/admin" element={<div>Admin Page</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    me = adminMe;
    // jsdom's location.reload cannot be spied; replace location with a stub
    // (same pattern as sentry-error-fallback.test.tsx).
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: mockReload },
    });
  });

  it('renders left nav links and hides Admin/Logout when the menu is closed', () => {
    renderLayout();

    expect(screen.getByRole('link', { name: 'Order' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Day' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tables' })).toBeInTheDocument();

    // Admin is not a left-nav link even with manageMenu — it lives in the user menu.
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    // No standalone Logout button.
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });

  it('opens the user menu on trigger click with proper aria attributes', () => {
    renderLayout();

    const trigger = screen.getByRole('button', { name: /Admin User/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument();
  });

  it('closes the menu when the trigger is clicked again', () => {
    renderLayout();

    const trigger = screen.getByRole('button', { name: /Admin User/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows Admin in the user menu when manageMenu is true', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /Admin User/ }));

    expect(screen.getByRole('menuitem', { name: 'Admin' })).toBeInTheDocument();
  });

  it('does not show Admin in the user menu when manageMenu is false', () => {
    me = cashierMe;
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /Cashier User/ }));

    expect(screen.queryByRole('menuitem', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument();
  });

  it('navigates to /admin from the menu and closes it', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /Admin User/ }));
    const adminItem = screen.getByRole('menuitem', { name: 'Admin' });
    // Rendered as a real link so middle-click/open-in-new-tab works.
    expect(adminItem).toHaveAttribute('href', '/admin');

    fireEvent.click(adminItem);

    expect(screen.getByText('Admin Page')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('logs out: disconnects realtime, clears token, and navigates to login', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /Admin User/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));

    expect(mockRealtimeDisconnect).toHaveBeenCalled();
    expect(mockClearToken).toHaveBeenCalled();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('reloads the window and closes the menu on Refresh', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /Admin User/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh' }));

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /Admin User/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('closes the menu on outside click', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /Admin User/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });
});
