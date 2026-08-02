/**
 * Cart/order header on the Order page — modeled on the Orders page detail
 * header (document id + status badge + type label + created time), compacted
 * for the `w-80` cart column. Order notes are NOT part of this header; they
 * live in the Items tab footer, pinned above the Total row.
 */
export type OrderHeaderProps = {
  /** null/undefined → "New Order" */
  documentId?: string | null;
  /** null/undefined → no status badge */
  status?: string | null;
  /** Human type label from formatOrderTypeLabel, or a pre-create fallback */
  typeLabel: string;
  /** Unix seconds; null/undefined/0 → hide the created-at line */
  createdAt?: number | null;
  /** Resolved creator display name; null/undefined/empty → hide the creator name */
  createdByName?: string | null;
  /** Show amber "Unsent changes" when the cart is dirty */
  isDirty?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  paid: 'Paid',
  voided: 'Voided',
  refunded: 'Refunded',
};

export function OrderHeader({
  documentId,
  status,
  typeLabel,
  createdAt,
  createdByName,
  isDirty,
}: OrderHeaderProps) {
  return (
    <div className="shrink-0 px-3 pt-3 pb-2 border-b border-gray-700/80">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-base font-bold text-white truncate">
          {documentId ? `Order ${documentId}` : 'New Order'}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {isDirty && <span className="text-xs text-amber-400">Unsent changes</span>}
          {status && (
            <span className={`px-2 py-1 rounded text-xs font-bold status-${status}`}>
              {STATUS_LABELS[status] || status}
            </span>
          )}
        </div>
      </div>
      <div className="text-sm text-gray-400">
        {/* Type label and creator name share one row: type left (truncating
            so long partner labels stay usable), name right, capitalized via
            CSS. Without a creator, the type label spans the row alone. */}
        {createdByName ? (
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate">{typeLabel}</p>
            <p className="shrink-0 text-right capitalize">{createdByName}</p>
          </div>
        ) : (
          <p>{typeLabel}</p>
        )}
        {/* createdAt 0 is the interim "not hydrated yet" marker on the create
            path — hide the line until the hydrated order provides a real
            epoch (real epochs are always > 0). */}
        {createdAt != null && createdAt > 0 && <p>{new Date(createdAt * 1000).toLocaleString()}</p>}
      </div>
    </div>
  );
}
