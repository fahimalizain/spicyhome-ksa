import { useState, useEffect } from 'react';
import { client } from '../../api';
import { Dialog } from '../../components/Dialog';
import { AdminRowEnabledCheckbox } from './AdminRowEnabledCheckbox';
import type { CategoryResponse, PrinterResponse, UpdateCategoryDto } from '@spicyhome/client-ts';

interface CategoryForm {
  name: string;
  sortOrder: number;
  isActive: boolean;
  printerId: number | null;
}

const emptyForm: CategoryForm = { name: '', sortOrder: 0, isActive: true, printerId: null };

export function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [printers, setPrinters] = useState<PrinterResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Printers are optional for this page: if the list fails we still show
      // categories, and the dropdown just offers "Default kitchen printer".
      const [cats, printerRes] = await Promise.all([
        client.menu.listCategories(),
        client.printers.list().catch(() => [] as PrinterResponse[]),
      ]);
      setCategories(cats);
      setPrinters(printerRes);
      setError('');
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(cat: CategoryResponse) {
    setError('');
    try {
      await client.menu.updateCategory(cat.id, { isActive: !cat.isActive });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(cat: CategoryResponse) {
    setForm({
      name: cat.name,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      printerId: cat.printerId,
    });
    setEditId(cat.id);
    setDialogOpen(true);
  }

  /** Cancel, backdrop, and Escape all land here. Always resets the form. */
  function closeDialog() {
    setDialogOpen(false);
    resetForm();
    setSaveError('');
  }

  /** Kitchen-role printers for the dropdown, active first. */
  function kitchenPrinterOptions(): PrinterResponse[] {
    const options = printers
      .filter((p) => p.role === 'kitchen')
      .sort((a, b) => (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1));
    // If the category is assigned to a printer that is inactive or no longer
    // kitchen-role, keep it selectable so the edit form is not blank.
    if (form.printerId != null && !options.some((p) => p.id === form.printerId)) {
      const assigned = printers.find((p) => p.id === form.printerId);
      if (assigned) options.push(assigned);
    }
    return options;
  }

  /** Secondary label shown under a category name in the list. */
  function printerLabel(cat: CategoryResponse): string | null {
    if (cat.printerId == null) return 'Default kitchen printer';
    const printer = printers.find((p) => p.id === cat.printerId);
    return printer ? printer.name : null;
  }

  async function handleSave() {
    if (submitting) return;
    setSaveError('');
    setSubmitting(true);
    try {
      if (editId) {
        // UpdateCategoryDto types printerId as optional number without null;
        // sending null is what clears the routing, so cast the payload.
        await client.menu.updateCategory(editId, {
          name: form.name,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
          printerId: form.printerId,
        } as UpdateCategoryDto);
      } else {
        await client.menu.createCategory({
          name: form.name,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
          ...(form.printerId != null ? { printerId: form.printerId } : {}),
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

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Categories</h1>
        <button
          type="button"
          onClick={openCreate}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
        >
          New Category
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <div className="space-y-1">
        {categories.map((cat) => {
          const label = printerLabel(cat);
          return (
            <div
              key={cat.id}
              onClick={() => openEdit(cat)}
              className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <AdminRowEnabledCheckbox
                  checked={cat.isActive}
                  ariaLabel={cat.isActive ? `Disable ${cat.name}` : `Enable ${cat.name}`}
                  onToggle={() => toggleActive(cat)}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{cat.name}</span>
                  {label && <span className="text-xs text-gray-500 ml-2">{label}</span>}
                </div>
              </div>
              <span className="touch-target text-xs text-brand-400 px-2 py-1 pointer-events-none">
                Edit
              </span>
            </div>
          );
        })}
      </div>

      {dialogOpen && (
        <Dialog
          title={editId ? 'Edit Category' : 'New Category'}
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
              <label className="block text-xs text-gray-500 mb-1" htmlFor="category-name">
                Name
              </label>
              <input
                id="category-name"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="category-printer">
                Kitchen printer
              </label>
              <select
                id="category-printer"
                data-testid="kitchen-printer-select"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.printerId ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    printerId: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              >
                <option value="">Default kitchen printer</option>
                {kitchenPrinterOptions().map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="category-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 accent-brand-600"
              />
              <label htmlFor="category-active" className="text-sm text-white cursor-pointer">
                Active
              </label>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
