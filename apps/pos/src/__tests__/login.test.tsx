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
    mockListUsernames.mockResolvedValue({ usernames: ['admin', 'cashier'] });
  });

  it('renders login form with heading', () => {
    renderLogin();
    expect(screen.getByAltText('SpicyHome')).toBeInTheDocument();
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
    expect(screen.getByText('cashier')).toBeInTheDocument();
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

  it('does not auto-login after 4 digits — Login button required', async () => {
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

    await new Promise((r) => setTimeout(r, 100));
    expect(mockLogin).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'admin', pin: '1234' });
    });
  });

  it('accepts a 6-digit PIN', async () => {
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

    fireEvent.click(screen.getByText('7'));
    fireEvent.click(screen.getByText('7'));
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'admin', pin: '771133' });
    });
  });

  it('accepts a 1-digit PIN via Login button', async () => {
    mockLogin.mockResolvedValue({ accessToken: 'test-token' });
    mockMe.mockResolvedValue({
      id: 2,
      username: 'cashier',
      name: 'Cashier',
      roleName: 'staff',
      manageMenu: false,
      manageUsers: false,
      createOrder: true,
      updateOrder: true,
      deleteOrderItem: false,
      voidOrder: false,
      refundOrder: false,
      payOrder: false,
      manageTables: false,
      managePrinters: false,
      manageSettings: false,
      roleId: 2,
      isActive: true,
    });

    renderLogin();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('Select user');
    await userEvent.selectOptions(select, 'cashier');

    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'cashier', pin: '1' });
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
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('renders app version from VITE_APP_VERSION', async () => {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });
    // Version is defined via vite.config.ts define. In Bazel test sandbox the
    // VERSION file may not be found, so the fallback is "0.0.0". Accept any
    // version-like string after the "v" prefix.
    const versionEl = screen.getByText(/^v(\d{6}\.\d{2}\.\d+|0\.0\.0)$/);
    expect(versionEl).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      const digitBtn = screen.getByText('1');
      expect(digitBtn).toBeDisabled();
    });
  });
});

describe('LoginPage keyboard input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListUsernames.mockResolvedValue({ usernames: ['admin', 'cashier'] });
  });

  async function renderWithSelect() {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select user')).toBeInTheDocument();
    });
  }

  function countFilledDots() {
    return document.querySelectorAll('.border-brand-500').length;
  }

  it('appends PIN digits from the physical keyboard', async () => {
    await renderWithSelect();

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: '3' });

    expect(countFilledDots()).toBe(3);
  });

  it('respects the 6-digit PIN limit from the keyboard', async () => {
    await renderWithSelect();

    for (const key of ['1', '2', '3', '4', '5', '6', '7']) {
      fireEvent.keyDown(window, { key });
    }

    expect(countFilledDots()).toBe(6);
  });

  it('removes the last digit on Backspace', async () => {
    await renderWithSelect();

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: 'Backspace' });

    expect(countFilledDots()).toBe(1);
  });

  it('removes the last digit on Delete', async () => {
    await renderWithSelect();

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(countFilledDots()).toBe(1);
  });

  it('clears the PIN on Escape', async () => {
    await renderWithSelect();

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(countFilledDots()).toBe(0);
  });

  it('logs in on Enter when username and PIN are ready', async () => {
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

    await renderWithSelect();
    const select = screen.getByDisplayValue('Select user');
    await userEvent.selectOptions(select, 'admin');

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: '3' });
    fireEvent.keyDown(window, { key: '4' });
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'admin', pin: '1234' });
    });
  });

  it('does not login on Enter when PIN is empty', async () => {
    await renderWithSelect();
    const select = screen.getByDisplayValue('Select user');
    await userEvent.selectOptions(select, 'admin');

    fireEvent.keyDown(window, { key: 'Enter' });

    await new Promise((r) => setTimeout(r, 100));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('ignores digit keys while typing the username in the free-text input', async () => {
    mockListUsernames.mockResolvedValue({ usernames: [] });
    renderLogin();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    });

    const usernameInput = screen.getByPlaceholderText('Enter username');
    usernameInput.focus();
    expect(document.activeElement).toBe(usernameInput);

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '2' });

    expect(countFilledDots()).toBe(0);
  });

  it('ignores keyboard input while logging in', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}));

    await renderWithSelect();
    const select = screen.getByDisplayValue('Select user');
    await userEvent.selectOptions(select, 'admin');

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });

    fireEvent.keyDown(window, { key: '2' });

    expect(countFilledDots()).toBe(1);
  });
});
