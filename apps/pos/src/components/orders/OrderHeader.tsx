/**
 * Order header shared by the Order page cart (compact `cart` variant) and
 * the Orders page detail panel (`detail` variant): document id + status
 * badge + type label + creator name + created time, plus optional notes
 * and prior ZATCA document ids on the detail variant. Order notes are NOT
 * editable here; on the Order page they live in the Items tab footer,
 * pinned above the Total row.
 */

/** Title-case each whitespace-separated word: "john DOE" → "John Doe". */
export function titleCaseName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

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
  /** Read-only order notes (Orders detail). Hidden when null/empty. */
  notes?: string | null;
  /** Prior ZATCA document ids (Orders detail). Hidden when empty. */
  previousDocumentIds?: string[];
  /**
   * Visual density:
   * - 'cart' (default): compact cart column — text-base title, px-3 pt-3 pb-2
   * - 'detail': Orders detail panel — text-lg title, px-4 pt-4 pb-3, bg-gray-900
   */
  variant?: 'cart' | 'detail';
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
  notes,
  previousDocumentIds,
  variant = 'cart',
}: OrderHeaderProps) {
  const displayName = createdByName?.trim() ? titleCaseName(createdByName) : null;
  const isDetail = variant === 'detail';

  return (
    <div
      className={`shrink-0 border-b border-gray-700/80 ${
        isDetail ? 'px-4 pt-4 pb-3 bg-gray-900' : 'px-3 pt-3 pb-2'
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${isDetail ? 'mb-2' : 'mb-1'}`}>
        <h2 className={`font-bold text-white truncate ${isDetail ? 'text-lg' : 'text-base'}`}>
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
            so long partner labels stay usable), name right, title-cased via
            JS (CSS `capitalize` also fails on ALL-CAPS input). Without a
            creator, the type label spans the row alone. */}
        {displayName ? (
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate">{typeLabel}</p>
            <p className="shrink-0 text-right">{displayName}</p>
          </div>
        ) : (
          <p>{typeLabel}</p>
        )}
        {/* createdAt 0 is the interim "not hydrated yet" marker on the create
            path — hide the line until the hydrated order provides a real
            epoch (real epochs are always > 0). */}
        {createdAt != null && createdAt > 0 && <p>{new Date(createdAt * 1000).toLocaleString()}</p>}
        {notes?.trim() && (
          <p className="text-xs text-gray-400 mt-1">
            <span className="text-gray-500">Notes:</span> {notes.trim()}
          </p>
        )}
        {previousDocumentIds && previousDocumentIds.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">Previous: {previousDocumentIds.join(', ')}</p>
        )}
      </div>
    </div>
  );
}
