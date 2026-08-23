import type { ReactNode } from 'react';

/** A labelled <select> rendered after the shared filters (Kind / Category). */
export interface ReportFilterSelect {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

interface ReportFiltersProps {
  /** id prefix so labels/inputs stay unique across report pages. */
  idPrefix: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  type: string;
  onTypeChange: (value: string) => void;
  partner: string;
  onPartnerChange: (value: string) => void;
  /** All delivery partners (not just enabled) — historical slugs must be filterable. */
  partners: { id: string; title: string }[];
  /** Page-specific filter (Kind for Sales Register, Category for Item-wise). */
  extra?: ReportFilterSelect;
  /** Optional extra controls (e.g. the live report spinner). */
  children?: ReactNode;
}

const FILTER_CONTROL_CLASSES =
  'touch-target bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white';

/**
 * Shared report filter bar: From/To business dates, Type (dine-in/takeaway)
 * and Partner (walk-in / delivery partner). Every change reloads the report
 * (no Apply button). Shows an inline error when From > To — the caller must
 * skip the API call in that case (the server would 400).
 */
export function ReportFilters(props: ReportFiltersProps) {
  const {
    idPrefix,
    from,
    to,
    onFromChange,
    onToChange,
    type,
    onTypeChange,
    partner,
    onPartnerChange,
    partners,
    extra,
    children,
  } = props;

  const rangeInvalid = from !== '' && to !== '' && from > to;

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${idPrefix}-from`} className="text-xs text-gray-400">
          From
        </label>
        <input
          id={`${idPrefix}-from`}
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className={FILTER_CONTROL_CLASSES}
        />
        <label htmlFor={`${idPrefix}-to`} className="text-xs text-gray-400">
          To
        </label>
        <input
          id={`${idPrefix}-to`}
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className={FILTER_CONTROL_CLASSES}
        />
        <label htmlFor={`${idPrefix}-type`} className="text-xs text-gray-400">
          Type
        </label>
        <select
          id={`${idPrefix}-type`}
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
          className={FILTER_CONTROL_CLASSES}
        >
          <option value="">All</option>
          <option value="dine_in">Dine-in</option>
          <option value="takeaway">Takeaway</option>
        </select>
        <label htmlFor={`${idPrefix}-partner`} className="text-xs text-gray-400">
          Partner
        </label>
        <select
          id={`${idPrefix}-partner`}
          value={partner}
          onChange={(e) => onPartnerChange(e.target.value)}
          className={FILTER_CONTROL_CLASSES}
        >
          <option value="">All</option>
          <option value="none">Walk-in</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {extra && (
          <>
            <label htmlFor={extra.id} className="text-xs text-gray-400">
              {extra.label}
            </label>
            <select
              id={extra.id}
              value={extra.value}
              onChange={(e) => extra.onChange(e.target.value)}
              className={FILTER_CONTROL_CLASSES}
            >
              {extra.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        )}
        {children}
      </div>
      {rangeInvalid && (
        <div className="text-red-400 text-sm mt-2">From must be on or before To.</div>
      )}
    </div>
  );
}
