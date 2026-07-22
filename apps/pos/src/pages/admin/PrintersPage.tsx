import { useState, useEffect } from 'react';
import { client } from '../../api';
import type { PrinterResponse } from '@spicyhome/client-ts';

export function PrintersPage() {
  const [printers, setPrinters] = useState<PrinterResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    ip: '',
    port: 9100,
    role: 'kitchen' as 'kitchen' | 'receipt',
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await client.printers.list();
      setPrinters(res);
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({ name: '', ip: '', port: 9100, role: 'kitchen', isActive: true });
    setEditId(null);
  }

  function editPrinter(p: PrinterResponse) {
    setForm({
      name: p.name,
      ip: p.ip,
      port: p.port,
      role: p.role as 'kitchen' | 'receipt',
      isActive: p.isActive,
    });
    setEditId(p.id);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        await client.printers.update(editId, form);
      } else {
        await client.printers.create(form);
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
      <h1 className="text-xl font-bold text-white mb-4">Printers</h1>
      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <form onSubmit={handleSave} className="bg-gray-800 rounded-xl p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">
          {editId ? 'Edit Printer' : 'New Printer'}
        </h2>
        <div className="grid grid-cols-2 gap-3">
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
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as 'kitchen' | 'receipt' }))
              }
            >
              <option value="kitchen">Kitchen</option>
              <option value="receipt">Receipt</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">IP Address</label>
            <input
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
              value={form.ip}
              onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Port</label>
            <input
              type="number"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
              required
            />
          </div>
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
        {printers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2"
          >
            <div>
              <span className="text-sm text-white">{p.name}</span>
              <span className="text-xs text-gray-500 ml-2">
                {p.ip}:{p.port}
              </span>
              <span
                className={`ml-2 px-1 py-0.5 rounded text-xs ${p.role === 'kitchen' ? 'bg-yellow-700 text-yellow-100' : 'bg-blue-700 text-blue-100'}`}
              >
                {p.role}
              </span>
            </div>
            <button
              onClick={() => editPrinter(p)}
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
