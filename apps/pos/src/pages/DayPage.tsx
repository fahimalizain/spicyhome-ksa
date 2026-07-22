import { useState, useEffect } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../api';

export function DayPage() {
  const [day, setDay] = useState<any>(null);
  const [xReport, setXReport] = useState<any>(null);
  const [closingCash, setClosingCash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pastDays, setPastDays] = useState<any[]>([]);
  const [selectedZ, setSelectedZ] = useState<any>(null);
  const [tab, setTab] = useState<'status' | 'past'>('status');

  useEffect(() => {
    loadCurrentDay();
  }, []);

  async function loadCurrentDay() {
    try {
      const [dayRes, xRes] = await Promise.all([
        client.day.current(),
        client.reports.x().catch(() => null),
      ]);
      if (dayRes.open === false) {
        setDay(null);
        setXReport(null);
      } else {
        setDay(dayRes);
        if (xRes && !('error' in xRes)) setXReport(xRes);
      }
    } catch {
      setDay(null);
    }
  }

  async function loadPastDays() {
    try {
      const res = await client.day.list(1, 50);
      setPastDays(res.data || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleClose() {
    if (!closingCash || isNaN(Number(closingCash))) return;
    setLoading(true);
    setError('');
    try {
      const cashHalalas = Math.round(parseFloat(closingCash) * 100);
      const res = await client.day.close({ closingCashHalalas: cashHalalas });
      setSelectedZ(res);
      setDay(null);
      setXReport(null);
    } catch (e: any) {
      setError(e.message || 'Failed to close day');
    } finally {
      setLoading(false);
    }
  }

  async function viewZReport(dayId: number) {
    try {
      const res = await client.reports.z(dayId);
      setSelectedZ(res);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function printX() {
    try {
      await client.reports.printX();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function printZ(dayId: number) {
    try {
      await client.reports.printZ(dayId);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-white mb-4">Business Day</h1>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setTab('status')}
          className={`touch-target px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'status' ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}
        >
          Status
        </button>
        <button
          onClick={() => {
            setTab('past');
            loadPastDays();
          }}
          className={`touch-target px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'past' ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}
        >
          Past Days
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {tab === 'status' && (
        <div>
          {!day && (
            <div className="bg-gray-800 rounded-xl p-6 text-center">
              <p className="text-gray-400 text-lg mb-4">No business day is currently open.</p>
              <p className="text-sm text-gray-500">Go to the Order page to open a new day.</p>
            </div>
          )}

          {day && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">
                  Day: {day.businessDate} <span className="text-green-400 text-sm ml-2">OPEN</span>
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <StatCard
                    label="Opening Cash"
                    value={`${halalasToSar(day.openingCashHalalas)} SAR`}
                  />
                  <StatCard
                    label="Live Sales"
                    value={xReport ? `${halalasToSar(xReport.totalSalesHalalas)} SAR` : '—'}
                  />
                  <StatCard
                    label="Live VAT"
                    value={xReport ? `${halalasToSar(xReport.totalVatHalalas)} SAR` : '—'}
                  />
                  <StatCard
                    label="Paid Orders"
                    value={xReport ? String(xReport.paidOrderCount) : '—'}
                  />
                </div>

                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={printX}
                    className="touch-target px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white"
                  >
                    Print X-Report
                  </button>
                </div>
              </div>

              {xReport && (
                <div className="bg-gray-800 rounded-xl p-6">
                  <h3 className="text-base font-bold text-white mb-4">X-Report Detail</h3>

                  <div className="text-sm space-y-2 mb-4">
                    <div className="flex justify-between text-gray-300">
                      <span>Paid</span>
                      <span>{xReport.paidOrderCount}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Sent</span>
                      <span>{xReport.sentOrderCount}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Open</span>
                      <span>{xReport.openOrderCount}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Voided</span>
                      <span>{xReport.voidedOrderCount}</span>
                    </div>
                  </div>

                  {xReport.salesByType && Object.keys(xReport.salesByType).length > 0 && (
                    <>
                      <h4 className="text-sm font-bold text-gray-400 mb-2">Sales by Type</h4>
                      <div className="text-sm space-y-1 mb-4">
                        {Object.entries(xReport.salesByType as Record<string, any>).map(
                          ([type, data]) => (
                            <div key={type} className="flex justify-between text-gray-300">
                              <span className="capitalize">{type}</span>
                              <span>
                                {data.count} ({halalasToSar(data.totalHalalas)} SAR)
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </>
                  )}

                  {xReport.salesByUser && xReport.salesByUser.length > 0 && (
                    <>
                      <h4 className="text-sm font-bold text-gray-400 mb-2">Sales by User</h4>
                      <div className="text-sm space-y-1 mb-4">
                        {xReport.salesByUser.map((u: any) => (
                          <div key={u.userId} className="flex justify-between text-gray-300">
                            <span>{u.userName}</span>
                            <span>
                              {u.orderCount} ({halalasToSar(u.totalHalalas)} SAR)
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {xReport.salesByCategory && xReport.salesByCategory.length > 0 && (
                    <>
                      <h4 className="text-sm font-bold text-gray-400 mb-2">Sales by Category</h4>
                      <div className="text-sm space-y-1 mb-4">
                        {xReport.salesByCategory.map((c: any) => (
                          <div
                            key={c.categoryId ?? 'uncat'}
                            className="flex justify-between text-gray-300"
                          >
                            <span>{c.categoryName}</span>
                            <span>
                              {c.itemCount} items ({halalasToSar(c.totalHalalas)} SAR)
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="bg-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Close Day</h3>
                <div className="mb-4">
                  <label className="block text-sm text-gray-300 mb-2">Closing Cash (SAR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white text-center text-xl max-w-xs"
                  />
                </div>
                <button
                  onClick={handleClose}
                  disabled={loading || !closingCash}
                  className="touch-target px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white"
                >
                  {loading ? 'Closing Day...' : 'Close Day'}
                </button>
              </div>
            </div>
          )}

          {selectedZ && (
            <div className="bg-gray-800 rounded-xl p-6 mt-6">
              <h2 className="text-lg font-bold text-white mb-4">
                Z-Report: {selectedZ.businessDate}{' '}
                <span className="text-blue-400 text-sm ml-2">CLOSED</span>
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <StatCard
                  label="Opening Cash"
                  value={`${halalasToSar(selectedZ.openingCashHalalas)} SAR`}
                />
                <StatCard
                  label="Closing Cash"
                  value={`${halalasToSar(selectedZ.closingCashHalalas)} SAR`}
                />
                <StatCard
                  label="Total Sales"
                  value={`${halalasToSar(selectedZ.totalSalesHalalas)} SAR`}
                />
                <StatCard
                  label="Total VAT"
                  value={`${halalasToSar(selectedZ.totalVatHalalas)} SAR`}
                />
                <StatCard
                  label="Paid Orders"
                  value={String(selectedZ.paidOrderCount || selectedZ.orderCount)}
                />
                <StatCard label="Voided" value={String(selectedZ.voidedOrderCount || 0)} />
              </div>
              <button
                onClick={() => printZ(selectedZ.dayId)}
                className="touch-target px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white"
              >
                Print Z-Report
              </button>
              <button
                onClick={() => setSelectedZ(null)}
                className="touch-target px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 ml-3"
              >
                Close Report
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'past' && (
        <div>
          {pastDays.length === 0 && (
            <div className="bg-gray-800 rounded-xl p-6 text-center">
              <p className="text-gray-400">No past business days.</p>
            </div>
          )}

          <div className="space-y-3">
            {pastDays.map((d) => (
              <div
                key={d.id}
                className="bg-gray-800 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <span className="text-white font-medium">{d.businessDate}</span>
                  <span
                    className={`ml-3 px-2 py-0.5 rounded text-xs ${
                      d.status === 'closed'
                        ? 'bg-blue-900/50 text-blue-400'
                        : 'bg-green-900/50 text-green-400'
                    }`}
                  >
                    {d.status}
                  </span>
                  {d.totalSalesHalalas != null && (
                    <span className="ml-3 text-sm text-gray-400">
                      Sales: {halalasToSar(d.totalSalesHalalas)} SAR
                    </span>
                  )}
                  {d.orderCount != null && (
                    <span className="ml-3 text-sm text-gray-400">Orders: {d.orderCount}</span>
                  )}
                </div>
                <button
                  onClick={() => viewZReport(d.id)}
                  className="touch-target px-4 py-2 bg-brand-600 hover:bg-brand-700 rounded-lg text-sm text-white"
                >
                  View Z-Report
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-750 rounded-lg p-3">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  );
}
