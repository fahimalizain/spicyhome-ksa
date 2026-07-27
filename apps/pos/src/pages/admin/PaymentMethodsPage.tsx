import { useState, useEffect } from 'react';
import { client } from '../../api';

interface PaymentMethod {
  id: string;
  title: string;
  enabled: boolean;
  sortOrder: number;
}

export function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [editForm, setEditForm] = useState({ title: '', sortOrder: 0, enabled: true });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await client.paymentMethods.list();
      setMethods(res);
    } catch {
      setError('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(m: PaymentMethod) {
    setEditSlug(m.id);
    setEditForm({ title: m.title, sortOrder: m.sortOrder, enabled: m.enabled });
  }

  function cancelEdit() {
    setEditSlug(null);
  }

  function slugPreview(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) return;
    setError('');
    try {
      await client.paymentMethods.create({ title: createTitle.trim() });
      setCreateTitle('');
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to create');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editSlug) return;
    setError('');
    try {
      await client.paymentMethods.update(editSlug, {
        title: editForm.title,
        sortOrder: editForm.sortOrder,
        enabled: editForm.enabled,
      });
      cancelEdit();
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  }

  async function toggleEnabled(m: PaymentMethod) {
    setError('');
    try {
      await client.paymentMethods.update(m.id, {
        enabled: !m.enabled,
      });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="text-xl font-bold text-white mb-4">Payment Methods</h1>
      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      {/* Create form */}
      <form onSubmit={handleCreate} className="bg-gray-800 rounded-xl p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">New Payment Method</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Title</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            placeholder="e.g. SADAD"
            required
          />
          {createTitle.trim() && (
            <p className="text-xs text-gray-500 mt-1">
              Slug: <code className="text-gray-400">{slugPreview(createTitle) || '(empty)'}</code>
            </p>
          )}
        </div>
        <button
          type="submit"
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
          disabled={!createTitle.trim()}
        >
          Create
        </button>
      </form>

      {/* Payment methods list */}
      <div className="space-y-1">
        {methods.map((m) => (
          <div key={m.id} className="bg-gray-800 rounded-lg px-3 py-2">
            {editSlug === m.id ? (
              <form onSubmit={handleUpdate} className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="text-xs text-gray-500 bg-gray-700 px-1 py-0.5 rounded">
                    {m.id}
                  </code>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Title</label>
                  <input
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                    required
                    disabled={m.id === 'cash'}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Sort Order</label>
                  <input
                    type="number"
                    className="w-24 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                    value={editForm.sortOrder}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={editForm.enabled}
                      onChange={(e) => setEditForm((f) => ({ ...f, enabled: e.target.checked }))}
                      disabled={m.id === 'cash'}
                      className="rounded"
                    />
                    Enabled
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-1 text-sm text-white"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="touch-target bg-gray-700 hover:bg-gray-600 rounded px-4 py-1 text-sm text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white font-medium">{m.title}</span>
                  <code className="text-xs text-gray-500">{m.id}</code>
                  {m.id === 'cash' && (
                    <span className="text-xs text-amber-500" title="Cash is locked">
                      🔒
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={() => toggleEnabled(m)}
                      disabled={m.id === 'cash'}
                      className="rounded"
                    />
                    <span className={`text-xs ${m.enabled ? 'text-green-400' : 'text-gray-500'}`}>
                      {m.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </label>
                  <button
                    onClick={() => startEdit(m)}
                    className="touch-target text-xs text-brand-400 hover:text-brand-300 px-2 py-1"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
