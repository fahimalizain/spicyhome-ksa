import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CategoriesPage } from '../pages/admin/CategoriesPage';

const mockListCategories = vi.fn();
const mockCreateCategory = vi.fn();
const mockUpdateCategory = vi.fn();
const mockListPrinters = vi.fn();

vi.mock('../api', () => ({
  client: {
    menu: {
      listCategories: (...args: any[]) => mockListCategories(...args),
      createCategory: (...args: any[]) => mockCreateCategory(...args),
      updateCategory: (...args: any[]) => mockUpdateCategory(...args),
    },
    printers: {
      list: (...args: any[]) => mockListPrinters(...args),
    },
  },
}));

const baseCategory = {
  sortOrder: 0,
  isActive: true,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const categoryBurgers = {
  ...baseCategory,
  id: 1,
  name: 'Burgers',
  printerId: null as number | null,
};

const categoryPizza = {
  ...baseCategory,
  id: 2,
  name: 'Pizza',
  printerId: 1,
};

const basePrinter = {
  connectionType: 'tcp' as const,
  windowsPrinterName: null as string | null,
  ip: '192.168.1.100',
  port: 9100,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
  config: {
    arabic: {
      encoding: 'none' as const,
      codePage: 0,
      visualRtl: false,
    },
  },
};

const printerKitchen1 = {
  ...basePrinter,
  id: 1,
  name: 'Kitchen 1',
  role: 'kitchen' as const,
  isActive: true,
};

const printerKitchen2 = {
  ...basePrinter,
  id: 2,
  name: 'Kitchen 2',
  role: 'kitchen' as const,
  isActive: false,
};

const printerReceipt = {
  ...basePrinter,
  id: 3,
  name: 'Receipt',
  role: 'receipt' as const,
  isActive: true,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <CategoriesPage />
    </MemoryRouter>,
  );
}

describe('CategoriesPage — kitchen printer routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCategories.mockResolvedValue([categoryBurgers, categoryPizza]);
    mockListPrinters.mockResolvedValue([printerKitchen1, printerKitchen2, printerReceipt]);
    mockCreateCategory.mockResolvedValue({ ...categoryBurgers, id: 9 });
    mockUpdateCategory.mockResolvedValue({ ...categoryPizza, id: 2 });
  });

  it('renders categories after load with the printer label in each row', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Burgers')).toBeInTheDocument();
      expect(screen.getByText('Pizza')).toBeInTheDocument();
    });

    const pizzaRow = screen.getByText('Pizza').parentElement!;
    expect(within(pizzaRow).getByText('Kitchen 1')).toBeInTheDocument();

    const burgersRow = screen.getByText('Burgers').parentElement!;
    expect(within(burgersRow).getByText('Default kitchen printer')).toBeInTheDocument();
  });

  it('does not show the dialog until New Category or Edit is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    expect(screen.getByText('New Category')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New Category' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit Category' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Active')).not.toBeInTheDocument();
  });

  it('opens New Category listing only kitchen-role printers plus the Default option', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Category'));

    expect(screen.getByRole('heading', { name: 'New Category' })).toBeInTheDocument();
    const select = screen.getByTestId('kitchen-printer-select');
    expect(within(select).getByText('Default kitchen printer')).toBeInTheDocument();
    expect(within(select).getByText('Kitchen 1')).toBeInTheDocument();
    expect(within(select).getByText('Kitchen 2')).toBeInTheDocument();
    expect(within(select).queryByText('Receipt')).not.toBeInTheDocument();
  });

  it('sends printerId on create when a kitchen printer is selected', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Category'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Desserts' } });

    const select = screen.getByTestId('kitchen-printer-select');
    fireEvent.change(select, { target: { value: '2' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Desserts', printerId: 2, sortOrder: 0 }),
      );
    });
  });

  it('omits printerId on create when Default is selected', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Category'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Desserts' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith(
        expect.not.objectContaining({ printerId: expect.anything() }),
      );
    });
  });

  it('edit populates the dropdown from the category printerId and Update with Default sends null', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pizza')); // row click opens edit

    await waitFor(() => {
      expect(screen.getByTestId('kitchen-printer-select')).toHaveValue('1');
    });
    expect(screen.getByRole('heading', { name: 'Edit Category' })).toBeInTheDocument();

    const select = screen.getByTestId('kitchen-printer-select');
    fireEvent.change(select, { target: { value: '' } });

    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdateCategory).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ printerId: null }),
      );
    });
  });

  it('keeps an inactive assigned printer selectable so edits are not blank', async () => {
    // Pizza assigned to kitchen printer id 4, which is inactive.
    mockListCategories.mockResolvedValue([{ ...categoryPizza, printerId: 4 }]);
    mockListPrinters.mockResolvedValue([
      printerReceipt,
      { ...printerKitchen1, id: 4, isActive: false },
    ]);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pizza'));

    await waitFor(() => {
      expect(screen.getByTestId('kitchen-printer-select')).toHaveValue('4');
    });
  });

  it('still renders categories when the printers list fails', async () => {
    mockListPrinters.mockRejectedValue(new Error('printers down'));

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Burgers')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Category'));

    const select = screen.getByTestId('kitchen-printer-select');
    expect(within(select).getByText('Default kitchen printer')).toBeInTheDocument();
    expect(within(select).queryByText('Kitchen 1')).not.toBeInTheDocument();
  });

  it('shows Active checked by default on create and sends isActive: true', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Category'));

    expect(screen.getByLabelText('Active')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Desserts' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
    });
  });

  it('does not render an (inactive) badge even for inactive categories', async () => {
    mockListCategories.mockResolvedValue([{ ...categoryBurgers, isActive: false }]);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Burgers')).toBeInTheDocument();
    });

    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
  });

  it('renders a row enable checkbox for each category with an Enable/Disable aria-label', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Burgers')).toBeInTheDocument();
      expect(screen.getByText('Pizza')).toBeInTheDocument();
    });

    const burgersCheckbox = screen.getByRole('checkbox', { name: 'Disable Burgers' });
    expect(burgersCheckbox).toBeChecked();

    const pizzaCheckbox = screen.getByRole('checkbox', { name: 'Disable Pizza' });
    expect(pizzaCheckbox).toBeChecked();
  });

  it('toggling the row checkbox updates isActive without opening the Edit dialog', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Burgers')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Burgers' }));

    await waitFor(() => {
      expect(mockUpdateCategory).toHaveBeenCalledWith(1, { isActive: false });
    });
    // The wrapper stopPropagation keeps the row click (open edit) from firing.
    expect(screen.queryByRole('heading', { name: 'Edit Category' })).not.toBeInTheDocument();
    // Success reloads the list.
    expect(mockListCategories).toHaveBeenCalledTimes(2);
  });

  it('shows the Enable label when the category is inactive', async () => {
    mockListCategories.mockResolvedValue([{ ...categoryBurgers, isActive: false }]);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Burgers')).toBeInTheDocument();
    });

    const burgersCheckbox = screen.getByRole('checkbox', { name: 'Enable Burgers' });
    expect(burgersCheckbox).not.toBeChecked();
    // Still no (inactive) badge.
    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
  });

  it('shows the toggle error in the page error banner and keeps the dialog closed', async () => {
    mockUpdateCategory.mockRejectedValueOnce(new Error('isActive is locked'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Burgers')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Burgers' }));

    await waitFor(() => {
      expect(screen.getByText('isActive is locked')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Edit Category' })).not.toBeInTheDocument();
  });
});
