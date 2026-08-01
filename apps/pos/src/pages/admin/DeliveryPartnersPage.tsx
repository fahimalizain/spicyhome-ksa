import { useState, useEffect } from 'react';
import { client } from '../../api';

interface DeliveryPartner {
  id: string;
  title: string;
  enabled: boolean;
  sortOrder: number;
}

/**
 * Extract the server's error message from a client-ts error. The request
 * helper throws `HTTP <status> <statusText>: <body>`, so when the body is
 * JSON with a `message` field (e.g. the 409 open-order disable guard) we
 * surface that message verbatim instead of the raw HTTP envelope.
 */
function errorMessage(e: unknown, fallback: string): string {
  const raw = (e as { message?: string })?.message || fallback;
  const match = raw.match(/^HTTP \d{3} [^:]+: (.*)$/);
  if (!match) return raw;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Not JSON — fall through to the raw error string.
  }
  return raw;
}

export function DeliveryPartnersPage() {
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [editForm, setEditForm] = useState({
    title: '',
    sortOrder: 0,
    enabled: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await client.deliveryPartners.list();
      setPartners(res);
    } catch {
      setError('Failed to load delivery partners');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(p: DeliveryPartner) {
    setEditId(p.id);
    setEditForm({
      title: p.title,
      sortOrder: p.sortOrder,
      enabled: p.enabled,
    });
  }

  function cancelEdit() {
    setEditId(null);
  }

  // Same slug rules as the server (ADR 0007): lowercase, non-alphanumeric →
  // hyphen, collapse multiple hyphens, trim leading/trailing hyphens.
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
      await client.deliveryPartners.create({
        title: createTitle.trim(),
      });
      setCreateTitle('');
      await loadData();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to create'));
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setError('');
    try {
      await client.deliveryPartners.update(editId, {
        title: editForm.title,
        sortOrder: editForm.sortOrder,
        enabled: editForm.enabled,
      });
      cancelEdit();
      await loadData();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to update'));
    }
  }

  async function toggleEnabled(p: DeliveryPartner) {
    setError('');
    try {
      await client.deliveryPartners.update(p.id, {
        enabled: !p.enabled,
      });
      await loadData();
    } catch (e: unknown) {
      // e.g. 409 from the open-order disable guard (ADR 0007) — show the
      // server's message verbatim so staff understand why the toggle failed.
      setError(errorMessage(e, 'Failed to update'));
    }
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="text-xl font-bold text-white mb-4">Delivery Partners</h1>
      {error && (
        <div className="bg-red-900/40 border border-red-700/50 rounded-lg px-3 py-2 text-red-300 text-sm mb-3">
          {error}
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="bg-gray-800 rounded-xl p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">New Delivery Partner</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Title</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            placeholder="e.g. HungerStation"
            required
          />
          {createTitle.trim() && (
            <p className="text-xs text-gray-500 mt-1">
              Slug: <code className="text-gray-400">{slugPreview(createTitle) || '(empty)'}</code>
            </p>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Creating a partner also creates its linked payment method (ZATCA code 30 — Credit / On
          Account) used to settle delivery orders on account.
        </p>
        <button
          type="submit"
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
          disabled={!createTitle.trim()}
        >
          Create
        </button>
      </form>

      {/* Partners list */}
      <div className="space-y-1">
        {partners.map((p) => (
          <div key={p.id} className="bg-gray-800 rounded-lg px-3 py-2">
            {editId === p.id ? (
              <form onSubmit={handleUpdate} className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="text-xs text-gray-500 bg-gray-700 px-1 py-0.5 rounded">
                    {p.id}
                  </code>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Title</label>
                  <input
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The slug (payment method id) is fixed — renaming only changes the title.
                  </p>
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
                  <span className="text-sm text-white font-medium">{p.title}</span>
                  <code className="text-xs text-gray-500">{p.id}</code>
                  <span className="text-xs text-gray-600">Order: {p.sortOrder}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={() => toggleEnabled(p)}
                      className="rounded"
                    />
                    <span className={`text-xs ${p.enabled ? 'text-green-400' : 'text-gray-500'}`}>
                      {p.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </label>
                  <button
                    onClick={() => startEdit(p)}
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
