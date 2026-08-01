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

  it('renders categories after load', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Burgers')).toBeInTheDocument();
      expect(screen.getByText('Pizza')).toBeInTheDocument();
    });
  });

  it('lists only kitchen-role printers plus the Default option', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    const select = screen.getByTestId('kitchen-printer-select');
    expect(within(select).getByText('Default kitchen printer')).toBeInTheDocument();
    expect(within(select).getByText('Kitchen 1')).toBeInTheDocument();
    expect(within(select).getByText('Kitchen 2')).toBeInTheDocument();
    expect(within(select).queryByText('Receipt')).not.toBeInTheDocument();
  });

  it('sends printerId on create when a kitchen printer is selected', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    const form = container.querySelector('form')!;
    const nameInput = form.querySelector('input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Desserts' } });

    const select = screen.getByTestId('kitchen-printer-select');
    fireEvent.change(select, { target: { value: '2' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Desserts', printerId: 2 }),
      );
    });
  });

  it('omits printerId on create when Default is selected', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    const form = container.querySelector('form')!;
    const nameInput = form.querySelector('input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Desserts' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith(
        expect.not.objectContaining({ printerId: expect.anything() }),
      );
    });
  });

  it('edit populates the dropdown from the category printerId', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Edit')[1]); // Pizza (printerId 1)

    await waitFor(() => {
      expect(screen.getByTestId('kitchen-printer-select')).toHaveValue('1');
    });
    expect(screen.getByText('Edit Category')).toBeInTheDocument();
  });

  it('clears printerId on update when Default is selected', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Edit')[1]); // Pizza (printerId 1)

    await waitFor(() => {
      expect(screen.getByTestId('kitchen-printer-select')).toHaveValue('1');
    });

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

    fireEvent.click(screen.getAllByText('Edit')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('kitchen-printer-select')).toHaveValue('4');
    });
  });

  it('shows the assigned printer name in the category list', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeInTheDocument();
    });

    const pizzaRow = screen.getByText('Pizza').parentElement!;
    expect(within(pizzaRow).getByText('Kitchen 1')).toBeInTheDocument();

    const burgersRow = screen.getByText('Burgers').parentElement!;
    expect(within(burgersRow).getByText('Default kitchen printer')).toBeInTheDocument();
  });

  it('still renders categories when the printers list fails', async () => {
    mockListPrinters.mockRejectedValue(new Error('printers down'));

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Burgers')).toBeInTheDocument();
    });

    const select = screen.getByTestId('kitchen-printer-select');
    expect(within(select).getByText('Default kitchen printer')).toBeInTheDocument();
    expect(within(select).queryByText('Kitchen 1')).not.toBeInTheDocument();
  });
});
