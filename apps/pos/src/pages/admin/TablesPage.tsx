import { useState, useEffect } from 'react';
import { client } from '../../api';
import type { TableResponse } from '@spicyhome/client-ts';

export function TablesPage() {
  const [tables, setTables] = useState<TableResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', sortOrder: 0, isActive: true });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await client.tables.list();
      setTables(res);
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({ name: '', sortOrder: 0, isActive: true });
    setEditId(null);
  }

  function editTable(t: TableResponse) {
    setForm({ name: t.name, sortOrder: t.sortOrder, isActive: t.isActive });
    setEditId(t.id);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        await client.tables.update(editId, form);
      } else {
        await client.tables.create(form);
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
      <h1 className="text-xl font-bold text-white mb-4">Tables</h1>
      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <form onSubmit={handleSave} className="bg-gray-800 rounded-xl p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">
          {editId ? 'Edit Table' : 'New Table'}
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
        {tables.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2"
          >
            <span className="text-sm text-white">{t.name}</span>
            <button
              onClick={() => editTable(t)}
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
