import { useState, useEffect } from 'react';
import { client } from '../../api';
import { Dialog } from '../../components/Dialog';
import { ZATCA_PAYMENT_MEANS_CODE_LABELS, ZATCA_PAYMENT_MEANS_CODES } from '@spicyhome/shared';

interface PaymentMethod {
  id: string;
  title: string;
  zatcaPaymentMeansCode: string;
  enabled: boolean;
  sortOrder: number;
  /** Derived on the server: this method is owned by a delivery partner (ADR 0007). */
  isDeliveryPartner: boolean;
}

export function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    zatcaPaymentMeansCode: '30',
    sortOrder: 0,
    enabled: true,
  });
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  function resetForm() {
    setForm({ title: '', zatcaPaymentMeansCode: '30', sortOrder: 0, enabled: true });
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(m: PaymentMethod) {
    setForm({
      title: m.title,
      zatcaPaymentMeansCode: m.zatcaPaymentMeansCode,
      sortOrder: m.sortOrder,
      enabled: m.enabled,
    });
    setEditId(m.id);
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
        const m = methods.find((x) => x.id === editId);
        if (m?.isDeliveryPartner) {
          // Partner-owned methods are managed via Delivery Partners — only
          // sort_order is adjustable here (ADR 0007); sending title/enabled
          // would 403 on the server.
          await client.paymentMethods.update(editId, { sortOrder: form.sortOrder });
        } else {
          await client.paymentMethods.update(editId, {
            title: form.title,
            sortOrder: form.sortOrder,
            enabled: form.enabled,
            zatcaPaymentMeansCode: form.zatcaPaymentMeansCode,
          });
        }
      } else {
        // The create API only accepts title + ZATCA code — sortOrder/enabled
        // are not persisted on create.
        await client.paymentMethods.create({
          title: form.title.trim(),
          zatcaPaymentMeansCode: form.zatcaPaymentMeansCode,
        });
      }
      closeDialog();
      await loadData();
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
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

  // The full method while editing, for the cash / partner lock rules.
  const editingMethod = editId ? methods.find((m) => m.id === editId) : undefined;
  const isLocked =
    !!editingMethod && (editingMethod.id === 'cash' || editingMethod.isDeliveryPartner);
  const isCash = editingMethod?.id === 'cash';
  const isPartner = !!editingMethod?.isDeliveryPartner;

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Payment Methods</h1>
        <button
          type="button"
          onClick={openCreate}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
        >
          New Payment Method
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <div className="space-y-1">
        {methods.map((m) => (
          <div
            key={m.id}
            onClick={() => openEdit(m)}
            className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700/50"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-white font-medium">{m.title}</span>
              <code className="text-xs text-gray-500">{m.id}</code>
              <span
                className="text-xs bg-gray-700 text-brand-300 px-1.5 py-0.5 rounded"
                title={
                  ZATCA_PAYMENT_MEANS_CODE_LABELS[
                    m.zatcaPaymentMeansCode as keyof typeof ZATCA_PAYMENT_MEANS_CODE_LABELS
                  ] || m.zatcaPaymentMeansCode
                }
              >
                {m.zatcaPaymentMeansCode}
              </span>
              {m.id === 'cash' && (
                <span className="text-xs text-amber-500" title="Cash is locked">
                  🔒
                </span>
              )}
              {m.isDeliveryPartner && (
                <span
                  className="text-xs bg-gray-700 text-amber-400 px-1.5 py-0.5 rounded"
                  title="Managed via Delivery Partners — title and enabled state are edited there"
                >
                  Delivery partner
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Row toggle: clicking it must not open the edit dialog. */}
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={() => toggleEnabled(m)}
                    disabled={m.id === 'cash' || m.isDeliveryPartner}
                    className="rounded"
                  />
                  <span className={`text-xs ${m.enabled ? 'text-green-400' : 'text-gray-500'}`}>
                    {m.enabled ? 'Active' : 'Disabled'}
                  </span>
                </label>
              </div>
              <span className="touch-target text-xs text-brand-400 px-2 py-1 pointer-events-none">
                Edit
              </span>
            </div>
          </div>
        ))}
      </div>

      {dialogOpen && (
        <Dialog
          title={editId ? 'Edit Payment Method' : 'New Payment Method'}
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
            {editId && editingMethod && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Slug (id):</span>
                <code className="text-xs text-gray-400 bg-gray-700 px-1 py-0.5 rounded">
                  {editingMethod.id}
                </code>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="payment-method-title">
                Title
              </label>
              <input
                id="payment-method-title"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. SADAD"
                required
                disabled={isLocked}
              />
              {!editId && form.title.trim() && (
                <p className="text-xs text-gray-500 mt-1">
                  Slug:{' '}
                  <code className="text-gray-400">{slugPreview(form.title) || '(empty)'}</code>
                </p>
              )}
            </div>
            <div>
              <label
                className="block text-xs text-gray-500 mb-1"
                htmlFor="payment-method-zatca-code"
              >
                ZATCA Payment Means Code (BT-81)
              </label>
              <select
                id="payment-method-zatca-code"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.zatcaPaymentMeansCode}
                onChange={(e) => setForm((f) => ({ ...f, zatcaPaymentMeansCode: e.target.value }))}
                required
                disabled={isLocked}
              >
                {ZATCA_PAYMENT_MEANS_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} — {ZATCA_PAYMENT_MEANS_CODE_LABELS[code]}
                  </option>
                ))}
              </select>
              {isCash ? (
                <p className="text-xs text-amber-500 mt-1">Cash is locked to code 10 (In cash).</p>
              ) : isPartner ? (
                <p className="text-xs text-amber-500 mt-1">
                  Managed via Delivery Partners — only sort order is editable here.
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  ZATCA BT-81 code for invoices: cash / card / bank transfer / other.
                </p>
              )}
            </div>
            {editId && (
              <>
                <div>
                  <label
                    className="block text-xs text-gray-500 mb-1"
                    htmlFor="payment-method-order"
                  >
                    Sort Order
                  </label>
                  <input
                    id="payment-method-order"
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
                    id="payment-method-enabled"
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    disabled={isLocked}
                    className="rounded"
                  />
                  <label htmlFor="payment-method-enabled" className="text-sm text-white">
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
