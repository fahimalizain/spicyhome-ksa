import { useState, useEffect, useRef } from 'react';
import { halalasToSar } from '@spicyhome/shared';
import { client } from '../../api';
import type { ZatcaInvoiceStatusResponse } from '@spicyhome/client-ts';
import {
  StandardInvoiceBuyerForm,
  emptyStandardInvoiceBuyer,
  validateStandardBuyer,
  type ZatcaBuyerDetails,
} from './StandardInvoiceBuyerForm';

type ClearancePhase = 'clearance' | 'cleared' | 'rejected' | 'error';

export type ZatcaClearanceModalProps = {
  orderId: number;
  orderTotalHalalas: number;
  /**
   * 'invoice' for pay clearance (default), 'credit_note' for refund clearance.
   */
  documentType?: 'invoice' | 'credit_note';
  /** Required when documentType === 'credit_note' */
  refundId?: number;
  /** Required for invoice mode — seeded from PayModal buyer form. */
  initialBuyer?: ZatcaBuyerDetails;
  /**
   * Called when user dismisses after payment/refund is already committed,
   * or after auto-close on successful clearance.
   * Parent should refresh order + close the parent panel.
   */
  onDone: () => void;
};

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_COUNT = 90; // ~90s

export function ZatcaClearanceModal({
  orderId,
  orderTotalHalalas,
  documentType = 'invoice',
  refundId,
  initialBuyer,
  onDone,
}: ZatcaClearanceModalProps) {
  const [clearancePhase, setClearancePhase] = useState<ClearancePhase>('clearance');
  const [clearanceStatus, setClearanceStatus] = useState<ZatcaInvoiceStatusResponse | null>(null);
  const [clearanceError, setClearanceError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Buyer re-edit state (invoice mode only)
  const [buyer, setBuyer] = useState<ZatcaBuyerDetails>(() =>
    initialBuyer ? { ...initialBuyer } : emptyStandardInvoiceBuyer(),
  );
  const [buyerErrors, setBuyerErrors] = useState<Partial<Record<keyof ZatcaBuyerDetails, string>>>(
    {},
  );

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCreditNote = documentType === 'credit_note';

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  async function pollOnce() {
    pollCountRef.current++;
    if (pollCountRef.current > MAX_POLL_COUNT) {
      stopPolling();
      setClearanceError('Clearance timed out. Check the order details for result.');
      setClearancePhase('error');
      return;
    }

    try {
      const status: ZatcaInvoiceStatusResponse = isCreditNote
        ? await client.orders.getZatcaCreditNote(orderId, refundId!)
        : await client.orders.getZatcaInvoice(orderId);
      setClearanceStatus(status);
      const current = status.current;

      if (current?.status === 'cleared') {
        stopPolling();
        setClearancePhase('cleared');
        doneTimeoutRef.current = setTimeout(() => {
          doneTimeoutRef.current = null;
          onDone();
        }, 1500);
      } else if (current?.status === 'rejected') {
        stopPolling();
        setClearancePhase('rejected');
        if (current.errors.length > 0) {
          setClearanceError('');
        } else {
          setClearanceError(
            isCreditNote ? 'Credit note rejected by ZATCA' : 'Invoice rejected by ZATCA',
          );
        }
      } else if (current?.status === 'error') {
        stopPolling();
        setClearancePhase('error');
        if (current.errors.length > 0) {
          setClearanceError('');
        } else {
          setClearanceError('Network or clearance error');
        }
      }
    } catch {
      // Polling error — continue polling
    }
  }

  function startClearancePolling() {
    stopPolling();
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }
    pollCountRef.current = 0;
    setClearancePhase('clearance');

    // Run one immediate fetch before starting the interval
    pollOnce();

    pollingRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
  }

  // Start polling on mount
  useEffect(() => {
    startClearancePolling();
    return () => {
      stopPolling();
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current);
        doneTimeoutRef.current = null;
      }
    };
    // mount-only: start clearance polling
  }, []);

  async function handleRetryClearance() {
    stopPolling();
    setActionLoading(true);
    setClearanceError('');
    try {
      if (isCreditNote) {
        await client.orders.retryZatcaCreditNoteClearance(orderId, refundId!);
      } else {
        await client.orders.retryZatcaClearance(orderId);
      }
      setActionLoading(false);
      startClearancePolling();
    } catch (e: any) {
      setActionLoading(false);
      setClearanceError(e.message || 'Retry failed');
      setClearancePhase('error');
    }
  }

  async function handleReissue() {
    stopPolling();

    // Validate buyer before reissuing (invoice mode only)
    if (!isCreditNote) {
      const fieldErrors = validateStandardBuyer(buyer);
      if (Object.keys(fieldErrors).length > 0) {
        setBuyerErrors(fieldErrors);
        return;
      }
    }

    setActionLoading(true);
    setClearanceError('');
    setBuyerErrors({});
    try {
      if (isCreditNote) {
        await client.orders.reissueZatcaCreditNote(orderId, refundId!);
      } else {
        await client.orders.reissueZatcaInvoice(orderId, {
          zatcaBuyerDetails: buyer,
        });
      }
      setActionLoading(false);
      startClearancePolling();
    } catch (e: any) {
      setActionLoading(false);
      setClearanceError(e.message || 'Reissue failed');
    }
  }

  function handleDismiss() {
    stopPolling();
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }
    onDone();
  }

  const rejectionErrors =
    clearancePhase === 'rejected' && clearanceStatus?.current?.errors
      ? clearanceStatus.current.errors
      : [];
  const networkErrors =
    clearancePhase === 'error' && clearanceStatus?.current?.errors
      ? clearanceStatus.current.errors
      : [];

  const clearedTitle = isCreditNote ? 'Credit Note Cleared' : 'Invoice Cleared';
  const clearedSubtext = isCreditNote ? 'Printing refund receipt...' : 'Printing tax receipt...';
  const doneButtonLabel = isCreditNote ? 'Done (Refunded)' : 'Done (Paid)';
  const rejectedTitle = 'Clearance Rejected';
  const rejectedGeneric = isCreditNote
    ? 'Credit note rejected by ZATCA'
    : 'Invoice rejected by ZATCA';
  const reissueButtonLabel = isCreditNote ? 'Reissue' : 'Correct & Reissue';
  const isInvoiceRejected = !isCreditNote && clearancePhase === 'rejected';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div
        className={`bg-gray-900 rounded-xl p-4 max-h-[90vh] overflow-y-auto ${isInvoiceRejected ? 'w-[520px]' : 'w-[420px]'}`}
      >
        <h2 className="text-lg font-bold text-white mb-3">
          {isCreditNote ? 'ZATCA Credit Note Clearance' : 'ZATCA Clearance'}
        </h2>

        <div className="flex justify-between items-center bg-gray-800 rounded-lg p-3 mb-3">
          <span className="text-sm text-gray-400">Total</span>
          <span className="text-xl font-bold text-white">
            {halalasToSar(orderTotalHalalas)} SAR
          </span>
        </div>

        {clearancePhase === 'clearance' && (
          <div className="text-center py-6">
            <div className="animate-pulse text-brand-400 text-lg mb-2">Clearing with ZATCA...</div>
            <div className="text-sm text-gray-500">Please wait, this may take a few seconds</div>
          </div>
        )}

        {clearancePhase === 'cleared' && (
          <div className="text-center py-6">
            <div className="text-green-400 text-lg mb-2">{clearedTitle}</div>
            <div className="text-sm text-gray-400">{clearedSubtext}</div>
          </div>
        )}

        {clearancePhase === 'rejected' && (
          <div className="space-y-3">
            <div className="bg-red-900/40 border border-red-700 rounded-lg p-3">
              <div className="text-red-400 font-medium text-sm mb-2">{rejectedTitle}</div>
              {clearanceError && (
                <div className="text-red-300 text-xs whitespace-pre-wrap">{clearanceError}</div>
              )}
              {rejectionErrors.map((e: string, i: number) => (
                <div key={i} className="text-red-300 text-xs mt-1">
                  {e}
                </div>
              ))}
            </div>

            {/* Buyer re-edit form (invoice mode only) */}
            {!isCreditNote && (
              <div className="border-t border-gray-700 pt-3">
                <div className="text-sm text-gray-300 mb-2">Correct buyer info and reissue:</div>
                <StandardInvoiceBuyerForm
                  value={buyer}
                  onChange={(next) => {
                    setBuyer(next);
                    setBuyerErrors({});
                  }}
                  disabled={actionLoading}
                  errors={buyerErrors}
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="flex-1 touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
              >
                {doneButtonLabel}
              </button>
              <button
                type="button"
                onClick={handleReissue}
                disabled={actionLoading}
                className="flex-1 touch-target bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
              >
                {actionLoading ? 'Reissuing...' : reissueButtonLabel}
              </button>
            </div>
          </div>
        )}

        {clearancePhase === 'error' && (
          <div className="space-y-3">
            <div className="bg-amber-900/40 border border-amber-700 rounded-lg p-3">
              <div className="text-amber-400 font-medium text-sm mb-2">Network Error</div>
              {clearanceError && (
                <div className="text-amber-300 text-xs whitespace-pre-wrap">{clearanceError}</div>
              )}
              {networkErrors.map((e: string, i: number) => (
                <div key={i} className="text-amber-300 text-xs mt-1">
                  {e}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="flex-1 touch-target bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 py-3"
              >
                {doneButtonLabel}
              </button>
              <button
                type="button"
                onClick={handleRetryClearance}
                disabled={actionLoading}
                className="flex-1 touch-target bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
              >
                {actionLoading ? 'Retrying...' : 'Retry Clearance'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
