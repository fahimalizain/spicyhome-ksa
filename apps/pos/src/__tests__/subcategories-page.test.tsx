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

  it('sends categoryId, name, sortOrder, isActive on create', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Subcategories')).toBeInTheDocument();
    });

    const form = container.querySelector('form')!;
    const nameInput = form.querySelector('input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Desserts' } });

    const selects = form.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: '2' } });

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

    fireEvent.click(screen.getAllByText('Edit')[1]); // Chicken (category 2)
    await waitFor(() => {
      expect(screen.getByText('Edit Subcategory')).toBeInTheDocument();
    });

    const form = document.querySelector('form')!;
    const nameInput = form.querySelector('input') as HTMLInputElement;
    expect(nameInput.value).toBe('Chicken');
    const selects = form.querySelectorAll('select');
    expect(selects[0].value).toBe('2');

    fireEvent.change(nameInput, { target: { value: 'Fried Chicken' } });
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

  it('shows inactive subcategories with a marker', async () => {
    mockListSubcategories.mockResolvedValue([{ ...subVeg, isActive: false }]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('(inactive)')).toBeInTheDocument();
    });
  });
});
