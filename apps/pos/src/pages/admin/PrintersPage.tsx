import { useState, useEffect } from 'react';
import { client } from '../../api';
import { Dialog } from '../../components/Dialog';
import type { CreatePrinterDto, UpdatePrinterDto, PrinterResponse } from '@spicyhome/client-ts';
import { DEFAULT_PRINTER_CONFIG } from '@spicyhome/shared';
import type { PrinterConfig, ArabicEncoding } from '@spicyhome/shared';

const CODE_PAGE_SUGGESTIONS: Record<ArabicEncoding, number> = {
  none: 0,
  utf8: 0,
  pc864: 22,
  w1256: 50,
};

function configSummary(config: PrinterConfig): string {
  const { encoding, codePage, visualRtl, renderMode } = config.arabic;
  if (encoding === 'none') return 'AR: none';
  let summary = `AR: ${encoding}/${codePage}`;
  if (visualRtl) summary += ' RTL';
  if (renderMode === 'raster') summary += ' raster';
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
  const config = p.config || DEFAULT_PRINTER_CONFIG;
  return {
    name: p.name,
    connectionType: (p.connectionType as 'tcp' | 'windows') || 'tcp',
    windowsPrinterName: p.windowsPrinterName || '',
    ip: p.ip,
    port: p.port,
    role: p.role as 'kitchen' | 'receipt',
    isActive: p.isActive,
    config: {
      arabic: {
        encoding: config.arabic?.encoding ?? 'none',
        codePage: config.arabic?.codePage ?? 0,
        visualRtl: config.arabic?.visualRtl ?? false,
        renderMode: config.arabic?.renderMode ?? 'charset',
      },
    },
  };
}

export function PrintersPage() {
  const [printers, setPrinters] = useState<PrinterResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testStatus, setTestStatus] = useState<Record<number, string>>({});
  const [form, setForm] = useState<PrinterForm>(emptyForm);
  const [windowsQueues, setWindowsQueues] = useState<string[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(p: PrinterResponse) {
    setForm(printerToForm(p));
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
    setSaveError('');
    setSubmitting(true);

    const payload: CreatePrinterDto = {
      name: form.name,
      connectionType: form.connectionType,
      role: form.role,
      isActive: form.isActive,
      config: form.config,
      port: form.connectionType === 'tcp' ? form.port : 9100,
      ...(form.connectionType === 'tcp'
        ? { ip: form.ip, windowsPrinterName: undefined }
        : { ip: '', windowsPrinterName: form.windowsPrinterName }),
    };

    try {
      if (editId) {
        await client.printers.update(editId, payload as UpdatePrinterDto);
      } else {
        await client.printers.create(payload);
      }
      closeDialog();
      await loadData();
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Printers</h1>
        <button
          type="button"
          onClick={openCreate}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
        >
          New Printer
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <div className="space-y-1">
        {printers.map((p) => (
          <div
            key={p.id}
            onClick={() => openEdit(p)}
            className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700/50"
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
              <span className="touch-target text-xs text-brand-400 px-2 py-1 pointer-events-none">
                Edit
              </span>
              <button
                type="button"
                onClick={(e) => {
                  // Test lives on the row (not in the dialog); stop the row's
                  // openEdit click from firing.
                  e.stopPropagation();
                  handleTestPrint(p);
                }}
                disabled={testingId === p.id}
                className="touch-target text-xs text-green-400 hover:text-green-300 px-2 py-1 disabled:opacity-40"
              >
                {testingId === p.id ? 'Printing...' : 'Test'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {dialogOpen && (
        <Dialog
          title={editId ? 'Edit Printer' : 'New Printer'}
          onClose={closeDialog}
          className="w-[640px]"
          oskSize="sm"
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1" htmlFor="printer-name">
                  Name
                </label>
                <input
                  id="printer-name"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1" htmlFor="printer-role">
                  Role
                </label>
                <select
                  id="printer-role"
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
                <label className="block text-xs text-gray-500 mb-1" htmlFor="printer-connection">
                  Connection
                </label>
                <select
                  id="printer-connection"
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
                    <label className="block text-xs text-gray-500 mb-1" htmlFor="printer-ip">
                      IP Address
                    </label>
                    <input
                      id="printer-ip"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                      value={form.ip}
                      onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
                      required={form.connectionType === 'tcp'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1" htmlFor="printer-port">
                      Port
                    </label>
                    <input
                      id="printer-port"
                      type="number"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                      value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
                    />
                  </div>
                </>
              ) : (
                <div className="col-span-2">
                  <label
                    className="block text-xs text-gray-500 mb-1"
                    htmlFor="printer-windows-name"
                  >
                    Windows Printer Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="printer-windows-name"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                      value={form.windowsPrinterName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, windowsPrinterName: e.target.value }))
                      }
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

            <div className="flex items-center gap-2">
              <input
                id="printer-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 accent-brand-600"
              />
              <label htmlFor="printer-active" className="text-sm text-white cursor-pointer">
                Active
              </label>
            </div>

            <div className="pt-3 border-t border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-1">Arabic encoding</h3>
              <p className="text-xs text-gray-500 mb-3">
                From the Test print probes — pick the encoding/code page that looked correct.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1" htmlFor="printer-encoding">
                    Encoding
                  </label>
                  <select
                    id="printer-encoding"
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
                  <label className="block text-xs text-gray-500 mb-1" htmlFor="printer-code-page">
                    Code page
                  </label>
                  <input
                    id="printer-code-page"
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
                  <label
                    htmlFor="printer-rtl"
                    className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"
                  >
                    <input
                      id="printer-rtl"
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
                <div>
                  <label className="block text-xs text-gray-500 mb-1" htmlFor="printer-render-mode">
                    Arabic render mode
                  </label>
                  <select
                    id="printer-render-mode"
                    data-testid="render-mode-select"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                    value={form.config.arabic.renderMode ?? 'charset'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        config: {
                          arabic: {
                            ...f.config.arabic,
                            renderMode: e.target.value as 'charset' | 'raster',
                          },
                        },
                      }))
                    }
                  >
                    <option value="charset">charset — ESC t code page (letters do not join)</option>
                    <option value="raster">raster — bit image (joined Arabic)</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Raster mode prints Arabic lines as GS v 0 bit images (true joined letterforms).
                Charset mode uses the ESC t code page — correct order, isolated glyphs. Run the Test
                print with the .bin probes to compare on hardware.
              </p>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
