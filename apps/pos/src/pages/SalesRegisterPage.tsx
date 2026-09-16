import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getServiceDayString } from '@spicyhome/shared';
import type {
  DeliveryPartnerResponse,
  SalesRegisterFooter,
  SalesRegisterResponse,
  SalesRegisterRow,
} from '@spicyhome/client-ts';
import { client } from '../api';
import { formatOrderTypeLabel } from '../lib/order-type-label';
import { ReportFilters } from '../components/reports/ReportFilters';
import { ReportTable, REPORT_TF, REPORT_TH } from '../components/reports/ReportTable';
import { SarAmount } from '../components/reports/SarAmount';

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

/** Tender cell: "Cash 23.00 · Card 50.00" (one entry per payment line).
 *  Titles stay as plain text; amounts use the SAR-style format. */
function tenderSummary(row: SalesRegisterRow): ReactNode {
  return (
    <>
      {row.tenders.map((t, i) => (
        <span key={`${t.methodId}-${i}`}>
          {i > 0 && ' · '}
          {t.methodTitle} <SarAmount halalas={t.amountHalalas} />
        </span>
      ))}
    </>
  );
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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-xl font-bold text-white">Sales Register</h1>
      </div>

      <div className="shrink-0">
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
      </div>

      {error && <div className="text-red-400 text-sm mb-3 shrink-0">{error}</div>}

      <ReportTable loading={listLoading}>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className={REPORT_TH}>Business Date</th>
            <th className={REPORT_TH}>Time</th>
            <th className={REPORT_TH}>Kind</th>
            <th className={REPORT_TH}>Document ID</th>
            <th className={REPORT_TH}>Order no</th>
            <th className={REPORT_TH}>Type</th>
            <th className={REPORT_TH}>Table / Partner</th>
            <th className={`${REPORT_TH} text-right`}>Subtotal</th>
            <th className={`${REPORT_TH} text-right`}>VAT</th>
            <th className={`${REPORT_TH} text-right`}>Total</th>
            <th className={REPORT_TH}>Tender</th>
            <th className={REPORT_TH}>Cashier</th>
            <th className={REPORT_TH}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.kind}-${row.documentId}`} className="hover:bg-gray-800/60">
              <td className="px-3 py-2">{row.businessDate}</td>
              <td className="px-3 py-2">{new Date(row.postedAt * 1000).toLocaleTimeString()}</td>
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
                <span className="flex justify-end">
                  <SarAmount halalas={row.subtotalHalalas} />
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span className="flex justify-end">
                  <SarAmount halalas={row.vatHalalas} />
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span className="flex justify-end">
                  <SarAmount halalas={row.totalHalalas} />
                </span>
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
            <tr className="font-semibold text-white">
              <td className={REPORT_TF} colSpan={7}>
                {footer.saleCount} sales · {footer.refundCount} refunds
              </td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>
                <span className="flex justify-end">
                  <SarAmount halalas={footer.subtotalHalalas} />
                </span>
              </td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>
                <span className="flex justify-end">
                  <SarAmount halalas={footer.vatHalalas} />
                </span>
              </td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>
                <span className="flex justify-end">
                  <SarAmount halalas={footer.totalHalalas} />
                </span>
              </td>
              <td className={REPORT_TF} colSpan={3} />
            </tr>
          </tfoot>
        )}
      </ReportTable>
    </div>
  );
}
