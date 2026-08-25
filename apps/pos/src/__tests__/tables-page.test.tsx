import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TablesPage } from '../pages/admin/TablesPage';

const mockListTables = vi.fn();
const mockCreateTable = vi.fn();
const mockUpdateTable = vi.fn();

vi.mock('../api', () => ({
  client: {
    tables: {
      list: (...args: any[]) => mockListTables(...args),
      create: (...args: any[]) => mockCreateTable(...args),
      update: (...args: any[]) => mockUpdateTable(...args),
    },
  },
}));

const baseTable = {
  sortOrder: 0,
  isActive: true,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const tableT1 = { ...baseTable, id: 1, name: 'T1' };
const tableT2 = { ...baseTable, id: 2, name: 'T2', sortOrder: 1, isActive: false };

function renderPage() {
  return render(
    <MemoryRouter>
      <TablesPage />
    </MemoryRouter>,
  );
}

describe('TablesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListTables.mockResolvedValue([tableT1, tableT2]);
    mockCreateTable.mockResolvedValue({ ...tableT1, id: 9 });
    mockUpdateTable.mockResolvedValue({ ...tableT1, id: 1 });
  });

  it('renders table names after load', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument();
      expect(screen.getByText('T2')).toBeInTheDocument();
    });
  });

  it('does not show the dialog until New Table is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Tables')).toBeInTheDocument();
    });

    expect(screen.getByText('New Table')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New Table' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit Table' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('New Table'));

    expect(screen.getByRole('heading', { name: 'New Table' })).toBeInTheDocument();
  });

  it('opens New Table with Active checked and creates with the full payload', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Tables')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Table'));

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Active')).toBeChecked();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'T9' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateTable).toHaveBeenCalledWith({
        name: 'T9',
        sortOrder: 0,
        isActive: true,
      });
    });
  });

  it('opens Edit Table from the row with name populated and Active reflecting the row', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('T2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('T2')); // row click opens edit

    expect(screen.getByRole('heading', { name: 'Edit Table' })).toBeInTheDocument();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('T2');
    expect(screen.getByLabelText('Active')).not.toBeChecked();
  });

  it('updates with the full payload including isActive', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('T2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('T2'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Table' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'T2 Corner' } });
    fireEvent.click(screen.getByLabelText('Active')); // re-activate
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdateTable).toHaveBeenCalledWith(2, {
        name: 'T2 Corner',
        sortOrder: 1,
        isActive: true,
      });
    });
  });

  it('shows a failed save error inside the dialog and stays open', async () => {
    mockCreateTable.mockRejectedValueOnce(new Error('Name is required'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Tables')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Table'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    // Still open, still on the same mode.
    expect(screen.getByRole('heading', { name: 'New Table' })).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('does not render an (inactive) badge even for inactive tables', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('T2')).toBeInTheDocument();
    });

    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
  });

  it('renders a row enable checkbox for each table with an Enable/Disable aria-label', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument();
      expect(screen.getByText('T2')).toBeInTheDocument();
    });

    const t1Checkbox = screen.getByRole('checkbox', { name: 'Disable T1' });
    expect(t1Checkbox).toBeChecked();

    const t2Checkbox = screen.getByRole('checkbox', { name: 'Enable T2' });
    expect(t2Checkbox).not.toBeChecked();
    // Still no (inactive) badge.
    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
  });

  it('toggling the row checkbox updates isActive without opening the Edit dialog', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable T1' }));

    await waitFor(() => {
      expect(mockUpdateTable).toHaveBeenCalledWith(1, { isActive: false });
    });
    // The wrapper stopPropagation keeps the row click (open edit) from firing.
    expect(screen.queryByRole('heading', { name: 'Edit Table' })).not.toBeInTheDocument();
    // Success reloads the list.
    expect(mockListTables).toHaveBeenCalledTimes(2);
  });

  it('shows the toggle error in the page error banner and keeps the dialog closed', async () => {
    mockUpdateTable.mockRejectedValueOnce(new Error('isActive is locked'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable T1' }));

    await waitFor(() => {
      expect(screen.getByText('isActive is locked')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Edit Table' })).not.toBeInTheDocument();
  });
});
