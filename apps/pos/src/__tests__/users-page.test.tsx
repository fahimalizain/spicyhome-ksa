import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UsersPage } from '../pages/admin/UsersPage';

const mockListUsers = vi.fn();
const mockListRoles = vi.fn();
const mockCreateUser = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock('../api', () => ({
  client: {
    auth: {
      listUsers: (...args: any[]) => mockListUsers(...args),
      listRoles: (...args: any[]) => mockListRoles(...args),
      createUser: (...args: any[]) => mockCreateUser(...args),
      updateUser: (...args: any[]) => mockUpdateUser(...args),
    },
  },
}));

const baseRole = {
  createOrder: true,
  updateOrder: true,
  deleteOrderItem: false,
  voidOrder: false,
  refundOrder: false,
  manageMenu: false,
  manageTables: false,
  managePrinters: false,
  manageUsers: false,
  manageSettings: false,
  createdAt: 1700000000,
  updatedAt: 1700000000,
};

const roleAdmin = { ...baseRole, id: 1, name: 'Admin' };
const roleStaff = { ...baseRole, id: 2, name: 'Staff' };

const baseUser = {
  isActive: true,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const userAhmed = {
  ...baseUser,
  id: 1,
  username: 'ahmed',
  name: 'Ahmed',
  roleId: 2,
  androidLogin: false,
};
const userSara = {
  ...baseUser,
  id: 2,
  username: 'sara',
  name: 'Sara',
  roleId: 1,
  androidLogin: true,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>,
  );
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListUsers.mockResolvedValue([userAhmed, userSara]);
    mockListRoles.mockResolvedValue([roleAdmin, roleStaff]);
    mockCreateUser.mockResolvedValue({ ...userSara, id: 9 });
    mockUpdateUser.mockResolvedValue({ ...userAhmed, id: 1 });
  });

  it('renders name, @username, and (no Android) hint for users without Android login; no (inactive) badge', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    expect(screen.getByText('@ahmed')).toBeInTheDocument();
    expect(screen.getByText('@sara')).toBeInTheDocument();
    // Only Ahmed has androidLogin false.
    expect(screen.getByText('(no Android)')).toBeInTheDocument();
    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
  });

  it('does not show the dialog until New User or Edit is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    expect(screen.getByText('New User')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New User' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit User' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show on Android login')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('New User'));

    expect(screen.getByRole('heading', { name: 'New User' })).toBeInTheDocument();
  });

  it('opens New User with the first role primed and Android checked; create sends full payload with default pin', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New User'));

    expect(screen.getByRole('heading', { name: 'New User' })).toBeInTheDocument();
    // First role is Admin (id 1).
    expect(screen.getByLabelText('Role')).toHaveValue('1');
    expect(screen.getByLabelText('Show on Android login')).toBeChecked();
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'khaled' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Khaled' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        username: 'khaled',
        name: 'Khaled',
        pin: '0000',
        roleId: 1,
        androidLogin: true,
      });
    });
  });

  it('sends the entered PIN on create instead of the default', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New User'));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'khaled' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Khaled' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '4321' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'khaled', name: 'Khaled', pin: '4321' }),
      );
    });
  });

  it('opens Edit User from the row with username disabled and fields populated', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Ahmed')); // row click opens edit

    expect(screen.getByRole('heading', { name: 'Edit User' })).toBeInTheDocument();
    const username = screen.getByLabelText('Username') as HTMLInputElement;
    expect(username.disabled).toBe(true);
    expect(username.value).toBe('ahmed');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ahmed');
    expect((screen.getByLabelText('PIN (leave blank to keep)') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Role')).toHaveValue('2');
    expect(screen.getByLabelText('Show on Android login')).not.toBeChecked();
  });

  it('updates without pin when PIN is left blank', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Ahmed'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit User' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ahmed Ali' } });
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    });
    const payload = mockUpdateUser.mock.calls[0][1];
    expect(payload).toEqual({
      name: 'Ahmed Ali',
      roleId: 2,
      androidLogin: false,
    });
    expect(payload).not.toHaveProperty('pin');
  });

  it('includes pin on update when PIN is filled', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Ahmed'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit User' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('PIN (leave blank to keep)'), {
      target: { value: '9999' },
    });
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith(1, {
        name: 'Ahmed',
        roleId: 2,
        androidLogin: false,
        pin: '9999',
      });
    });
  });

  it('shows a failed save error inside the dialog and stays open', async () => {
    mockCreateUser.mockRejectedValueOnce(new Error('Username already taken'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New User'));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ahmed' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ahmed' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Username already taken')).toBeInTheDocument();
    });
    // Still open, still on the same mode.
    expect(screen.getByRole('heading', { name: 'New User' })).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('Cancel closes the dialog', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New User'));
    expect(screen.getByRole('heading', { name: 'New User' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByRole('heading', { name: 'New User' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });

  it('renders a row enable checkbox for each user with an Enable/Disable aria-label', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
      expect(screen.getByText('Sara')).toBeInTheDocument();
    });

    const ahmedCheckbox = screen.getByRole('checkbox', { name: 'Disable Ahmed' });
    expect(ahmedCheckbox).toBeChecked();

    const saraCheckbox = screen.getByRole('checkbox', { name: 'Disable Sara' });
    expect(saraCheckbox).toBeChecked();

    // Still no (inactive) badge; (no Android) hint remains for Ahmed.
    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
    expect(screen.getByText('(no Android)')).toBeInTheDocument();
  });

  it('toggling the row checkbox updates isActive without opening the Edit dialog', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Ahmed' }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith(1, { isActive: false });
    });
    // The wrapper stopPropagation keeps the row click (open edit) from firing.
    expect(screen.queryByRole('heading', { name: 'Edit User' })).not.toBeInTheDocument();
    // No full-page reload: listUsers is called once (initial load only).
    expect(mockListUsers).toHaveBeenCalledTimes(1);
    // The row flips locally on success.
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Enable Ahmed' })).not.toBeChecked();
    });
    // Other rows are untouched.
    expect(screen.getByRole('checkbox', { name: 'Disable Sara' })).toBeChecked();
  });

  it('shows the Enable label when the user is inactive', async () => {
    mockListUsers.mockResolvedValue([{ ...userAhmed, isActive: false }, userSara]);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    const ahmedCheckbox = screen.getByRole('checkbox', { name: 'Enable Ahmed' });
    expect(ahmedCheckbox).not.toBeChecked();
    // Still no (inactive) badge.
    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
  });

  it('shows the toggle error in the page error banner and keeps the dialog closed', async () => {
    mockUpdateUser.mockRejectedValueOnce(new Error('Cannot disable user'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Ahmed' }));

    await waitFor(() => {
      expect(screen.getByText('Cannot disable user')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Edit User' })).not.toBeInTheDocument();
    // No flip on error: Ahmed stays active (checked) with its Disable label.
    expect(screen.getByRole('checkbox', { name: 'Disable Ahmed' })).toBeChecked();
    // Still no reload.
    expect(mockListUsers).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('grays out only the in-flight row while the toggle is pending', async () => {
    let resolveUpdate!: (value: unknown) => void;
    mockUpdateUser.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Ahmed' }));

    // No full-page loading flash; only the row is marked busy.
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.getByText('Ahmed').closest('[aria-busy="true"]')).not.toBeNull();
    const busyRow = screen.getByText('Ahmed').closest('[aria-busy="true"]')!;
    expect(busyRow.className).toContain('opacity-50');
    // Sara is not busy.
    expect(screen.getByText('Sara').closest('[aria-busy="true"]')).toBeNull();

    resolveUpdate({});
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Enable Ahmed' })).not.toBeChecked();
    });
    expect(screen.getByText('Ahmed').closest('[aria-busy="true"]')).toBeNull();
  });
});
