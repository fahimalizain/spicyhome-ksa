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
});
