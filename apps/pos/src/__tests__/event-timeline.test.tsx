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
});
