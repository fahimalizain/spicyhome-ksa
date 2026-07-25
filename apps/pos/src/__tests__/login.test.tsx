import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';

const mockLogin = vi.fn();
const mockMe = vi.fn();
const mockListUsernames = vi.fn();

vi.mock('../api', () => ({
  client: {
    auth: {
      login: (...args: any[]) => mockLogin(...args),
      me: (...args: any[]) => mockMe(...args),
      listUsernames: () => mockListUsernames(),
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
    mockListUsernames.mockResolvedValue({ usernames: ['admin', 'cashier1'] });
  });

  it('renders login form with heading', () => {
    renderLogin();
    expect(screen.getByText('SpicyHome POS')).toBeInTheDocument();
  });

  it('shows loading state while fetching usernames', () => {
    mockListUsernames.mockImplementation(() => new Promise(() => {}));
    renderLogin();
    expect(screen.getByText('Loading users...')).toBeInTheDocument();
  });

  it('renders select dropdown when usernames are loaded', async () => {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('cashier1')).toBeInTheDocument();
  });

  it('falls back to text input when listUsernames fails', async () => {
    mockListUsernames.mockRejectedValue(new Error('Network error'));
    renderLogin();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    });
  });

  it('falls back to text input when usernames list is empty', async () => {
    mockListUsernames.mockResolvedValue({ usernames: [] });
    renderLogin();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    });
  });

  it('shows PIN dots as user types', async () => {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));

    const filledDots = document.querySelectorAll('.border-brand-500');
    expect(filledDots).toHaveLength(3);
  });

  it('clears PIN on clear button', async () => {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('Clear'));
    const filledDots = document.querySelectorAll('.border-brand-500');
    expect(filledDots).toHaveLength(0);
  });

  it('deletes last PIN digit', async () => {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('⌫'));
    const filledDots = document.querySelectorAll('.border-brand-500');
    expect(filledDots).toHaveLength(1);
  });

  it('calls login via select dropdown with correct credentials', async () => {
    mockLogin.mockResolvedValue({ accessToken: 'test-token' });
    mockMe.mockResolvedValue({
      id: 1,
      username: 'admin',
      name: 'Admin',
      roleName: 'admin',
      manageMenu: true,
      manageUsers: true,
      createOrder: true,
      updateOrder: true,
      deleteOrderItem: false,
      voidOrder: false,
      refundOrder: false,
      payOrder: false,
      manageTables: false,
      managePrinters: false,
      manageSettings: false,
      roleId: 1,
      isActive: true,
    });

    renderLogin();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('Select user');
    await userEvent.selectOptions(select, 'admin');

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByText('4'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'admin', pin: '1234' });
    });
  });

  it('calls login via text input fallback with correct credentials', async () => {
    mockListUsernames.mockRejectedValue(new Error('Network error'));
    mockLogin.mockResolvedValue({ accessToken: 'test-token' });
    mockMe.mockResolvedValue({
      id: 1,
      username: 'admin',
      name: 'Admin',
      roleName: 'admin',
      manageMenu: true,
      manageUsers: true,
      createOrder: true,
      updateOrder: true,
      deleteOrderItem: false,
      voidOrder: false,
      refundOrder: false,
      payOrder: false,
      manageTables: false,
      managePrinters: false,
      manageSettings: false,
      roleId: 1,
      isActive: true,
    });

    renderLogin();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    });

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
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('Select user');
    await userEvent.selectOptions(select, 'admin');

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByText('4'));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('disables digits during loading', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}));

    renderLogin();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('Select user');
    await userEvent.selectOptions(select, 'admin');

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
