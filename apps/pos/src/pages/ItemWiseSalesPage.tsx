import { useEffect, useRef, useState } from 'react';
import { halalasToSar, getServiceDayString } from '@spicyhome/shared';
import type {
  CategoryResponse,
  DeliveryPartnerResponse,
  ItemWiseSalesFooter,
  ItemWiseSalesResponse,
} from '@spicyhome/client-ts';
import { client } from '../api';
import { ReportFilters } from '../components/reports/ReportFilters';

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
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Item-wise Sales</h1>
      </div>

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

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <div className="relative">
        <div className="overflow-x-auto scrollbar-thin rounded-lg border border-gray-700">
          <table className="w-full text-sm text-gray-300 whitespace-nowrap">
            <thead>
              <tr className="bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Item</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2">Category</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">Qty sold</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">Gross</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">Refunded qty</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">Refunded</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">Net qty</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">Net</th>
                <th className="sticky top-0 bg-gray-800 px-3 py-2 text-right">VAT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.itemId ?? row.itemName}
                  className="border-t border-gray-700/60 hover:bg-gray-800/60"
                >
                  <td className="px-3 py-2 text-white font-medium">{row.itemName}</td>
                  <td className="px-3 py-2">{row.categoryName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.qtySold}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(row.grossHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.refundedQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(row.refundedHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{row.netQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {halalasToSar(row.netHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(row.vatHalalas)} SAR
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
                <tr className="border-t border-gray-600 bg-gray-800/80 font-semibold text-white">
                  <td className="px-3 py-2" colSpan={2}>
                    Totals
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{footer.qtySold}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(footer.grossHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{footer.refundedQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(footer.refundedHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{footer.netQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(footer.netHalalas)} SAR
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {halalasToSar(footer.vatHalalas)} SAR
                  </td>
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
