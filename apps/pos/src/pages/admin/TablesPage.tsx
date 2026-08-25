import { useState, useEffect } from 'react';
import { client } from '../../api';
import { Dialog } from '../../components/Dialog';
import { AdminRowEnabledCheckbox } from './AdminRowEnabledCheckbox';
import type { TableResponse } from '@spicyhome/client-ts';

export function TablesPage() {
  const [tables, setTables] = useState<TableResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', sortOrder: 0, isActive: true });
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  async function toggleActive(t: TableResponse) {
    setError('');
    try {
      await client.tables.update(t.id, { isActive: !t.isActive });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  }

  function resetForm() {
    setForm({ name: '', sortOrder: 0, isActive: true });
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(t: TableResponse) {
    setForm({ name: t.name, sortOrder: t.sortOrder, isActive: t.isActive });
    setEditId(t.id);
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
        await client.tables.update(editId, form);
      } else {
        await client.tables.create(form);
      }
      closeDialog();
      await loadData();
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Tables</h1>
        <button
          type="button"
          onClick={openCreate}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
        >
          New Table
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <div className="space-y-1">
        {tables.map((t) => (
          <div
            key={t.id}
            onClick={() => openEdit(t)}
            className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700/50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <AdminRowEnabledCheckbox
                checked={t.isActive}
                ariaLabel={t.isActive ? `Disable ${t.name}` : `Enable ${t.name}`}
                onToggle={() => toggleActive(t)}
              />
              <span className="text-sm text-white">{t.name}</span>
            </div>
            <span className="touch-target text-xs text-brand-400 px-2 py-1 pointer-events-none">
              Edit
            </span>
          </div>
        ))}
      </div>

      {dialogOpen && (
        <Dialog
          title={editId ? 'Edit Table' : 'New Table'}
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
              <label className="block text-xs text-gray-500 mb-1" htmlFor="table-name">
                Name
              </label>
              <input
                id="table-name"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="table-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 accent-brand-600"
              />
              <label htmlFor="table-active" className="text-sm text-white cursor-pointer">
                Active
              </label>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
