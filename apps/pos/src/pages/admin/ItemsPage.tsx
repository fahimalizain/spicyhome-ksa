import { useState, useEffect } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../../api';
import { Dialog } from '../../components/Dialog';
import { filterMenuItems } from '../../lib/filterMenuItems';
import { CategoryTreeFilter } from './CategoryTreeFilter';
import { AdminRowEnabledCheckbox } from './AdminRowEnabledCheckbox';
import type {
  ItemResponse,
  CategoryResponse,
  SubcategoryResponse,
  CreateItemDto,
  UpdateItemDto,
} from '@spicyhome/client-ts';

export function ItemsPage() {
  const [items, setItems] = useState<ItemResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [subcategories, setSubcategories] = useState<SubcategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    nameAr: '',
    categoryId: 0,
    subcategoryId: 0,
    priceHalalas: 0,
    vatRateBp: 1500,
    sortOrder: 0,
    isActive: true,
  });
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [filterSubcategoryId, setFilterSubcategoryId] = useState<number | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [itemList, catList, subList] = await Promise.all([
        client.menu.listItems(),
        client.menu.listCategories(),
        client.menu.listSubcategories(),
      ]);
      setItems(itemList);
      setCategories(catList);
      setSubcategories(subList);
    } catch {
      setError('Failed to load items');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(item: ItemResponse) {
    setError('');
    try {
      await client.menu.updateItem(item.id, { isActive: !item.isActive });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  }

  /** Active subcategories of the currently selected category (by sortOrder). */
  function subcategoryOptions(categoryId: number): SubcategoryResponse[] {
    return subcategories
      .filter((s) => s.categoryId === categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  function resetForm() {
    const firstCategoryId = categories[0]?.id || 0;
    setForm({
      name: '',
      nameAr: '',
      categoryId: firstCategoryId,
      subcategoryId: subcategoryOptions(firstCategoryId)[0]?.id || 0,
      priceHalalas: 0,
      vatRateBp: 1500,
      sortOrder: 0,
      isActive: true,
    });
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(item: ItemResponse) {
    setForm({
      name: item.name,
      nameAr: item.nameAr ?? '',
      categoryId: item.categoryId,
      subcategoryId: item.subcategoryId,
      priceHalalas: item.priceHalalas,
      vatRateBp: item.vatRateBp,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    });
    setEditId(item.id);
    setDialogOpen(true);
  }

  /** Cancel, backdrop, and Escape all land here. Always resets the form. */
  function closeDialog() {
    setDialogOpen(false);
    resetForm();
    setSaveError('');
  }

  async function handleSave() {
    if (submitting) return;
    setSaveError('');
    if (!form.subcategoryId) {
      setSaveError('Please select a subcategory');
      return;
    }
    setSubmitting(true);
    try {
      // categoryId is derived server-side from the subcategory's parent.
      const payload = {
        subcategoryId: form.subcategoryId,
        name: form.name,
        nameAr: form.nameAr.trim() || null,
        priceHalalas: form.priceHalalas,
        vatRateBp: form.vatRateBp,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      if (editId) {
        // DTOs type nameAr as optional string without null; sending null is what
        // clears an existing Arabic name, so cast the payload.
        await client.menu.updateItem(editId, payload as UpdateItemDto);
      } else {
        await client.menu.createItem(payload as CreateItemDto);
      }
      closeDialog();
      await loadData();
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  /** Subcategory display name for an item row. */
  function subcategoryLabel(item: ItemResponse): string {
    return subcategories.find((s) => s.id === item.subcategoryId)?.name ?? `#${item.subcategoryId}`;
  }

  const filteredItems = filterMenuItems(items, {
    categoryId: filterCategoryId,
    subcategoryId: filterSubcategoryId,
    query: itemSearch,
  });

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-bold text-white shrink-0">Items</h1>
          <div className="relative shrink-0 w-40 sm:w-48 md:w-56">
            <input
              type="search"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              onKeyDown={(e) => {
                // Tree-open Escape closes the tree only (CategoryTreeFilter handles it);
                // search is only cleared when the tree is closed.
                if (e.key === 'Escape' && !treeOpen) setItemSearch('');
              }}
              placeholder="Search…"
              aria-label="Search items"
              className="w-full min-h-touch pl-3 pr-8 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-brand-500"
            />
            {itemSearch && (
              <button
                type="button"
                onClick={() => setItemSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg leading-none px-1"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <CategoryTreeFilter
            categories={categories}
            subcategories={subcategories}
            categoryId={filterCategoryId}
            subcategoryId={filterSubcategoryId}
            open={treeOpen}
            onOpenChange={setTreeOpen}
            onSelect={(categoryId, subcategoryId) => {
              setFilterCategoryId(categoryId);
              setFilterSubcategoryId(subcategoryId);
            }}
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
        >
          New Item
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      {filteredItems.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">No items match</div>
      ) : (
        <div className="space-y-1">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => openEdit(item)}
              className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <AdminRowEnabledCheckbox
                  checked={item.isActive}
                  ariaLabel={item.isActive ? `Disable ${item.name}` : `Enable ${item.name}`}
                  onToggle={() => toggleActive(item)}
                />
                <div>
                  <span className="text-sm text-white">{item.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{subcategoryLabel(item)}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {halalasToSar(item.priceHalalas)} SAR
                  </span>
                </div>
              </div>
              <span className="touch-target text-xs text-brand-400 px-2 py-1 pointer-events-none">
                Edit
              </span>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <Dialog
          title={editId ? 'Edit Item' : 'New Item'}
          onClose={closeDialog}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeDialog}
                disabled={submitting}
                className="touch-target bg-gray-700 hover:bg-gray-600 rounded px-4 py-2 text-sm text-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          }
        >
          {saveError && <div className="text-red-400 text-sm mb-3">{saveError}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="item-name">
                Name
              </label>
              <input
                id="item-name"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="item-name-ar">
                Arabic name
              </label>
              <input
                id="item-name-ar"
                dir="rtl"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.nameAr}
                onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1" htmlFor="item-category">
                  Category
                </label>
                <select
                  id="item-category"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.categoryId}
                  onChange={(e) => {
                    const categoryId = Number(e.target.value);
                    // Reset subcategory to the first of the new category.
                    setForm((f) => ({
                      ...f,
                      categoryId,
                      subcategoryId: subcategoryOptions(categoryId)[0]?.id || 0,
                    }));
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1" htmlFor="item-subcategory">
                  Subcategory
                </label>
                <select
                  id="item-subcategory"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.subcategoryId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subcategoryId: Number(e.target.value) }))
                  }
                >
                  {subcategoryOptions(form.categoryId).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1" htmlFor="item-price">
                  Price (SAR)
                </label>
                <input
                  id="item-price"
                  type="number"
                  step="0.01"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.priceHalalas / 100}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      priceHalalas: Math.round(parseFloat(e.target.value || '0') * 100),
                    }))
                  }
                  required
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="item-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 accent-brand-600"
              />
              <label htmlFor="item-active" className="text-sm text-white cursor-pointer">
                Active
              </label>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
