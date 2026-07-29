import { useState, useEffect } from 'react';
import { client } from '../../api';
import type { PrinterResponse } from '@spicyhome/client-ts';
import { DEFAULT_PRINTER_CONFIG } from '@spicyhome/shared';
import type { PrinterConfig, ArabicEncoding } from '@spicyhome/shared';

const CODE_PAGE_SUGGESTIONS: Record<ArabicEncoding, number> = {
  none: 0,
  utf8: 0,
  pc864: 22,
  w1256: 50,
};

function configSummary(config: PrinterConfig): string {
  const { encoding, codePage, visualRtl } = config.arabic;
  if (encoding === 'none') return 'AR: none';
  let summary = `AR: ${encoding}/${codePage}`;
  if (visualRtl) summary += ' RTL';
  return summary;
}

interface PrinterForm {
  name: string;
  connectionType: 'tcp' | 'windows';
  windowsPrinterName: string;
  ip: string;
  port: number;
  role: 'kitchen' | 'receipt';
  isActive: boolean;
  config: PrinterConfig;
}

const emptyForm: PrinterForm = {
  name: '',
  connectionType: 'tcp',
  windowsPrinterName: '',
  ip: '',
  port: 9100,
  role: 'kitchen',
  isActive: true,
  config: DEFAULT_PRINTER_CONFIG,
};

function printerToForm(p: PrinterResponse): PrinterForm {
  return {
    name: p.name,
    connectionType: (p.connectionType as 'tcp' | 'windows') || 'tcp',
    windowsPrinterName: p.windowsPrinterName || '',
    ip: p.ip,
    port: p.port,
    role: p.role as 'kitchen' | 'receipt',
    isActive: p.isActive,
    config: p.config || DEFAULT_PRINTER_CONFIG,
  };
}

export function PrintersPage() {
  const [printers, setPrinters] = useState<PrinterResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testStatus, setTestStatus] = useState<Record<number, string>>({});
  const [form, setForm] = useState<PrinterForm>(emptyForm);
  const [windowsQueues, setWindowsQueues] = useState<string[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);

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

  async function refreshQueues() {
    setLoadingQueues(true);
    try {
      const res = await client.printers.listWindowsQueues();
      setWindowsQueues(res.queues);
    } catch {
      setWindowsQueues([]);
    } finally {
      setLoadingQueues(false);
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setEditId(null);
  }

  function editPrinter(p: PrinterResponse) {
    setForm(printerToForm(p));
    setEditId(p.id);
  }

  function buildSavePayload(): Record<string, any> {
    const payload: Record<string, any> = {
      name: form.name,
      connectionType: form.connectionType,
      port: form.port,
      role: form.role,
      isActive: form.isActive,
      config: form.config,
    };

    if (form.connectionType === 'windows') {
      payload.windowsPrinterName = form.windowsPrinterName;
      payload.ip = '';
    } else {
      payload.ip = form.ip;
    }

    return payload;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const payload = buildSavePayload();
      if (editId) {
        await client.printers.update(editId, payload);
      } else {
        await client.printers.create(payload);
      }
      resetForm();
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    }
  }

  async function handleTestPrint(p: PrinterResponse) {
    setTestingId(p.id);
    setTestStatus((prev) => ({ ...prev, [p.id]: 'Printing...' }));
    try {
      await client.printers.test(p.id);
      setTestStatus((prev) => ({ ...prev, [p.id]: 'Sent!' }));
    } catch (e: any) {
      setTestStatus((prev) => ({ ...prev, [p.id]: e.message || 'Failed' }));
    } finally {
      setTestingId(null);
    }
  }

  function addressLabel(p: PrinterResponse): string {
    if (p.connectionType === 'windows') {
      return 'Win: ' + (p.windowsPrinterName || p.name);
    }
    return p.ip + ':' + p.port;
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
            <label className="block text-xs text-gray-500 mb-1">Connection</label>
            <select
              data-testid="connection-type-select"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
              value={form.connectionType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  connectionType: e.target.value as 'tcp' | 'windows',
                }))
              }
            >
              <option value="tcp">Network (TCP)</option>
              <option value="windows">Windows (USB/spooler)</option>
            </select>
          </div>
          {form.connectionType === 'tcp' ? (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">IP Address</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.ip}
                  onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
                  required={form.connectionType === 'tcp'}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Port</label>
                <input
                  type="number"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
                />
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Windows Printer Name</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.windowsPrinterName}
                  onChange={(e) => setForm((f) => ({ ...f, windowsPrinterName: e.target.value }))}
                  placeholder="e.g. XP-80C"
                  list="windows-queue-list"
                  required={form.connectionType === 'windows'}
                />
                <button
                  type="button"
                  onClick={refreshQueues}
                  disabled={loadingQueues}
                  className="touch-target bg-gray-600 hover:bg-gray-500 rounded px-3 py-2 text-xs text-gray-200 disabled:opacity-40"
                  title="Refresh queue list from Windows spooler"
                >
                  {loadingQueues ? '...' : 'Refresh'}
                </button>
              </div>
              {windowsQueues.length > 0 && (
                <datalist id="windows-queue-list">
                  {windowsQueues.map((q) => (
                    <option key={q} value={q} />
                  ))}
                </datalist>
              )}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-1">Arabic encoding</h3>
          <p className="text-xs text-gray-500 mb-3">
            From the Test print probes — pick the encoding/code page that looked correct.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Encoding</label>
              <select
                data-testid="encoding-select"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.config.arabic.encoding}
                onChange={(e) => {
                  const encoding = e.target.value as ArabicEncoding;
                  setForm((f) => ({
                    ...f,
                    config: {
                      arabic: {
                        ...f.config.arabic,
                        encoding,
                        codePage: CODE_PAGE_SUGGESTIONS[encoding],
                      },
                    },
                  }));
                }}
              >
                <option value="none">none — ASCII only</option>
                <option value="utf8">utf8 — UTF-8</option>
                <option value="pc864">pc864 — PC864 (often code page 22)</option>
                <option value="w1256">w1256 — Windows-1256 (often code page 50)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Code page</label>
              <input
                type="number"
                min="0"
                max="255"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.config.arabic.codePage}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    config: {
                      arabic: { ...f.config.arabic, codePage: Number(e.target.value) },
                    },
                  }))
                }
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-600 bg-gray-700 accent-brand-500"
                  checked={form.config.arabic.visualRtl}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      config: {
                        arabic: { ...f.config.arabic, visualRtl: e.target.checked },
                      },
                    }))
                  }
                />
                Reverse glyph order (visual RTL)
              </label>
            </div>
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
            <div className="flex-1 min-w-0">
              <span className="text-sm text-white">{p.name}</span>
              <span className="text-xs text-gray-500 ml-2">{addressLabel(p)}</span>
              <span
                className={`ml-2 px-1 py-0.5 rounded text-xs ${p.role === 'kitchen' ? 'bg-yellow-700 text-yellow-100' : 'bg-blue-700 text-blue-100'}`}
              >
                {p.role}
              </span>
              {p.connectionType === 'windows' && (
                <span className="ml-1 px-1 py-0.5 rounded text-xs bg-cyan-800 text-cyan-100">
                  USB
                </span>
              )}
              <span
                className={`ml-1 px-1 py-0.5 rounded text-xs ${p.config?.arabic?.encoding === 'none' ? 'bg-gray-700 text-gray-300' : 'bg-purple-800 text-purple-100'}`}
              >
                {configSummary(p.config || DEFAULT_PRINTER_CONFIG)}
              </span>
              {testStatus[p.id] && (
                <span
                  className={
                    'ml-2 text-xs ' +
                    (testStatus[p.id] === 'Sent!'
                      ? 'text-green-400'
                      : testStatus[p.id] === 'Printing...'
                        ? 'text-gray-400'
                        : 'text-red-400')
                  }
                >
                  {testStatus[p.id]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => editPrinter(p)}
                className="touch-target text-xs text-brand-400 hover:text-brand-300 px-2 py-1"
              >
                Edit
              </button>
              <button
                onClick={() => handleTestPrint(p)}
                disabled={testingId === p.id}
                className="touch-target text-xs text-green-400 hover:text-green-300 px-2 py-1 disabled:opacity-40"
              >
                {testingId === p.id ? 'Printing...' : 'Test'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
