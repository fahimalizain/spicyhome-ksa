/**
 * Helpers for reading the immutable order_events ledger in the POS.
 */

export interface OrderEventLike {
  type: string;
  payload: string;
}

/**
 * Collect previously burned invoice document IDs from an order's event
 * ledger. When standard-invoice clearance is rejected, the burned business
 * document number (UBL root cbc:ID) is recorded on
 * `zatca_clearance_rejected` events and `orders.document_id` is rotated to a
 * fresh number. The current (accepted) document ID is excluded so the UI
 * shows only prior numbers.
 *
 * Events missing `documentKind` are treated as invoices (legacy rows).
 * `documentId` and `cbcId` carry the same value; `cbcId` is used as fallback.
 * Duplicates are collapsed, preserving event order.
 */
export function getPreviousInvoiceDocumentIds(
  events: OrderEventLike[],
  currentDocumentId: string | null | undefined,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const event of events) {
    if (event.type !== 'zatca_clearance_rejected') continue;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(event.payload);
    } catch {
      continue;
    }
    if (payload.documentKind != null && payload.documentKind !== 'invoice') continue;
    let docId: string | null = null;
    if (typeof payload.documentId === 'string' && payload.documentId) {
      docId = payload.documentId;
    } else if (typeof payload.cbcId === 'string' && payload.cbcId) {
      docId = payload.cbcId;
    }
    if (!docId) continue;
    if (currentDocumentId && docId === currentDocumentId) continue;
    if (seen.has(docId)) continue;
    seen.add(docId);
    result.push(docId);
  }
  return result;
}
