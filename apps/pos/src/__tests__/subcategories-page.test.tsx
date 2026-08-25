import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SubcategoriesPage } from '../pages/admin/SubcategoriesPage';

const mockListSubcategories = vi.fn();
const mockListCategories = vi.fn();
const mockCreateSubcategory = vi.fn();
const mockUpdateSubcategory = vi.fn();

vi.mock('../api', () => ({
  client: {
    menu: {
      listSubcategories: (...args: any[]) => mockListSubcategories(...args),
      listCategories: (...args: any[]) => mockListCategories(...args),
      createSubcategory: (...args: any[]) => mockCreateSubcategory(...args),
      updateSubcategory: (...args: any[]) => mockUpdateSubcategory(...args),
    },
  },
}));

const baseSub = {
  sortOrder: 0,
  isActive: true,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const categories = [
  { id: 1, name: 'Soup', sortOrder: 0, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: 2, name: 'Main Course', sortOrder: 1, isActive: true, createdAt: 0, updatedAt: 0 },
];

const subVeg = { ...baseSub, id: 1, categoryId: 1, name: 'Veg' };
const subChicken = { ...baseSub, id: 2, categoryId: 2, name: 'Chicken' };

function renderPage() {
  return render(
    <MemoryRouter>
      <SubcategoriesPage />
    </MemoryRouter>,
  );
}

describe('SubcategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSubcategories.mockResolvedValue([subVeg, subChicken]);
    mockListCategories.mockResolvedValue(categories);
    mockCreateSubcategory.mockResolvedValue({ ...subVeg, id: 9 });
    mockUpdateSubcategory.mockResolvedValue({ ...subChicken, id: 2 });
  });

  it('renders subcategories with their parent category name', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Veg')).toBeInTheDocument();
      expect(screen.getByText('Chicken')).toBeInTheDocument();
    });
    const vegRow = screen.getByText('Veg').parentElement!;
    expect(vegRow.textContent).toContain('Soup');
    const chickenRow = screen.getByText('Chicken').parentElement!;
    expect(chickenRow.textContent).toContain('Main Course');
  });

  it('does not show the dialog until New Subcategory or Edit is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Subcategories')).toBeInTheDocument();
    });

    expect(screen.getByText('New Subcategory')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New Subcategory' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit Subcategory' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('sends categoryId, name, sortOrder, isActive on create', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Subcategories')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Subcategory'));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Desserts' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '2' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateSubcategory).toHaveBeenCalledWith({
        categoryId: 2,
        name: 'Desserts',
        sortOrder: 0,
        isActive: true,
      });
    });
  });

  it('edit populates the form and update sends the payload', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Chicken')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Chicken')); // row click opens edit
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Subcategory' })).toBeInTheDocument();
    });

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Chicken');
    expect(screen.getByLabelText('Category')).toHaveValue('2');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fried Chicken' } });
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdateSubcategory).toHaveBeenCalledWith(2, {
        categoryId: 2,
        name: 'Fried Chicken',
        sortOrder: 0,
        isActive: true,
      });
    });
  });

  it('does not render an (inactive) marker even when a subcategory is inactive', async () => {
    mockListSubcategories.mockResolvedValue([{ ...subVeg, isActive: false }]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Veg')).toBeInTheDocument();
    });

    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
  });

  it('renders a row enable checkbox for each subcategory with an Enable/Disable aria-label', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Veg')).toBeInTheDocument();
      expect(screen.getByText('Chicken')).toBeInTheDocument();
    });

    const vegCheckbox = screen.getByRole('checkbox', { name: 'Disable Veg' });
    expect(vegCheckbox).toBeChecked();

    const chickenCheckbox = screen.getByRole('checkbox', { name: 'Disable Chicken' });
    expect(chickenCheckbox).toBeChecked();
  });

  it('toggling the row checkbox updates isActive without opening the Edit dialog', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Veg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Veg' }));

    await waitFor(() => {
      expect(mockUpdateSubcategory).toHaveBeenCalledWith(1, { isActive: false });
    });
    // The wrapper stopPropagation keeps the row click (open edit) from firing.
    expect(screen.queryByRole('heading', { name: 'Edit Subcategory' })).not.toBeInTheDocument();
    // No full-page reload: the list is fetched once (initial load only).
    expect(mockListSubcategories).toHaveBeenCalledTimes(1);
    // The row flips locally on success.
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Enable Veg' })).not.toBeChecked();
    });
  });

  it('shows the Enable label when the subcategory is inactive', async () => {
    mockListSubcategories.mockResolvedValue([{ ...subVeg, isActive: false }, subChicken]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Veg')).toBeInTheDocument();
    });

    const vegCheckbox = screen.getByRole('checkbox', { name: 'Enable Veg' });
    expect(vegCheckbox).not.toBeChecked();
    // Still no (inactive) marker.
    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
  });

  it('shows the toggle error in the page error banner and keeps the dialog closed', async () => {
    mockUpdateSubcategory.mockRejectedValueOnce(new Error('isActive is locked'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Veg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Veg' }));

    await waitFor(() => {
      expect(screen.getByText('isActive is locked')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Edit Subcategory' })).not.toBeInTheDocument();
    // No flip on error: Veg stays active (checked) with its Disable label.
    expect(screen.getByRole('checkbox', { name: 'Disable Veg' })).toBeChecked();
    // Still no reload.
    expect(mockListSubcategories).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('grays out only the in-flight row while the toggle is pending', async () => {
    let resolveUpdate!: (value: unknown) => void;
    mockUpdateSubcategory.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Veg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Veg' }));

    // No full-page loading flash; only the row is marked busy.
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.getByText('Veg').closest('[aria-busy="true"]')).not.toBeNull();
    const busyRow = screen.getByText('Veg').closest('[aria-busy="true"]')!;
    expect(busyRow.className).toContain('opacity-50');
    // Other row is not busy.
    expect(screen.getByText('Chicken').closest('[aria-busy="true"]')).toBeNull();

    resolveUpdate({});
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Enable Veg' })).not.toBeChecked();
    });
    expect(screen.getByText('Veg').closest('[aria-busy="true"]')).toBeNull();
  });
});
