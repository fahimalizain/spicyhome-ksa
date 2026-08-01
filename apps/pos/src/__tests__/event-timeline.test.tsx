import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OrderEventTimeline } from '../components/OrderEventTimeline';

const mockGetEvents = vi.fn();
const mockVerifyEvents = vi.fn();

vi.mock('../api', () => ({
  client: {
    orders: {
      getEvents: (...args: any[]) => mockGetEvents(...args),
      verifyEvents: (...args: any[]) => mockVerifyEvents(...args),
    },
  },
}));

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orderId: 1,
    eventIdx: 1,
    userId: 1,
    type: 'created',
    payload: JSON.stringify({ type: 'dine_in', tableId: 3 }),
    prevHash: '',
    hash: 'abc123',
    createdAt: 1700000000,
    ...overrides,
  };
}

describe('OrderEventTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockGetEvents.mockReturnValue(new Promise(() => {}));
    render(<OrderEventTimeline orderId={1} />);
    expect(screen.getByText('Loading events...')).toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    mockGetEvents.mockRejectedValue(new Error('Network error'));
    render(<OrderEventTimeline orderId={1} />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows empty state when no events', async () => {
    mockGetEvents.mockResolvedValue([]);
    render(<OrderEventTimeline orderId={1} />);
    await waitFor(() => {
      expect(screen.getByText('No events recorded')).toBeInTheDocument();
    });
  });

  it('renders event labels for known types', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'created',
        payload: JSON.stringify({ type: 'takeaway' }),
      }),
      makeEvent({
        id: 2,
        eventIdx: 2,
        type: 'item_added',
        payload: JSON.stringify({ itemName: 'Burger', qty: 2 }),
      }),
      makeEvent({
        id: 3,
        eventIdx: 3,
        type: 'paid',
        payload: JSON.stringify({ fromStatus: 'open' }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('Order Created')).toBeInTheDocument();
    expect(screen.getByText('Item Added')).toBeInTheDocument();
    expect(screen.getByText('Order Paid')).toBeInTheDocument();
  });

  it('renders events newest-first by eventIdx', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'created',
        payload: JSON.stringify({ type: 'dine_in' }),
      }),
      makeEvent({
        id: 3,
        eventIdx: 3,
        type: 'voided',
        payload: JSON.stringify({ fromStatus: 'open' }),
      }),
      makeEvent({
        id: 2,
        eventIdx: 2,
        type: 'paid',
        payload: JSON.stringify({ fromStatus: 'open' }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    // Get all event label elements by targeting just the label class
    const labels =
      screen.getAllByText('Order Created').length +
      screen.getAllByText('Order Paid').length +
      screen.getAllByText('Order Voided').length;
    expect(labels).toBe(3);

    // Newest first: eventIdx 3 (voided) comes first in DOM
    const labelElements = document.querySelectorAll('.text-xs.font-medium.text-gray-300');
    const labelTexts = Array.from(labelElements).map((el) => el.textContent);
    expect(labelTexts[0]).toBe('Order Voided');
    expect(labelTexts[1]).toBe('Order Paid');
    expect(labelTexts[2]).toBe('Order Created');
  });

  it('shows verify chain button and result', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'created',
        payload: JSON.stringify({ type: 'dine_in' }),
      }),
    ]);
    mockVerifyEvents.mockResolvedValue({ valid: true });

    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    const verifyBtn = screen.getByText('Verify Chain');
    expect(verifyBtn).toBeInTheDocument();

    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(mockVerifyEvents).toHaveBeenCalledWith(1);
      expect(screen.getByText('Chain is valid')).toBeInTheDocument();
    });
  });

  it('shows verify failure result', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'created',
        payload: JSON.stringify({ type: 'dine_in' }),
      }),
    ]);
    mockVerifyEvents.mockResolvedValue({ valid: false, brokenAt: 3 });

    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Verify Chain'));

    await waitFor(() => {
      expect(screen.getByText('Chain broken at eventIdx=3')).toBeInTheDocument();
    });
  });

  it('renders refund event labels', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'refund_issued',
        payload: JSON.stringify({
          refundId: 1,
          items: [{ itemName: 'Burger', qty: 1 }],
          totalHalalas: 2300,
        }),
      }),
      makeEvent({
        id: 2,
        eventIdx: 2,
        type: 'refunded',
        payload: JSON.stringify({ fromStatus: 'paid' }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('Refund Issued')).toBeInTheDocument();
    expect(screen.getByText('Fully Refunded')).toBeInTheDocument();
  });

  it('renders type_changed label with from/to payload (takeaway → dine_in + table)', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'type_changed',
        payload: JSON.stringify({
          fromType: 'takeaway',
          toType: 'dine_in',
          fromTableId: null,
          toTableId: 3,
        }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('Type / Table Changed')).toBeInTheDocument();
    expect(
      screen.getByText('Type / Table Changed. takeaway → dine_in (table — → #3)'),
    ).toBeInTheDocument();
  });

  it('renders type_changed payload for dine_in → takeaway (table released)', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'type_changed',
        payload: JSON.stringify({
          fromType: 'dine_in',
          toType: 'takeaway',
          fromTableId: 3,
          toTableId: null,
        }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Type / Table Changed. dine_in → takeaway (table #3 → —)'),
    ).toBeInTheDocument();
  });

  it('renders ZATCA clearance approved label and payload for invoice', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'zatca_clearance_approved',
        payload: JSON.stringify({
          documentKind: 'invoice',
          zatcaRecordId: 9,
          attemptNo: 2,
          icv: 3,
          uuid: 'uuid-1',
          documentId: 'INV26-0001',
          cbcId: 'INV26-0001',
          orderId: 1,
          httpStatus: 200,
        }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('ZATCA Clearance Approved')).toBeInTheDocument();
    expect(screen.getByText('Invoice INV26-0001 cleared (ICV 3)')).toBeInTheDocument();
  });

  it('renders ZATCA clearance approved label and payload for credit note', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'zatca_clearance_approved',
        payload: JSON.stringify({
          documentKind: 'credit_note',
          icv: 4,
          documentId: 'REF26-0001',
          cbcId: 'REF26-0001',
          orderId: 1,
          refundId: 7,
        }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('ZATCA Clearance Approved')).toBeInTheDocument();
    expect(screen.getByText('Credit note REF26-0001 cleared (ICV 4)')).toBeInTheDocument();
  });

  it('renders ZATCA clearance rejected label and payload with short error snippet', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'zatca_clearance_rejected',
        payload: JSON.stringify({
          documentKind: 'credit_note',
          icv: 5,
          documentId: 'REF26-0002',
          cbcId: 'REF26-0002',
          orderId: 1,
          refundId: 8,
          httpStatus: 400,
          errors: ['Invalid credit note'],
        }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('ZATCA Clearance Rejected')).toBeInTheDocument();
    expect(
      screen.getByText('Credit note REF26-0002 rejected (ICV 5) — Invalid credit note'),
    ).toBeInTheDocument();
  });

  it('renders ZATCA clearance rejected payload without error snippet when errors are long', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'zatca_clearance_rejected',
        payload: JSON.stringify({
          documentKind: 'invoice',
          icv: 6,
          documentId: 'INV26-0003',
          cbcId: 'INV26-0003',
          orderId: 1,
          errors: [
            'This is a very long ZATCA validation error message that exceeds sixty characters in length',
          ],
        }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('ZATCA Clearance Rejected')).toBeInTheDocument();
    expect(screen.getByText('Invoice INV26-0003 rejected (ICV 6)')).toBeInTheDocument();
  });

  it('renders ZATCA clearance rejected payload with cbcId fallback when documentId is missing', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'zatca_clearance_rejected',
        payload: JSON.stringify({ icv: 7, cbcId: 'INV26-0004', orderId: 1, errors: [] }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('ZATCA Clearance Rejected')).toBeInTheDocument();
    // Missing documentKind is treated as invoice
    expect(screen.getByText('Invoice INV26-0004 rejected (ICV 7)')).toBeInTheDocument();
  });

  it('shows warning for broken print chain', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'kitchen_print_enqueued',
        payload: JSON.stringify({ printer: 'Kitchen' }),
      }),
      // No kitchen_print_succeeded after
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('Kitchen Print Queued')).toBeInTheDocument();
    // Warning icon should be present
    expect(screen.getByText('\u26a0')).toBeInTheDocument();
  });

  it('does not show warning when print has succeeded event', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'kitchen_print_enqueued',
        payload: JSON.stringify({ printer: 'Kitchen' }),
      }),
      makeEvent({
        id: 2,
        eventIdx: 2,
        type: 'kitchen_print_succeeded',
        payload: JSON.stringify({ printer: 'Kitchen' }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('Kitchen Print Queued')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Print OK')).toBeInTheDocument();
    // No warning icon
    expect(screen.queryByText('\u26a0')).not.toBeInTheDocument();
  });

  it('renders delivery_partner_changed with titles, refs and reset count', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'delivery_partner_changed',
        payload: JSON.stringify({
          fromPartnerId: 'hungerstation',
          toPartnerId: 'keeta',
          fromPartnerTitle: 'HungerStation',
          toPartnerTitle: 'Keeta',
          fromExternalRef: 'HS-1',
          toExternalRef: 'K-2',
          resetItemCount: 0,
        }),
      }),
      makeEvent({
        id: 2,
        eventIdx: 2,
        type: 'delivery_partner_changed',
        payload: JSON.stringify({
          fromPartnerId: 'keeta',
          toPartnerId: null,
          fromPartnerTitle: 'Keeta',
          toPartnerTitle: null,
          fromExternalRef: 'K-2',
          toExternalRef: null,
          resetItemCount: 3,
        }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Delivery Partner Changed')).toHaveLength(2);
    expect(
      screen.getByText('Delivery Partner Changed. HungerStation → Keeta · Ref HS-1 → K-2'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Delivery Partner Changed. Keeta → None · Ref K-2 → — · 3 prices reset'),
    ).toBeInTheDocument();
  });

  it('renders item_price_reset with prices and reason', async () => {
    mockGetEvents.mockResolvedValue([
      makeEvent({
        id: 1,
        eventIdx: 1,
        type: 'item_price_reset',
        payload: JSON.stringify({
          orderItemId: 101,
          itemId: 5,
          fromUnitPriceHalalas: 2500,
          toUnitPriceHalalas: 2300,
          reason: 'partner_cleared',
        }),
      }),
      makeEvent({
        id: 2,
        eventIdx: 2,
        type: 'item_price_reset',
        payload: JSON.stringify({
          orderItemId: 102,
          itemId: 6,
          fromUnitPriceHalalas: 3000,
          toUnitPriceHalalas: 2300,
          reason: 'type_changed_to_dine_in',
        }),
      }),
    ]);
    render(<OrderEventTimeline orderId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Item Price Reset')).toHaveLength(2);
    expect(
      screen.getByText('Item Price Reset: 25.00 → 23.00 SAR (partner cleared)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Item Price Reset: 30.00 → 23.00 SAR (order type changed to dine-in)'),
    ).toBeInTheDocument();
  });
});
