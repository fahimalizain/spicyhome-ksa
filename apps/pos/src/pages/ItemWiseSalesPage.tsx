import { useEffect, useRef, useState } from 'react';
import { getServiceDayString } from '@spicyhome/shared';
import type {
  CategoryResponse,
  DeliveryPartnerResponse,
  ItemWiseSalesFooter,
  ItemWiseSalesResponse,
} from '@spicyhome/client-ts';
import { client } from '../api';
import { ReportFilters } from '../components/reports/ReportFilters';
import { ReportTable, REPORT_TF, REPORT_TH } from '../components/reports/ReportTable';
import { SarAmount } from '../components/reports/SarAmount';

export function ItemWiseSalesPage() {
  // Posting-time service-day window; defaults to the current service day
  // (Asia/Riyadh 05:00 boundary), same as the Orders list filter.
  const [from, setFrom] = useState(() => getServiceDayString(Date.now()));
  const [to, setTo] = useState(() => getServiceDayString(Date.now()));
  const [type, setType] = useState('');
  const [partner, setPartner] = useState('');
  const [category, setCategory] = useState('');
  const [partners, setPartners] = useState<DeliveryPartnerResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);

  // Full-page spinner only for the very first load; filter-driven reloads
  // keep the page chrome mounted and only spin the table area.
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ItemWiseSalesResponse | null>(null);

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

  // All menu categories so rows can be filtered by category. Best-effort.
  useEffect(() => {
    let cancelled = false;
    client.menu
      .listCategories()
      .then((c) => {
        if (!cancelled) setCategories(c);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rangeInvalid = from === '' || to === '' || from > to;

  useEffect(() => {
    if (rangeInvalid) return;
    loadReport();
  }, [from, to, type, partner, category]);

  async function loadReport() {
    if (hasLoadedOnceRef.current) {
      setListLoading(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await client.reports.itemWise({
        from,
        to,
        type: type || undefined,
        partner: partner || undefined,
        category: category || undefined,
      });
      setReport(res);
      setError('');
    } catch {
      setError('Failed to load item-wise sales');
    } finally {
      setLoading(false);
      setListLoading(false);
      hasLoadedOnceRef.current = true;
    }
  }

  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Loading item-wise sales...
      </div>
    );
  }

  const rows = report?.rows ?? [];
  const footer: ItemWiseSalesFooter | null = report?.footer ?? null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-xl font-bold text-white">Item-wise Sales</h1>
      </div>

      <div className="shrink-0">
        <ReportFilters
          idPrefix="item-wise"
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
            id: 'item-wise-category',
            label: 'Category',
            value: category,
            onChange: setCategory,
            options: [
              { value: '', label: 'All' },
              { value: 'none', label: 'Uncategorized' },
              ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            ],
          }}
        />
      </div>

      {error && <div className="text-red-400 text-sm mb-3 shrink-0">{error}</div>}

      <ReportTable loading={listLoading}>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className={REPORT_TH}>Item</th>
            <th className={REPORT_TH}>Category</th>
            <th className={`${REPORT_TH} text-right`}>Qty sold</th>
            <th className={`${REPORT_TH} text-right`}>Gross</th>
            <th className={`${REPORT_TH} text-right`}>Refunded qty</th>
            <th className={`${REPORT_TH} text-right`}>Refunded</th>
            <th className={`${REPORT_TH} text-right`}>Net qty</th>
            <th className={`${REPORT_TH} text-right`}>Net</th>
            <th className={`${REPORT_TH} text-right`}>VAT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.itemId ?? row.itemName} className="hover:bg-gray-800/60">
              <td className="px-3 py-2 text-white font-medium">{row.itemName}</td>
              <td className="px-3 py-2">{row.categoryName}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.qtySold}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span className="flex justify-end">
                  <SarAmount halalas={row.grossHalalas} />
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{row.refundedQty}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span className="flex justify-end">
                  <SarAmount halalas={row.refundedHalalas} />
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{row.netQty}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                <span className="flex justify-end">
                  <SarAmount halalas={row.netHalalas} />
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span className="flex justify-end">
                  <SarAmount halalas={row.vatHalalas} />
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                No rows in this range.
              </td>
            </tr>
          )}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="font-semibold text-white">
              <td className={REPORT_TF} colSpan={2}>
                Totals
              </td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>{footer.qtySold}</td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>
                <span className="flex justify-end">
                  <SarAmount halalas={footer.grossHalalas} />
                </span>
              </td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>{footer.refundedQty}</td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>
                <span className="flex justify-end">
                  <SarAmount halalas={footer.refundedHalalas} />
                </span>
              </td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>{footer.netQty}</td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>
                <span className="flex justify-end">
                  <SarAmount halalas={footer.netHalalas} />
                </span>
              </td>
              <td className={`${REPORT_TF} text-right tabular-nums`}>
                <span className="flex justify-end">
                  <SarAmount halalas={footer.vatHalalas} />
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </ReportTable>
    </div>
  );
}
