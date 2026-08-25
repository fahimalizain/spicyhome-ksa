import { useState, useEffect } from 'react';
import { client } from '../../api';
import { Dialog } from '../../components/Dialog';
import { AdminRowEnabledCheckbox, ADMIN_ROW_BUSY_CLASS } from './AdminRowEnabledCheckbox';

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    sortOrder: 0,
    enabled: true,
  });
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  function resetForm() {
    setForm({ title: '', sortOrder: 0, enabled: true });
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(p: DeliveryPartner) {
    setForm({
      title: p.title,
      sortOrder: p.sortOrder,
      enabled: p.enabled,
    });
    setEditId(p.id);
    setDialogOpen(true);
  }

  /** Cancel, backdrop, and Escape all land here. Always resets the form. */
  function closeDialog() {
    setDialogOpen(false);
    resetForm();
    setSaveError('');
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

  async function handleSave() {
    if (submitting) return;
    setSaveError('');
    setSubmitting(true);
    try {
      if (editId) {
        await client.deliveryPartners.update(editId, {
          title: form.title,
          sortOrder: form.sortOrder,
          enabled: form.enabled,
        });
      } else {
        // The create API only accepts a title — sortOrder/enabled are not
        // persisted on create.
        await client.deliveryPartners.create({ title: form.title.trim() });
      }
      closeDialog();
      await loadData();
    } catch (e: unknown) {
      setSaveError(errorMessage(e, 'Failed to save'));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEnabled(p: DeliveryPartner) {
    if (togglingId !== null) return;
    setError('');
    setTogglingId(p.id);
    try {
      await client.deliveryPartners.update(p.id, {
        enabled: !p.enabled,
      });
      // Flip locally only — a full reload would flash the whole page.
      setPartners((prev) => prev.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x)));
    } catch (e: unknown) {
      // e.g. 409 from the open-order disable guard (ADR 0007) — show the
      // server's message verbatim so staff understand why the toggle failed.
      setError(errorMessage(e, 'Failed to update'));
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Delivery Partners</h1>
        <button
          type="button"
          onClick={openCreate}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
        >
          New Delivery Partner
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700/50 rounded-lg px-3 py-2 text-red-300 text-sm mb-3">
          {error}
        </div>
      )}

      <div className="space-y-1">
        {partners.map((p) => (
          <div
            key={p.id}
            onClick={() => openEdit(p)}
            aria-busy={togglingId === p.id}
            className={`flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700/50${togglingId === p.id ? ` ${ADMIN_ROW_BUSY_CLASS}` : ''}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <AdminRowEnabledCheckbox
                checked={p.enabled}
                disabled={togglingId === p.id}
                ariaLabel={p.enabled ? `Disable ${p.title}` : `Enable ${p.title}`}
                onToggle={() => toggleEnabled(p)}
              />
              <div className="flex items-center gap-3">
                <span className="text-sm text-white font-medium">{p.title}</span>
                <code className="text-xs text-gray-500">{p.id}</code>
                <span className="text-xs text-gray-600">Order: {p.sortOrder}</span>
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
          title={editId ? 'Edit Delivery Partner' : 'New Delivery Partner'}
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
                disabled={submitting || (!editId && !form.title.trim())}
                className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          }
        >
          {saveError && <div className="text-red-400 text-sm mb-3">{saveError}</div>}
          <div className="space-y-3">
            {editId && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Slug (id):</span>
                <code className="text-xs text-gray-400 bg-gray-700 px-1 py-0.5 rounded">
                  {editId}
                </code>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="delivery-partner-title">
                Title
              </label>
              <input
                id="delivery-partner-title"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. HungerStation"
                required
              />
              {!editId && form.title.trim() && (
                <p className="text-xs text-gray-500 mt-1">
                  Slug:{' '}
                  <code className="text-gray-400">{slugPreview(form.title) || '(empty)'}</code>
                </p>
              )}
            </div>
            {!editId ? (
              <p className="text-xs text-gray-500">
                Creating a partner also creates its linked payment method (ZATCA code 30 — Credit /
                On Account) used to settle delivery orders on account.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  The slug (payment method id) is fixed — renaming only changes the title.
                </p>
                <div>
                  <label
                    className="block text-xs text-gray-500 mb-1"
                    htmlFor="delivery-partner-order"
                  >
                    Sort Order
                  </label>
                  <input
                    id="delivery-partner-order"
                    type="number"
                    className="w-24 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="delivery-partner-enabled"
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="delivery-partner-enabled" className="text-sm text-white">
                    Enabled
                  </label>
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
