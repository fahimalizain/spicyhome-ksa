import { useState, useEffect } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../api';
import type { OrderEventResponse } from '@spicyhome/client-ts';

interface OrderEventTimelineProps {
  orderId: number;
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Order Created',
  item_added: 'Item Added',
  item_updated: 'Item Updated',
  item_removed: 'Item Removed',
  kitchen_print_enqueued: 'Kitchen Print Queued',
  kitchen_print_succeeded: 'Kitchen Print OK',
  receipt_print_enqueued: 'Receipt Print Queued',
  receipt_print_succeeded: 'Receipt Print OK',
  paid: 'Order Paid',
  voided: 'Order Voided',
  refund_issued: 'Refund Issued',
  refunded: 'Fully Refunded',
  type_changed: 'Type / Table Changed',
  notes_changed: 'Order Notes Changed',
  delivery_partner_changed: 'Delivery Partner Changed',
  item_price_reset: 'Item Price Reset',
  item_price_overridden: 'Item Price Overridden',
  zatca_clearance_rejected: 'ZATCA Clearance Rejected',
  zatca_clearance_approved: 'ZATCA Clearance Approved',
};

function parsePayload(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function formatPayload(event: OrderEventResponse): string {
  const p = parsePayload(event.payload);
  const label = EVENT_LABELS[event.type] || event.type;

  switch (event.type) {
    case 'created':
      return `${label}. Type: ${p.type || '?'}`;
    case 'item_added':
      return `${p.itemName || '?'} ×${p.qty || '?'} added`;
    case 'item_updated': {
      const oldQty = p.oldQty ?? '?';
      const newQty = p.newQty ?? '?';
      const printed =
        (p.kitchenPrintedQty as number) > 0 ? ` (printed ${p.kitchenPrintedQty})` : '';
      return `${p.itemName || '?'}: ${oldQty} → ${newQty}${printed}`;
    }
    case 'item_removed':
      return `${p.itemName || '?'} removed (was ×${p.oldQty ?? '?'})`;
    case 'kitchen_print_enqueued': {
      // Fan-out payload (TEMPORARY): printers[] lists every target; fall back
      // to the legacy single-printer `printer` string for historical events.
      const fanout = Array.isArray(p.printers)
        ? (p.printers as Array<Record<string, unknown>>)
        : [];
      const names = fanout
        .map((pr) => (typeof pr?.printer === 'string' ? pr.printer : ''))
        .filter((n) => n.length > 0);
      const printerLabel = names.length > 0 ? names.join(', ') : (p.printer as string) || '?';
      return `${label}. Printer: ${printerLabel}`;
    }
    case 'kitchen_print_succeeded':
    case 'receipt_print_enqueued':
    case 'receipt_print_succeeded':
      return `${label}. Printer: ${p.printer || '?'}`;
    case 'paid':
      return `${label}. From: ${p.fromStatus || '?'}`;
    case 'voided': {
      // #153: reason is required on new voids; historical voids without one
      // still render cleanly.
      const reason = typeof p.reason === 'string' && p.reason.trim() ? p.reason.trim() : null;
      return reason
        ? `${label}. From: ${p.fromStatus || '?'}. Reason: ${reason}`
        : `${label}. From: ${p.fromStatus || '?'}`;
    }
    case 'refund_issued': {
      const items = Array.isArray(p.items) ? p.items : [];
      const itemNames = items
        .map((i: Record<string, unknown>) => `${i.itemName} ×${i.qty}`)
        .join(', ');
      return `${label}: ${itemNames || '?'}. Total: ${halalasToSar(Number(p.totalHalalas) || 0)} SAR`;
    }
    case 'refunded':
      return `${label}. From: ${p.fromStatus || '?'}`;
    case 'type_changed': {
      const fromTable = p.fromTableId != null ? `#${p.fromTableId}` : '—';
      const toTable = p.toTableId != null ? `#${p.toTableId}` : '—';
      return `${label}. ${p.fromType || '?'} → ${p.toType || '?'} (table ${fromTable} → ${toTable})`;
    }
    case 'notes_changed': {
      // Order-level notes: "—" renders null (no notes)
      const from = (p.fromNotes as string) || '—';
      const to = (p.toNotes as string) || '—';
      return `${label}. ${from} → ${to}`;
    }
    case 'delivery_partner_changed': {
      const from = p.fromPartnerTitle || 'None';
      const to = p.toPartnerTitle || 'None';
      let text = `${label}. ${from} → ${to}`;
      if (p.fromExternalRef || p.toExternalRef) {
        text += ` · Ref ${p.fromExternalRef || '—'} → ${p.toExternalRef || '—'}`;
      }
      if (typeof p.resetItemCount === 'number' && p.resetItemCount > 0) {
        text += ` · ${p.resetItemCount} price${p.resetItemCount === 1 ? '' : 's'} reset`;
      }
      return text;
    }
    case 'item_price_reset': {
      const reason =
        p.reason === 'type_changed_to_dine_in'
          ? 'order type changed to dine-in'
          : 'partner cleared';
      return `${label}: ${halalasToSar(Number(p.fromUnitPriceHalalas) || 0)} → ${halalasToSar(
        Number(p.toUnitPriceHalalas) || 0,
      )} SAR (${reason})`;
    }
    case 'item_price_overridden': {
      return `${label}: ${halalasToSar(Number(p.fromUnitPriceHalalas) || 0)} → ${halalasToSar(
        Number(p.toUnitPriceHalalas) || 0,
      )} SAR (floor ${halalasToSar(Number(p.floorPriceHalalas) || 0)} SAR)`;
    }
    case 'zatca_clearance_approved': {
      const doc = (p.documentId || p.cbcId || '?') as string;
      const kind = p.documentKind === 'credit_note' ? 'Credit note' : 'Invoice';
      return `${kind} ${doc} cleared (ICV ${p.icv ?? '?'})`;
    }
    case 'zatca_clearance_rejected': {
      const doc = (p.documentId || p.cbcId || '?') as string;
      const kind = p.documentKind === 'credit_note' ? 'Credit note' : 'Invoice';
      let text = `${kind} ${doc} rejected (ICV ${p.icv ?? '?'})`;
      const errors = Array.isArray(p.errors) ? (p.errors as string[]) : [];
      const firstError = errors.find((e) => typeof e === 'string' && e.length > 0);
      if (firstError && firstError.length <= 60) {
        text += ` — ${firstError}`;
      }
      return text;
    }
    default:
      return label;
  }
}

/** Check if a print event has a matching succeeded event later in the chain */
function isBrokenPrint(event: OrderEventResponse, allEvents: OrderEventResponse[]): boolean {
  if (event.type === 'kitchen_print_enqueued') {
    // Check if there's a kitchen_print_succeeded after this event
    const hasSucceeded = allEvents.some(
      (e) => e.eventIdx > event.eventIdx && e.type === 'kitchen_print_succeeded',
    );
    return !hasSucceeded;
  }
  if (event.type === 'receipt_print_enqueued') {
    const hasSucceeded = allEvents.some(
      (e) => e.eventIdx > event.eventIdx && e.type === 'receipt_print_succeeded',
    );
    return !hasSucceeded;
  }
  return false;
}

export function OrderEventTimeline({ orderId }: OrderEventTimelineProps) {
  const [events, setEvents] = useState<OrderEventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyValid, setVerifyValid] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client.orders
      .getEvents(orderId)
      .then((res) => {
        if (cancelled) return;
        // Sort newest first
        const sorted = [...res].sort((a, b) => b.eventIdx - a.eventIdx);
        setEvents(sorted);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message || 'Failed to load events');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function handleVerify() {
    setVerifying(true);
    setVerifyResult(null);
    setVerifyValid(null);
    try {
      const res = await client.orders.verifyEvents(orderId);
      const brokenAt = (res as { valid: boolean; brokenAt?: number }).brokenAt;
      setVerifyResult(res.valid ? 'Chain is valid' : `Chain broken at eventIdx=${brokenAt ?? '?'}`);
      setVerifyValid(res.valid);
    } catch (e: any) {
      setVerifyResult(`Verify failed: ${e.message}`);
      setVerifyValid(false);
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return <div className="text-xs text-gray-500 py-2">Loading events...</div>;
  }

  if (error) {
    return <div className="text-xs text-red-400 py-2">{error}</div>;
  }

  if (events.length === 0) {
    return <div className="text-xs text-gray-500 py-2">No events recorded</div>;
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300">Event Timeline</h3>
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="touch-target px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-xs text-gray-300"
        >
          {verifying ? 'Verifying...' : 'Verify Chain'}
        </button>
      </div>

      {verifyResult && (
        <div
          className={`text-xs mb-2 px-2 py-1 rounded ${
            verifyValid ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
          }`}
        >
          {verifyResult}
        </div>
      )}

      <div className="space-y-1">
        {events.map((event) => {
          const broken = isBrokenPrint(event, events);
          return (
            <div
              key={event.id}
              className="bg-gray-800 rounded-lg p-2 flex justify-between items-start"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-gray-300 whitespace-nowrap">
                    {EVENT_LABELS[event.type] || event.type}
                  </span>
                  {broken && (
                    <span title="Missing print succeeded event" className="text-yellow-500 text-xs">
                      ⚠
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 break-all">{formatPayload(event)}</div>
              </div>
              <span className="text-xs text-gray-600 ml-2 whitespace-nowrap">
                {new Date(event.createdAt * 1000).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
