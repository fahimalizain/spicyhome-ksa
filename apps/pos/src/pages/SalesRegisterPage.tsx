import { useEffect, useRef, useState } from 'react';
import { halalasToSar, getServiceDayString } from '@spicyhome/shared';
import type {
  DeliveryPartnerResponse,
  SalesRegisterFooter,
  SalesRegisterResponse,
  SalesRegisterRow,
} from '@spicyhome/client-ts';
import { client } from '../api';
import { formatOrderTypeLabel } from '../lib/order-type-label';
import { ReportFilters } from '../components/reports/ReportFilters';

/** "Table / Partner" cell: dine-in shows the table, takeaway the partner
 * (title + external ref via formatOrderTypeLabel) or Walk-in when no partner. */
function tableOrPartner(row: SalesRegisterRow): string {
  if (row.type === 'dine_in') {
    return row.tableName || '—';
  }
  if (row.deliveryPartnerTitle?.trim()) {
    return formatOrderTypeLabel(row);
  }
  return 'Walk-in';
}

/** Tender cell: "Cash 23.00 · Card 50.00" (one entry per payment line). */
function tenderSummary(row: SalesRegisterRow): string {
  return row.tenders.map((t) => `${t.methodTitle} ${halalasToSar(t.amountHalalas)}`).join(' · ');
}

export function SalesRegisterPage() {
  // Posting-time service-day window; defaults to the current service day
  // (Asia/Riyadh 05:00 boundary), same as the Orders list filter.
  const [from, setFrom] = useState(() => getServiceDayString(Date.now()));
  const [to, setTo] = useState(() => getServiceDayString(Date.now()));
  const [type, setType] = useState('');
  const [partner, setPartner] = useState('');
  const [kind, setKind] = useState('');
  const [partners, setPartners] = useState<DeliveryPartnerResponse[]>([]);

  // Full-page spinner only for the very first load; filter-driven reloads
  // keep the page chrome mounted and only spin the table area.
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<SalesRegisterResponse | null>(null);

  // All delivery partners (not just enabled) so historical slugs stay
  // filterable. Best-effort: failures leave only "All / Walk-in".
  useEffect(() => {
    let cancelled = false;
    client.deliveryPartners
      .list()
      .then((p) => {
        if (!cancelled) setPartners(p);
      })
      .catch(() => {
        if (!cancelled) setPartners([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rangeInvalid = from === '' || to === '' || from > to;

  useEffect(() => {
    if (rangeInvalid) return;
    loadReport();
  }, [from, to, type, partner, kind]);

  async function loadReport() {
    if (hasLoadedOnceRef.current) {
      setListLoading(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await client.reports.salesRegister({
        from,
        to,
        type: type || undefined,
        partner: partner || undefined,
        kind: kind || undefined,
      });
      setReport(res);
      setError('');
    } catch {
      setError('Failed to load sales register');
    } finally {
      setLoading(false);
      setListLoading(false);
      hasLoadedOnceRef.current = true;
    }
  }

  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Loading sales register...
      </div>
    );
  }

  const rows = report?.rows ?? [];
  const footer: SalesRegisterFooter | null = report?.footer ?? null;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Sales Register</h1>
      </div>

      <ReportFilters
        idPrefix="sales-register"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        type={type}
        onTypeChange={setType}
        partner={partner}
        onPartnerChange={setPartner}
        partners={partners}
        extra={{
          id: 'sales-register-kind',
          label: 'Kind',
          value: kind,
          onChange: setKind,
          options: [
            { value: '', label: 'All' },
            { value: 'sale', label: 'Sale' },
            { value: 'refund', label: 'Refund' },
          ],
        }}
      />

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <div className="relative">
        <div className="overflow-x-auto scrollbar-thin rounded-lg border border-gray-700">
          <table className="w-full text-sm text-gray-300 whitespace-nowrap">
            <thead>
              <tr className="bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Business Date</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Time</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Kind</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Document ID</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Order no</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Type</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Table / Partner</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">Subtotal</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">VAT</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">Total</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Tender</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Cashier</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.kind}-${row.documentId}`}
                  className="border-t border-gray-700/60 hover:bg-gray-800/60"
                >
                  <td className="px-3 py-2">{row.businessDate}</td>
                  <td className="px-3 py-2">
                    {new Date(row.postedAt * 1000).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        row.kind === 'sale'
                          ? 'bg-green-700 text-green-100'
                          : 'bg-purple-700 text-purple-100'
                      }`}
                    >
                      {row.kind === 'sale' ? 'Sale' : 'Refund'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-white font-medium">{row.documentId}</td>
                  <td className="px-3 py-2">#{row.orderNo}</td>
                  <td className="px-3 py-2">{formatOrderTypeLabel(row)}</td>
                  <td className="px-3 py-2">{tableOrPartner(row)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(row.subtotalHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(row.vatHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(row.totalHalalas)} SAR
                  </td>
                  <td className="px-3 py-2">{tenderSummary(row)}</td>
                  <td className="px-3 py-2">{row.cashierName}</td>
                  <td className="px-3 py-2">{row.notes ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-gray-500">
                    No rows in this range.
                  </td>
                </tr>
              )}
            </tbody>
            {footer && (
              <tfoot>
                <tr className="border-t border-gray-600 bg-gray-800/80 font-semibold text-white">
                  <td className="px-3 py-2" colSpan={7}>
                    {footer.saleCount} sales · {footer.refundCount} refunds
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(footer.subtotalHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(footer.vatHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(footer.totalHalalas)} SAR
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* List-area spinner during filter-driven reloads — the header and
            filter bar stay mounted above. */}
        {listLoading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/60 rounded-lg"
            aria-busy="true"
          >
            <div className="flex items-center gap-2 text-gray-400">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-brand-500" />
              <span>Loading...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
