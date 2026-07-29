import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ZatcaClearanceModal } from '../components/orders/ZatcaClearanceModal';

// ── Mock API client ──────────────────────────────────────────────────────
const mockGetZatcaInvoice = vi.fn();
const mockRetryZatcaClearance = vi.fn();
const mockReissueZatcaInvoice = vi.fn();

vi.mock('../api', () => ({
  client: {
    orders: {
      getZatcaInvoice: (...args: any[]) => mockGetZatcaInvoice(...args),
      retryZatcaClearance: (...args: any[]) => mockRetryZatcaClearance(...args),
      reissueZatcaInvoice: (...args: any[]) => mockReissueZatcaInvoice(...args),
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

// ── Tests ────────────────────────────────────────────────────────────────
describe('ZatcaClearanceModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetZatcaInvoice.mockResolvedValue(makePendingStatus());
    mockRetryZatcaClearance.mockResolvedValue({});
    mockReissueZatcaInvoice.mockResolvedValue({});
  });

  describe('mount and clearance polling', () => {
    it('calls getZatcaInvoice and shows "Clearing with ZATCA..." on mount', async () => {
      render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />);

      // The clearing phase text appears immediately (initial state is 'clearance')
      expect(screen.getByText('Clearing with ZATCA...')).toBeInTheDocument();
      // getZatcaInvoice is called synchronously from pollOnce (before await)
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

      // First poll returns cleared
      mockGetZatcaInvoice.mockResolvedValue(makeStatus('cleared'));

      render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={onDone} />);

      // Advance timers to let the immediate pollOnce resolve and the interval tick
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Should show cleared text
      expect(screen.getByText('Invoice Cleared')).toBeInTheDocument();
      expect(screen.getByText('Printing tax receipt...')).toBeInTheDocument();

      // onDone should NOT have been called yet (1500ms delay)
      expect(onDone).not.toHaveBeenCalled();

      // Advance past 1500ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(onDone).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('rejected status', () => {
    it('shows rejected UI with errors, Done (Paid) and Reissue buttons', async () => {
      mockGetZatcaInvoice.mockResolvedValue(
        makeStatus('rejected', ['Buyer VAT mismatch', 'Invalid address']),
      );

      render(<ZatcaClearanceModal orderId={2} orderTotalHalalas={2300} onDone={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
      });

      expect(screen.getByText('Buyer VAT mismatch')).toBeInTheDocument();
      expect(screen.getByText('Invalid address')).toBeInTheDocument();

      // Should show Done and Reissue buttons (NO buyer form)
      expect(screen.getByText('Done (Paid)')).toBeInTheDocument();
      expect(screen.getByText('Reissue')).toBeInTheDocument();
      // No buyer form label
      expect(screen.queryByText('Correct buyer info and reissue:')).not.toBeInTheDocument();
    });

    it('Reissue calls reissueZatcaInvoice WITHOUT buyer body', async () => {
      mockGetZatcaInvoice
        .mockResolvedValueOnce(makeStatus('rejected', ['Buyer VAT mismatch']))
        // After reissue, the polling resumes and gets a pending response
        .mockResolvedValue(makePendingStatus());

      render(<ZatcaClearanceModal orderId={2} orderTotalHalalas={2300} onDone={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
      });

      // Click Reissue
      fireEvent.click(screen.getByText('Reissue'));

      // Check that reissue was called WITHOUT buyer body
      expect(mockReissueZatcaInvoice).toHaveBeenCalledWith(2);
      // Should not pass a second argument (buyer body)
      expect(mockReissueZatcaInvoice).toHaveBeenCalledTimes(1);
    });

    it('Done (Paid) calls onDone', async () => {
      const onDone = vi.fn();

      mockGetZatcaInvoice.mockResolvedValue(makeStatus('rejected', ['Error']));

      render(<ZatcaClearanceModal orderId={2} orderTotalHalalas={2300} onDone={onDone} />);

      await waitFor(() => {
        expect(screen.getByText('Clearance Rejected')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Done (Paid)'));

      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('shows generic rejection message when no errors from ZATCA', async () => {
      mockGetZatcaInvoice.mockResolvedValue(makeStatus('rejected', []));

      render(<ZatcaClearanceModal orderId={3} orderTotalHalalas={1150} onDone={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Invoice rejected by ZATCA')).toBeInTheDocument();
      });
    });
  });

  describe('error status', () => {
    it('shows error UI with Retry button that calls retryZatcaClearance', async () => {
      const onDone = vi.fn();

      // First poll: error
      mockGetZatcaInvoice
        .mockResolvedValueOnce(makeStatus('error', []))
        // After retry, resume polling with a pending response
        .mockResolvedValue(makePendingStatus());

      render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={onDone} />);

      await waitFor(() => {
        expect(screen.getByText('Network Error')).toBeInTheDocument();
      });

      expect(screen.getByText('Network or clearance error')).toBeInTheDocument();
      expect(screen.getByText('Done (Paid)')).toBeInTheDocument();
      expect(screen.getByText('Retry Clearance')).toBeInTheDocument();

      // Click Retry
      fireEvent.click(screen.getByText('Retry Clearance'));

      expect(mockRetryZatcaClearance).toHaveBeenCalledWith(1);

      // After retry, polling resumes — verify getZatcaInvoice is called again
      await waitFor(() => {
        expect(mockGetZatcaInvoice).toHaveBeenCalledTimes(2);
      });
    });

    it('Done (Paid) from error state calls onDone', async () => {
      const onDone = vi.fn();

      mockGetZatcaInvoice.mockResolvedValue(makeStatus('error', []));

      render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={onDone} />);

      await waitFor(() => {
        expect(screen.getByText('Network Error')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Done (Paid)'));

      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('shows error details from ZATCA when present', async () => {
      mockGetZatcaInvoice.mockResolvedValue(
        makeStatus('error', ['Connection timeout', 'Server unreachable']),
      );

      render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Network Error')).toBeInTheDocument();
      });

      // ZATCA error details are displayed
      expect(screen.getByText('Connection timeout')).toBeInTheDocument();
      expect(screen.getByText('Server unreachable')).toBeInTheDocument();
    });
  });

  describe('timeout after MAX_POLL_COUNT', () => {
    it('shows timeout error after 90 polls', async () => {
      vi.useFakeTimers();

      // Keep returning pending for every poll
      mockGetZatcaInvoice.mockResolvedValue(makePendingStatus());

      render(<ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />);

      // Flush the first immediate poll (pollCount becomes 1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Advance 90 more seconds (one per poll). After 90 interval ticks,
      // pollCount reaches 91, which is > MAX_POLL_COUNT (90), triggering timeout.
      for (let i = 0; i < 90; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
      }

      // Should hit MAX_POLL_COUNT and show timeout error
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

      // Return pending to keep polling alive
      mockGetZatcaInvoice.mockResolvedValue(makePendingStatus());

      const { unmount } = render(
        <ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={vi.fn()} />,
      );

      // Let the first poll resolve and setInterval fire once
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });

      const callCountBeforeUnmount = mockGetZatcaInvoice.mock.calls.length;
      expect(callCountBeforeUnmount).toBeGreaterThanOrEqual(2); // pollOnce + 1 interval

      // Unmount
      unmount();

      // Advance more time — no more calls should happen
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(mockGetZatcaInvoice).toHaveBeenCalledTimes(callCountBeforeUnmount);

      vi.useRealTimers();
    });

    it('does not call onDone after unmount when cleared auto-close is pending', async () => {
      vi.useFakeTimers();
      const onDone = vi.fn();

      // First poll returns cleared, triggering a 1500ms auto-close
      mockGetZatcaInvoice.mockResolvedValue(makeStatus('cleared'));

      const { unmount } = render(
        <ZatcaClearanceModal orderId={1} orderTotalHalalas={4600} onDone={onDone} />,
      );

      // Let the immediate pollOnce resolve (cleared → setTimeout(1500))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByText('Invoice Cleared')).toBeInTheDocument();
      expect(onDone).not.toHaveBeenCalled();

      // Unmount before the 1500ms auto-close fires
      unmount();

      // Advance past 1500ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      // onDone must NOT have been called — the timeout was cleared on unmount
      expect(onDone).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
