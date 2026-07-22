import { useState, useEffect } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../../api';
import type { ItemResponse, CategoryResponse } from '@spicyhome/client-ts';

export function ItemsPage() {
  const [items, setItems] = useState<ItemResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', categoryId: 0, priceHalalas: 0, vatRateBp: 1500, sortOrder: 0, isActive: true });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [itemList, catList] = await Promise.all([
        client.menu.listItems(),
        client.menu.listCategories(),
      ]);
      setItems(itemList);
      setCategories(catList);
    } catch {
      setError('Failed to load items');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({ name: '', categoryId: categories[0]?.id || 0, priceHalalas: 0, vatRateBp: 1500, sortOrder: 0, isActive: true });
    setEditId(null);
  }

  function editItem(item: ItemResponse) {
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      priceHalalas: item.priceHalalas,
      vatRateBp: item.vatRateBp,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    });
    setEditId(item.id);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        await client.menu.updateItem(editId, form);
      } else {
        await client.menu.createItem(form);
      }
      resetForm();
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    }
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="text-xl font-bold text-white mb-4">Items</h1>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <form onSubmit={handleSave} className="bg-gray-800 rounded-xl p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">{editId ? 'Edit Item' : 'New Item'}</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: Number(e.target.value) }))}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Price (SAR)</label>
            <input
              type="number"
              step="0.01"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
              value={form.priceHalalas / 100}
              onChange={(e) => setForm((f) => ({ ...f, priceHalalas: Math.round(parseFloat(e.target.value || '0') * 100) }))}
              required
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white">
            {editId ? 'Update' : 'Create'}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} className="touch-target bg-gray-700 hover:bg-gray-600 rounded px-4 py-2 text-sm text-gray-300">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
            <div>
              <span className="text-sm text-white">{item.name}</span>
              <span className="text-xs text-gray-500 ml-2">
                {halalasToSar(item.priceHalalas)} SAR
              </span>
              {!item.isActive && <span className="text-xs text-red-400 ml-2">(inactive)</span>}
            </div>
            <button onClick={() => editItem(item)} className="touch-target text-xs text-brand-400 hover:text-brand-300 px-2 py-1">
              Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
