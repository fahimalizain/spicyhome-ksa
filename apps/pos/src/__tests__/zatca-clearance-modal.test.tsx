import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ZatcaClearanceModal } from '../components/orders/ZatcaClearanceModal';
import type { ZatcaBuyerDetails } from '../components/orders/StandardInvoiceBuyerForm';

// ── Mock API client ──────────────────────────────────────────────────────
const mockGetZatcaInvoice = vi.fn();
const mockRetryZatcaClearance = vi.fn();
const mockReissueZatcaInvoice = vi.fn();
const mockGetZatcaCreditNote = vi.fn();
const mockRetryZatcaCreditNoteClearance = vi.fn();
const mockReissueZatcaCreditNote = vi.fn();

vi.mock('../api', () => ({
  client: {
    orders: {
      getZatcaInvoice: (...args: any[]) => mockGetZatcaInvoice(...args),
      retryZatcaClearance: (...args: any[]) => mockRetryZatcaClearance(...args),
      reissueZatcaInvoice: (...args: any[]) => mockReissueZatcaInvoice(...args),
      getZatcaCreditNote: (...args: any[]) => mockGetZatcaCreditNote(...args),
      retryZatcaCreditNoteClearance: (...args: any[]) => mockRetryZatcaCreditNoteClearance(...args),
      reissueZatcaCreditNote: (...args: any[]) => mockReissueZatcaCreditNote(...args),
    },
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────
function makeStatus(status: string, errors: string[] = []) {
  return {
    invoiceType: 'standard',
    current: {
      id: 1,
      attemptNo: 1,
      status,
      icv: 1,
      uuid: 'abc',
      errors,
      warnings: [],
      httpStatus: null,
      createdAt: 0,
      updatedAt: 0,
    },
    attempts: [],
    canRetryClearance: false,
    canReissue: false,
  };
}

function makePendingStatus() {
  return makeStatus('pending');
}

function makeBuyer(overrides: Partial<ZatcaBuyerDetails> = {}): ZatcaBuyerDetails {
  return {
    name: 'Test Co.',
    vatNumber: '300123456789012',
    street: 'King Fahd Road',
    buildingNumber: '7845',
    citySubdivision: 'Al-Olaya',
    city: 'Riyadh',
    postalCode: '12271',
    country: 'SA',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────
describe('ZatcaClearanceModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetZatcaInvoice.mockResolvedValue(makePendingStatus());
    mockRetryZatcaClearance.mockResolvedValue({});
    mockReissueZatcaInvoice.mockResolvedValue({});
    mockGetZatcaCreditNote.mockResolvedValue(makePendingStatus());
    mockRetryZatcaCreditNoteClearance.mockResolvedValue({});
    mockReissueZatcaCreditNote.mockResolvedValue({});
  });

  // ── Invoice mode (default) ────────────────────────────────────────────
  describe('invoice mode (documentType default)', () => {
    describe('mount and clearance polling', () => {
      it('calls getZatcaInvoice and shows "Clearing with ZATCA..." on mount', async () => {
        render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />);

        expect(screen.getByText('Clearing with ZATCA...')).toBeInTheDocument();
        expect(mockGetZatcaInvoice).toHaveBeenCalledWith(1);
      });

      it('shows total in SAR', () => {
        render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />);

        expect(screen.getByText('46.00 SAR')).toBeInTheDocument();
      });

      it('does NOT show "Continue without waiting" button in clearance phase (truly blocking)', () => {
        render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />);

        expect(screen.queryByText('Continue without waiting')).not.toBeInTheDocument();
      });
    });

    describe('cleared status', () => {
      it('shows "Invoice Cleared" and calls onDone after ~1500ms', async () => {
        vi.useFakeTimers();
        const onDone = vi.fn();

        mockGetZatcaInvoice.mockResolvedValue(makeStatus('cleared'));

        render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={onDone} />);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
        });

        expect(screen.getByText('Invoice Cleared')).toBeInTheDocument();
        expect(screen.getByText('Printing tax receipt...')).toBeInTheDocument();
        expect(onDone).not.toHaveBeenCalled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1500);
        });

        expect(onDone).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
      });
    });

    describe('rejected status', () => {
      it('shows rejected UI with Done (Paid), Correct & Reissue, and buyer form', async () => {
        mockGetZatcaInvoice.mockResolvedValue(
          makeStatus('rejected', ['Buyer VAT mismatch', 'Invalid address']),
        );

        render(
          <ZatcaClearanceModal
            orderId={2}
            orderTotalHalalas={2300}
            initialBuyer={makeBuyer()}
            onDone={vi.fn()}
          />,
        );

        await waitFor(() => {
          expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
        });

        expect(screen.getByText('Done (Paid)')).toBeInTheDocument();
        expect(screen.getByText('Correct & Reissue')).toBeInTheDocument();
        expect(screen.getByText('Correct buyer info and reissue:')).toBeInTheDocument();
        // Check buyer form fields are present
        expect(screen.getByPlaceholderText('Company / Legal Name')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('300123456789012')).toBeInTheDocument();
      });

      it('Done (Paid) calls onDone', async () => {
        const onDone = vi.fn();
        mockGetZatcaInvoice.mockResolvedValue(makeStatus('rejected', ['Error']));

        render(
          <ZatcaClearanceModal
            orderId={2}
            orderTotalHalalas={2300}
            initialBuyer={makeBuyer()}
            onDone={onDone}
          />,
        );

        await waitFor(() => {
          expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Done (Paid)'));
        expect(onDone).toHaveBeenCalledTimes(1);
      });

      it('Correct & Reissue calls reissueZatcaInvoice with zatcaBuyerDetails', async () => {
        const buyer = makeBuyer();
        mockGetZatcaInvoice
          .mockResolvedValueOnce(makeStatus('rejected', ['Buyer VAT mismatch']))
          .mockResolvedValue(makePendingStatus());

        render(
          <ZatcaClearanceModal
            orderId={2}
            orderTotalHalalas={2300}
            initialBuyer={buyer}
            onDone={vi.fn()}
          />,
        );

        await waitFor(() => {
          expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Correct & Reissue'));

        expect(mockReissueZatcaInvoice).toHaveBeenCalledWith(2, {
          zatcaBuyerDetails: buyer,
        });
        expect(mockReissueZatcaInvoice).toHaveBeenCalledTimes(1);
      });

      it('Correct & Reissue validates buyer — blocks empty required fields', async () => {
        // Seed with a buyer that has empty name (invalid)
        const seller = makeBuyer({ name: '', vatNumber: '', street: '' });
        mockGetZatcaInvoice
          .mockResolvedValueOnce(makeStatus('rejected', ['Buyer VAT mismatch']))
          .mockResolvedValue(makePendingStatus());

        render(
          <ZatcaClearanceModal
            orderId={2}
            orderTotalHalalas={2300}
            initialBuyer={seller}
            onDone={vi.fn()}
          />,
        );

        await waitFor(() => {
          expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Correct & Reissue'));

        // Should NOT have called reissue — validation blocked it
        expect(mockReissueZatcaInvoice).not.toHaveBeenCalled();

        // Should show validation errors
        await waitFor(() => {
          expect(screen.getByText('name is required')).toBeInTheDocument();
        });
      });

      it('buyer form pre-fills from initialBuyer', async () => {
        const seller = makeBuyer({ name: 'ACME Corp' });
        mockGetZatcaInvoice.mockResolvedValue(makeStatus('rejected', ['Error']));

        render(
          <ZatcaClearanceModal
            orderId={3}
            orderTotalHalalas={4600}
            initialBuyer={seller}
            onDone={vi.fn()}
          />,
        );

        await waitFor(() => {
          expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
        });

        // Name input should be pre-filled with ACME Corp
        const nameInput = screen.getByPlaceholderText('Company / Legal Name') as HTMLInputElement;
        expect(nameInput.value).toBe('ACME Corp');
      });
    });

    describe('error status', () => {
      it('Retry calls retryZatcaClearance', async () => {
        mockGetZatcaInvoice
          .mockResolvedValueOnce(makeStatus('error', []))
          .mockResolvedValue(makePendingStatus());

        render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText('Network Error')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Retry Clearance'));

        expect(mockRetryZatcaClearance).toHaveBeenCalledWith(1);
      });
    });
  });

  // ── Credit note mode ──────────────────────────────────────────────────
  describe('credit_note mode (documentType="credit_note")', () => {
    it('shows "ZATCA Credit Note Clearance" title', () => {
      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={vi.fn()}
        />,
      );

      expect(screen.getByText('ZATCA Credit Note Clearance')).toBeInTheDocument();
    });

    it('polls getZatcaCreditNote instead of getZatcaInvoice', async () => {
      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={vi.fn()}
        />,
      );

      expect(mockGetZatcaCreditNote).toHaveBeenCalledWith(1, 5);
      expect(mockGetZatcaInvoice).not.toHaveBeenCalled();
    });

    it('shows "Credit Note Cleared" on success', async () => {
      mockGetZatcaCreditNote.mockResolvedValue(makeStatus('cleared'));

      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Credit Note Cleared')).toBeInTheDocument();
      });
      expect(screen.getByText('Printing refund receipt...')).toBeInTheDocument();
    });

    it('shows "Credit note rejected by ZATCA" generic rejection message', async () => {
      mockGetZatcaCreditNote.mockResolvedValue(makeStatus('rejected', []));

      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Credit note rejected by ZATCA')).toBeInTheDocument();
      });
    });

    it('shows "Done (Refunded)" button label', async () => {
      mockGetZatcaCreditNote.mockResolvedValue(makeStatus('rejected', ['Error']));

      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Done (Refunded)')).toBeInTheDocument();
      });
    });

    it('Retry calls retryZatcaCreditNoteClearance', async () => {
      mockGetZatcaCreditNote
        .mockResolvedValueOnce(makeStatus('error', []))
        .mockResolvedValue(makePendingStatus());

      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Network Error')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry Clearance'));

      expect(mockRetryZatcaCreditNoteClearance).toHaveBeenCalledWith(1, 5);
    });

    it('Reissue calls reissueZatcaCreditNote', async () => {
      mockGetZatcaCreditNote
        .mockResolvedValueOnce(makeStatus('rejected', ['Error']))
        .mockResolvedValue(makePendingStatus());

      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Reissue'));

      expect(mockReissueZatcaCreditNote).toHaveBeenCalledWith(1, 5);
    });

    it('credit_note rejected does NOT show buyer form or "Correct buyer info"', async () => {
      mockGetZatcaCreditNote.mockResolvedValue(makeStatus('rejected', ['Error']));

      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
      });

      // Should NOT show buyer-related UI
      expect(screen.queryByText('Correct buyer info and reissue:')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Company / Legal Name')).not.toBeInTheDocument();
      expect(screen.queryByText('Correct & Reissue')).not.toBeInTheDocument();

      // Should show plain "Reissue" button
      expect(screen.getByText('Reissue')).toBeInTheDocument();
    });

    it('Done (Refunded) from error state calls onDone', async () => {
      const onDone = vi.fn();
      mockGetZatcaCreditNote.mockResolvedValue(makeStatus('error', []));

      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={onDone}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Done (Refunded)')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Done (Refunded)'));
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('Done (Refunded) from rejected state calls onDone', async () => {
      const onDone = vi.fn();
      mockGetZatcaCreditNote.mockResolvedValue(makeStatus('rejected', ['Error']));

      render(
        <ZatcaClearanceModal
          documentType="credit_note"
          orderId={1}
          refundId={5}
          orderTotalHalalas={4600}
          onDone={onDone}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Done (Refunded)')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Done (Refunded)'));
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────
  describe('timeout after MAX_POLL_COUNT', () => {
    it('shows timeout error after 90 polls', async () => {
      vi.useFakeTimers();

      mockGetZatcaInvoice.mockResolvedValue(makePendingStatus());

      render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      for (let i = 0; i < 90; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
      }

      expect(screen.getByText('Network Error')).toBeInTheDocument();
      expect(
        screen.getByText('Clearance timed out. Check the order details for result.'),
      ).toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe('unmount cleanup', () => {
    it('clears the polling interval on unmount', async () => {
      vi.useFakeTimers();

      mockGetZatcaInvoice.mockResolvedValue(makePendingStatus());

      const { unmount } = render(
        <ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });

      const callCountBeforeUnmount = mockGetZatcaInvoice.mock.calls.length;
      expect(callCountBeforeUnmount).toBeGreaterThanOrEqual(2);

      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(mockGetZatcaInvoice).toHaveBeenCalledTimes(callCountBeforeUnmount);

      vi.useRealTimers();
    });

    it('does not call onDone after unmount when cleared auto-close is pending', async () => {
      vi.useFakeTimers();
      const onDone = vi.fn();

      mockGetZatcaInvoice.mockResolvedValue(makeStatus('cleared'));

      const { unmount } = render(
        <ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={onDone} />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByText('Invoice Cleared')).toBeInTheDocument();
      expect(onDone).not.toHaveBeenCalled();

      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(onDone).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
