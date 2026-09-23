import { useState, useEffect } from 'react';
import type { PromotionResponse } from '@spicyhome/client-ts';
import { client } from '../../api';
import { Dialog } from '../../components/Dialog';
import { AdminRowEnabledCheckbox, ADMIN_ROW_BUSY_CLASS } from './AdminRowEnabledCheckbox';

/**
 * Extract the server's error message from a client-ts error. The request
 * helper throws `HTTP <status> <statusText>: <body>`, so when the body is
 * JSON with a `message` field (e.g. the 409 enabled-range overlap guard) we
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

/** Whole percent (1–100) for the form → basis points for the API. */
function percentToBp(percent: number): number {
  return Math.round(percent * 100);
}

/** Basis points from the API → whole percent for the form/list. */
function bpToPercent(bp: number): number {
  return bp / 100;
}

type FormState = {
  name: string;
  nameAr: string;
  /** Whole percent string as typed (e.g. "10"), not basis points. */
  percent: string;
  startBusinessDate: string;
  endBusinessDate: string;
  enabled: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  nameAr: '',
  percent: '',
  startBusinessDate: '',
  endBusinessDate: '',
  enabled: true,
});

function parsePercent(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > 100) return null;
  return n;
}

function formIsValid(form: FormState): boolean {
  if (!form.name.trim() || !form.nameAr.trim()) return false;
  if (!form.startBusinessDate || !form.endBusinessDate) return false;
  if (form.startBusinessDate > form.endBusinessDate) return false;
  return parsePercent(form.percent) !== null;
}

export function PromotionsPage() {
  const [promotions, setPromotions] = useState<PromotionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await client.promotions.list();
      setPromotions(res);
    } catch {
      setError('Failed to load promotions');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm(emptyForm());
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(p: PromotionResponse) {
    setForm({
      name: p.name,
      nameAr: p.nameAr,
      percent: String(bpToPercent(p.percentBp)),
      startBusinessDate: p.startBusinessDate,
      endBusinessDate: p.endBusinessDate,
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

  async function handleSave() {
    if (submitting) return;
    if (!formIsValid(form)) return;
    const percent = parsePercent(form.percent);
    if (percent === null) return;

    setSaveError('');
    setSubmitting(true);
    const percentBp = percentToBp(percent);
    try {
      if (editId !== null) {
        await client.promotions.update(editId, {
          name: form.name.trim(),
          nameAr: form.nameAr.trim(),
          percentBp,
          startBusinessDate: form.startBusinessDate,
          endBusinessDate: form.endBusinessDate,
          enabled: form.enabled,
        });
      } else {
        // Create API does not accept enabled — server forces enabled=1.
        await client.promotions.create({
          name: form.name.trim(),
          nameAr: form.nameAr.trim(),
          percentBp,
          startBusinessDate: form.startBusinessDate,
          endBusinessDate: form.endBusinessDate,
        });
      }
      closeDialog();
      await loadData();
    } catch (e: unknown) {
      setSaveError(errorMessage(e, 'Failed to save'));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEnabled(p: PromotionResponse) {
    if (togglingId !== null) return;
    setError('');
    setTogglingId(p.id);
    try {
      await client.promotions.update(p.id, {
        enabled: !p.enabled,
      });
      // Flip locally only — a full reload would flash the whole page.
      setPromotions((prev) => prev.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x)));
    } catch (e: unknown) {
      // e.g. 409 from the enabled-range overlap guard — show the server's
      // message verbatim so staff understand why the toggle failed.
      setError(errorMessage(e, 'Failed to update'));
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  const canSubmit = !submitting && formIsValid(form);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Promotions</h1>
        <button
          type="button"
          onClick={openCreate}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
        >
          New Promotion
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700/50 rounded-lg px-3 py-2 text-red-300 text-sm mb-3">
          {error}
        </div>
      )}

      {!error && promotions.length === 0 && (
        <div className="text-sm text-gray-500 py-8 text-center">
          No promotions configured. Add one with New Promotion.
        </div>
      )}

      <div className="space-y-1">
        {promotions.map((p) => (
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
                ariaLabel={p.enabled ? `Disable ${p.name}` : `Enable ${p.name}`}
                onToggle={() => toggleEnabled(p)}
              />
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <span className="text-sm text-white font-medium">{p.name}</span>
                <span className="text-sm text-gray-400" dir="rtl">
                  {p.nameAr}
                </span>
                <span className="text-xs text-gray-300">{bpToPercent(p.percentBp)}%</span>
                <span className="text-xs text-gray-500">
                  {p.startBusinessDate} → {p.endBusinessDate}
                </span>
              </div>
            </div>
            <span className="touch-target text-xs text-brand-400 px-2 py-1 pointer-events-none shrink-0">
              Edit
            </span>
          </div>
        ))}
      </div>

      {dialogOpen && (
        <Dialog
          title={editId !== null ? 'Edit Promotion' : 'New Promotion'}
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
                disabled={!canSubmit}
                className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editId !== null ? 'Update' : 'Create'}
              </button>
            </div>
          }
        >
          {saveError && <div className="text-red-400 text-sm mb-3">{saveError}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="promotion-name">
                English name
              </label>
              <input
                id="promotion-name"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. KSA National Day"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="promotion-name-ar">
                Arabic name
              </label>
              <input
                id="promotion-name-ar"
                dir="rtl"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.nameAr}
                onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
                placeholder="مثلاً اليوم الوطني"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="promotion-percent">
                Percent
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="promotion-percent"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  className="w-24 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.percent}
                  onChange={(e) => setForm((f) => ({ ...f, percent: e.target.value }))}
                  placeholder="10"
                  required
                />
                <span className="text-sm text-gray-400">%</span>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1" htmlFor="promotion-start-date">
                  Start date
                </label>
                <input
                  id="promotion-start-date"
                  type="date"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.startBusinessDate}
                  onChange={(e) => setForm((f) => ({ ...f, startBusinessDate: e.target.value }))}
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1" htmlFor="promotion-end-date">
                  End date
                </label>
                <input
                  id="promotion-end-date"
                  type="date"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.endBusinessDate}
                  onChange={(e) => setForm((f) => ({ ...f, endBusinessDate: e.target.value }))}
                  required
                />
              </div>
            </div>
            {editId !== null && (
              <div className="flex items-center gap-2">
                <input
                  id="promotion-enabled"
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="promotion-enabled" className="text-sm text-white">
                  Enabled
                </label>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
