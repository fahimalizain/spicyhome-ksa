import { useState, useEffect } from 'react';
import { client } from '../../api';
import { Dialog } from '../../components/Dialog';
import { AdminRowEnabledCheckbox } from './AdminRowEnabledCheckbox';
import type {
  CategoryResponse,
  SubcategoryResponse,
  UpdateSubcategoryDto,
} from '@spicyhome/client-ts';

interface SubcategoryForm {
  categoryId: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

const emptyForm: SubcategoryForm = { categoryId: 0, name: '', sortOrder: 0, isActive: true };

export function SubcategoriesPage() {
  const [subcategories, setSubcategories] = useState<SubcategoryResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SubcategoryForm>(emptyForm);
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [subs, cats] = await Promise.all([
        client.menu.listSubcategories(),
        client.menu.listCategories(),
      ]);
      setSubcategories(subs);
      setCategories(cats);
      setError('');
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(sub: SubcategoryResponse) {
    setError('');
    try {
      await client.menu.updateSubcategory(sub.id, { isActive: !sub.isActive });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  }

  function resetForm() {
    setForm({ ...emptyForm, categoryId: categories[0]?.id || 0 });
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(sub: SubcategoryResponse) {
    setForm({
      categoryId: sub.categoryId,
      name: sub.name,
      sortOrder: sub.sortOrder,
      isActive: sub.isActive,
    });
    setEditId(sub.id);
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
    setSubmitting(true);
    try {
      if (editId) {
        await client.menu.updateSubcategory(editId, form as UpdateSubcategoryDto);
      } else {
        await client.menu.createSubcategory(form);
      }
      closeDialog();
      await loadData();
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  /** Parent category display name for a subcategory row. */
  function parentName(sub: SubcategoryResponse): string {
    return categories.find((c) => c.id === sub.categoryId)?.name ?? `#${sub.categoryId}`;
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Subcategories</h1>
        <button
          type="button"
          onClick={openCreate}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
        >
          New Subcategory
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <div className="space-y-1">
        {subcategories.map((sub) => (
          <div
            key={sub.id}
            onClick={() => openEdit(sub)}
            className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700/50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <AdminRowEnabledCheckbox
                checked={sub.isActive}
                ariaLabel={sub.isActive ? `Disable ${sub.name}` : `Enable ${sub.name}`}
                onToggle={() => toggleActive(sub)}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{sub.name}</span>
                <span className="text-xs text-gray-500 ml-2">{parentName(sub)}</span>
              </div>
            </div>
            <span className="touch-target text-xs text-brand-400 px-2 py-1 pointer-events-none">
              Edit
            </span>
          </div>
        ))}
      </div>

      {dialogOpen && (
        <Dialog
          title={editId ? 'Edit Subcategory' : 'New Subcategory'}
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
              <label className="block text-xs text-gray-500 mb-1" htmlFor="subcategory-name">
                Name
              </label>
              <input
                id="subcategory-name"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="subcategory-category">
                Category
              </label>
              <select
                id="subcategory-category"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: Number(e.target.value) }))}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="subcategory-sort">
                Sort order
              </label>
              <input
                id="subcategory-sort"
                type="number"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="subcategory-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 accent-brand-600"
              />
              <label htmlFor="subcategory-active" className="text-sm text-white cursor-pointer">
                Active
              </label>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
