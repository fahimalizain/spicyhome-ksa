import { useState, useEffect } from 'react';
import { client } from '../../api';
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
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SubcategoryForm>(emptyForm);

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

  function resetForm() {
    setForm({ ...emptyForm, categoryId: categories[0]?.id || 0 });
    setEditId(null);
  }

  function editSub(sub: SubcategoryResponse) {
    setForm({
      categoryId: sub.categoryId,
      name: sub.name,
      sortOrder: sub.sortOrder,
      isActive: sub.isActive,
    });
    setEditId(sub.id);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        await client.menu.updateSubcategory(editId, form as UpdateSubcategoryDto);
      } else {
        await client.menu.createSubcategory(form);
      }
      resetForm();
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    }
  }

  /** Parent category display name for a subcategory row. */
  function parentName(sub: SubcategoryResponse): string {
    return categories.find((c) => c.id === sub.categoryId)?.name ?? `#${sub.categoryId}`;
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="text-xl font-bold text-white mb-4">Subcategories</h1>
      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <form onSubmit={handleSave} className="bg-gray-800 rounded-xl p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">
          {editId ? 'Edit Subcategory' : 'New Subcategory'}
        </h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Category</label>
          <select
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
          <label className="block text-xs text-gray-500 mb-1">Sort order</label>
          <input
            type="number"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            value={form.sortOrder}
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            className="w-4 h-4"
          />
          Active
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
          >
            {editId ? 'Update' : 'Create'}
          </button>
          {editId && (
            <button
              type="button"
              onClick={resetForm}
              className="touch-target bg-gray-700 hover:bg-gray-600 rounded px-4 py-2 text-sm text-gray-300"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-1">
        {subcategories.map((sub) => (
          <div
            key={sub.id}
            className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm text-white">{sub.name}</span>
              <span className="text-xs text-gray-500 ml-2">{parentName(sub)}</span>
              {!sub.isActive && <span className="text-xs text-red-400 ml-2">(inactive)</span>}
            </div>
            <button
              onClick={() => editSub(sub)}
              className="touch-target text-xs text-brand-400 hover:text-brand-300 px-2 py-1"
            >
              Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
