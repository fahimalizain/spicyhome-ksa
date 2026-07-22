import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';

const mockLogin = vi.fn();
const mockMe = vi.fn();

vi.mock('../api', () => ({
  client: {
    auth: {
      login: (...args: any[]) => mockLogin(...args),
      me: (...args: any[]) => mockMe(...args),
    },
  },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(() => null),
  getMe: vi.fn(() => null),
  isAuthenticated: vi.fn(() => false),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

function renderLogin() {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    expect(screen.getByText('SpicyHome POS')).toBeInTheDocument();
  });

  it('shows PIN dots as user types', () => {
    renderLogin();
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));

    const pinDots = document.querySelectorAll('.w-12.h-12');
    const filledDots = document.querySelectorAll('.border-brand-500');
    expect(filledDots).toHaveLength(3);
  });

  it('clears PIN on clear button', () => {
    renderLogin();
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('Clear'));
    const filledDots = document.querySelectorAll('.border-brand-500');
    expect(filledDots).toHaveLength(0);
  });

  it('deletes last PIN digit', () => {
    renderLogin();
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('⌫'));
    const filledDots = document.querySelectorAll('.border-brand-500');
    expect(filledDots).toHaveLength(1);
  });

  it('calls login with correct credentials', async () => {
    mockLogin.mockResolvedValue({ accessToken: 'test-token' });
    mockMe.mockResolvedValue({
      id: 1, username: 'admin', name: 'Admin', roleName: 'admin',
      manageMenu: true, manageUsers: true, createOrder: true, updateOrder: true,
      deleteOrderItem: false, voidOrder: false, refundOrder: false,
      manageTables: false, managePrinters: false, manageSettings: false,
      roleId: 1, isActive: true,
    });

    renderLogin();

    const usernameInput = screen.getByPlaceholderText('Enter username');
    await userEvent.type(usernameInput, 'admin');

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByText('4'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'admin', pin: '1234' });
    });
  });

  it('shows error on failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid'));

    renderLogin();

    const usernameInput = screen.getByPlaceholderText('Enter username');
    await userEvent.type(usernameInput, 'wrong');

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByText('4'));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('disables digits during loading', async () => {
    mockLogin.mockImplementation(
      () => new Promise(() => {}),
    );

    renderLogin();
    const usernameInput = screen.getByPlaceholderText('Enter username');
    await userEvent.type(usernameInput, 'admin');

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByText('4'));

    await waitFor(() => {
      const digitBtn = screen.getByText('1');
      expect(digitBtn).toBeDisabled();
    });
  });
});
