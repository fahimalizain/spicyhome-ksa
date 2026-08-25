import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemsPage } from '../pages/admin/ItemsPage';

const mockListItems = vi.fn();
const mockListCategories = vi.fn();
const mockListSubcategories = vi.fn();
const mockCreateItem = vi.fn();
const mockUpdateItem = vi.fn();

vi.mock('../api', () => ({
  client: {
    menu: {
      listItems: (...args: any[]) => mockListItems(...args),
      listCategories: (...args: any[]) => mockListCategories(...args),
      listSubcategories: (...args: any[]) => mockListSubcategories(...args),
      createItem: (...args: any[]) => mockCreateItem(...args),
      updateItem: (...args: any[]) => mockUpdateItem(...args),
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

const categoryBurgers = { ...baseCategory, id: 1, name: 'Burgers', printerId: null };
const categoryPizza = { ...baseCategory, id: 2, name: 'Pizza', printerId: null };
// No subcategories loaded for this category (used for the subcategory-required case).
const categoryDesserts = { ...baseCategory, id: 3, name: 'Desserts', printerId: null };

const baseSub = {
  isActive: true,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

// Deliberately out of sort order: Chicken (sortOrder 0) must sort before Beef (1).
const subBeef = { ...baseSub, id: 11, categoryId: 1, name: 'Beef', sortOrder: 1 };
const subChicken = { ...baseSub, id: 12, categoryId: 1, name: 'Chicken', sortOrder: 0 };
const subVeggie = { ...baseSub, id: 21, categoryId: 2, name: 'Veggie', sortOrder: 0 };

const baseItem = {
  nameAr: null as string | null,
  vatRateBp: 1500,
  sortOrder: 0,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const itemZinger = {
  ...baseItem,
  id: 1,
  categoryId: 1,
  subcategoryId: 12,
  name: 'Zinger Burger',
  priceHalalas: 2300,
  isActive: true,
};

const itemPepperoni = {
  ...baseItem,
  id: 2,
  categoryId: 2,
  subcategoryId: 21,
  name: 'Pepperoni',
  priceHalalas: 3000,
  isActive: false,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ItemsPage />
    </MemoryRouter>,
  );
}

/** Opens the category tree picker and returns its menu panel. */
function openPicker() {
  fireEvent.click(screen.getByLabelText(/Filter by category/));
  return screen.getByRole('menu');
}

describe('ItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListItems.mockResolvedValue([itemZinger, itemPepperoni]);
    mockListCategories.mockResolvedValue([categoryBurgers, categoryPizza]);
    mockListSubcategories.mockResolvedValue([subBeef, subChicken, subVeggie]);
    mockCreateItem.mockResolvedValue({ ...itemZinger, id: 9 });
    mockUpdateItem.mockResolvedValue({ ...itemZinger, id: 1 });
  });

  it('renders item rows with name, subcategory label, and price', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    const zingerRow = screen.getByText('Zinger Burger').parentElement!;
    expect(within(zingerRow).getByText('Chicken')).toBeInTheDocument();
    expect(within(zingerRow).getByText('23.00 SAR')).toBeInTheDocument();

    const pepperoniRow = screen.getByText('Pepperoni').parentElement!;
    expect(within(pepperoniRow).getByText('Veggie')).toBeInTheDocument();
    expect(within(pepperoniRow).getByText('30.00 SAR')).toBeInTheDocument();
  });

  it('does not render an (inactive) badge even for inactive items', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pepperoni')).toBeInTheDocument();
    });

    expect(screen.queryByText('(inactive)')).not.toBeInTheDocument();
  });

  it('does not show the dialog until New Item or Edit is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { name: 'New Item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit Item' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Active')).not.toBeInTheDocument();
  });

  it('opens New Item primed from the first category, Active checked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Item'));

    expect(screen.getByRole('heading', { name: 'New Item' })).toBeInTheDocument();
    // First category is Burgers; first of its subs by sortOrder is Chicken (id 12).
    expect(screen.getByLabelText('Category')).toHaveValue('1');
    expect(screen.getByLabelText('Subcategory')).toHaveValue('12');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Arabic name') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Active')).toBeChecked();
  });

  it('creates with the full payload, closes the dialog, and reloads the list', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Item'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Double Zinger' } });
    fireEvent.change(screen.getByLabelText('Price (SAR)'), { target: { value: '29.99' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateItem).toHaveBeenCalledWith({
        subcategoryId: 12,
        name: 'Double Zinger',
        nameAr: null,
        priceHalalas: 2999,
        vatRateBp: 1500,
        sortOrder: 0,
        isActive: true,
      });
    });

    // Success closes the dialog and reloads the list.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'New Item' })).not.toBeInTheDocument();
    });
    expect(mockListItems).toHaveBeenCalledTimes(2);
  });

  it('resets the subcategory to the first of the newly selected category', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Item'));
    expect(screen.getByLabelText('Subcategory')).toHaveValue('12');

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '2' } });

    expect(screen.getByLabelText('Subcategory')).toHaveValue('21'); // Veggie, only sub of Pizza
  });

  it('opens Edit Item from the row with fields populated and Active reflecting the item', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    // Whole row is the hit target.
    fireEvent.click(screen.getByText('Zinger Burger'));

    expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Zinger Burger');
    expect((screen.getByLabelText('Arabic name') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Category')).toHaveValue('1');
    expect(screen.getByLabelText('Subcategory')).toHaveValue('12');
    expect((screen.getByLabelText('Price (SAR)') as HTMLInputElement).value).toBe('23');
    expect(screen.getByLabelText('Active')).toBeChecked();
  });

  it('opens Edit Item from the Edit label and unchecks Active for an inactive item', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pepperoni')).toBeInTheDocument();
    });

    // The visible Edit label is the second row's (Pepperoni, index 1).
    fireEvent.click(screen.getAllByText('Edit')[1]);

    expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Pepperoni');
    expect(screen.getByLabelText('Active')).not.toBeChecked();
  });

  it('updates the item with the full payload including isActive', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zinger Deluxe' } });
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith(1, {
        subcategoryId: 12,
        name: 'Zinger Deluxe',
        nameAr: null,
        priceHalalas: 2300,
        vatRateBp: 1500,
        sortOrder: 0,
        isActive: true,
      });
    });
  });

  it('edit populates a non-null Arabic name', async () => {
    mockListItems.mockResolvedValue([{ ...itemZinger, nameAr: 'زنجر برجر' }, itemPepperoni]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Zinger Burger'));

    expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument();
    expect((screen.getByLabelText('Arabic name') as HTMLInputElement).value).toBe('زنجر برجر');
  });

  it('creates with the trimmed Arabic name', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Item'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Double Zinger' } });
    fireEvent.change(screen.getByLabelText('Price (SAR)'), { target: { value: '29.99' } });
    fireEvent.change(screen.getByLabelText('Arabic name'), {
      target: { value: '  زنجر برجر  ' },
    });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateItem).toHaveBeenCalledWith({
        subcategoryId: 12,
        name: 'Double Zinger',
        nameAr: 'زنجر برجر',
        priceHalalas: 2999,
        vatRateBp: 1500,
        sortOrder: 0,
        isActive: true,
      });
    });
  });

  it('update with a cleared Arabic name sends null', async () => {
    mockListItems.mockResolvedValue([{ ...itemZinger, nameAr: 'زنجر برجر' }, itemPepperoni]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Arabic name'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith(1, {
        subcategoryId: 12,
        name: 'Zinger Burger',
        nameAr: null,
        priceHalalas: 2300,
        vatRateBp: 1500,
        sortOrder: 0,
        isActive: true,
      });
    });
  });

  it('shows a failed save error inside the dialog and stays open', async () => {
    mockCreateItem.mockRejectedValueOnce(new Error('Name is required'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Item'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    // Still open, still on the same mode.
    expect(screen.getByRole('heading', { name: 'New Item' })).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('Cancel closes the dialog', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Item'));
    expect(screen.getByRole('heading', { name: 'New Item' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByRole('heading', { name: 'New Item' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('Escape closes the dialog', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Item'));
    expect(screen.getByRole('heading', { name: 'New Item' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('heading', { name: 'New Item' })).not.toBeInTheDocument();
  });

  it('requires a subcategory: shows the error and does not call createItem', async () => {
    mockListCategories.mockResolvedValue([categoryBurgers, categoryPizza, categoryDesserts]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Item'));
    // Desserts has no subcategories → subcategoryId falls back to 0.
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Choc Lava' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Please select a subcategory')).toBeInTheDocument();
    });
    expect(mockCreateItem).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'New Item' })).toBeInTheDocument();
  });

  it('filters items by an English search query and the clear button restores them', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'zinger' } });

    expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Clear search'));

    expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
  });

  it('filters items by an Arabic search query', async () => {
    mockListItems.mockResolvedValue([{ ...itemZinger, nameAr: 'زنجر برجر' }, itemPepperoni]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'زنجر' } });

    expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();
  });

  it('treats a whitespace-only search query as no filter', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: '   ' } });

    expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
  });

  it('filters by a category picked from the tree', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    const menu = openPicker();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Burgers' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by category/)).toHaveTextContent('Burgers');
  });

  it('filters by a subcategory and still shows inactive items', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    const menu = openPicker();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Veggie' }));

    // Pepperoni is inactive but the admin keeps inactive items visible.
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
    expect(screen.queryByText('Zinger Burger')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by category/)).toHaveTextContent('Pizza / Veggie');
  });

  it('All restores the full list after a category filter', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    const menu = openPicker();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Burgers' }));
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();

    const menuAgain = openPicker();
    fireEvent.click(within(menuAgain).getByRole('menuitem', { name: 'All' }));

    expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by category/)).toHaveTextContent('All');
  });

  it('combines a category filter with search and shows the empty state', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    const menu = openPicker();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Burgers' }));

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'xyzzy' } });

    expect(screen.getByText('No items match')).toBeInTheDocument();
    expect(screen.queryByText('Zinger Burger')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: '' } });

    expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();
  });

  it('shows the empty state for a subcategory with no items', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    const menu = openPicker();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Beef' }));

    expect(screen.getByText('No items match')).toBeInTheDocument();
    expect(screen.queryByText('Zinger Burger')).not.toBeInTheDocument();
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by category/)).toHaveTextContent('Burgers / Beef');
  });

  it('does not render the category tree until the picker is opened', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Beef')).not.toBeInTheDocument();

    const menu = openPicker();
    expect(within(menu).getByRole('menuitem', { name: 'Beef' })).toBeInTheDocument();
  });

  it('Escape closes the tree without clearing the search query', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Search items');
    fireEvent.change(searchInput, { target: { value: 'zinger' } });
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();

    openPicker();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Tree-open Escape only closes the tree; the query survives.
    expect((searchInput as HTMLInputElement).value).toBe('zinger');
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();
  });

  it('renders a row enable checkbox for each item with an Enable/Disable aria-label', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    const zingerCheckbox = screen.getByRole('checkbox', { name: 'Disable Zinger Burger' });
    expect(zingerCheckbox).toBeChecked();

    const pepperoniCheckbox = screen.getByRole('checkbox', { name: 'Enable Pepperoni' });
    expect(pepperoniCheckbox).not.toBeChecked();
  });

  it('toggling the row checkbox updates isActive without opening the Edit dialog', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Zinger Burger' }));

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith(1, { isActive: false });
    });
    // The wrapper stopPropagation keeps the row click (open edit) from firing.
    expect(screen.queryByRole('heading', { name: 'Edit Item' })).not.toBeInTheDocument();
    // Success reloads the list.
    expect(mockListItems).toHaveBeenCalledTimes(2);
  });

  it('shows the toggle error in the page error banner and keeps the dialog closed', async () => {
    mockUpdateItem.mockRejectedValueOnce(new Error('isActive is locked'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Zinger Burger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Zinger Burger' }));

    await waitFor(() => {
      expect(screen.getByText('isActive is locked')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Edit Item' })).not.toBeInTheDocument();
  });
});
