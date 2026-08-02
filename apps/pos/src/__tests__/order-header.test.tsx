import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderHeader } from '../components/orders/OrderHeader';

describe('OrderHeader', () => {
  it('new order: shows "New Order" and the type label, no status/created/creator', () => {
    render(<OrderHeader documentId={null} status={null} typeLabel="Dine-in" />);

    expect(screen.getByText('New Order')).toBeInTheDocument();
    expect(screen.getByText('Dine-in')).toBeInTheDocument();
    // No status badge
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
    expect(screen.queryByText('Voided')).not.toBeInTheDocument();
    expect(screen.queryByText('Refunded')).not.toBeInTheDocument();
    // No created-at line
    expect(screen.queryByText(/\d{1,2}\/\d{1,2}\/\d{4}/)).not.toBeInTheDocument();
    // No creator line
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();
    // No dirty indicator
    expect(screen.queryByText('Unsent changes')).not.toBeInTheDocument();
  });

  it('existing order: document id, status label, type, created time and creator', () => {
    const createdAt = 1750000000;
    const expectedCreated = new Date(createdAt * 1000).toLocaleString();
    render(
      <OrderHeader
        documentId="INV26-0042"
        status="open"
        typeLabel="HungerStation / HS-1"
        createdAt={createdAt}
        createdByName="Sara"
      />,
    );

    expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    // Status shows the human label, not the raw status
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('open')).not.toBeInTheDocument();
    expect(screen.getByText('HungerStation / HS-1')).toBeInTheDocument();
    expect(screen.getByText(expectedCreated)).toBeInTheDocument();
    expect(screen.getByText('Created by Sara')).toBeInTheDocument();
    expect(screen.queryByText('Unsent changes')).not.toBeInTheDocument();
  });

  it('dirty flag shows "Unsent changes"', () => {
    render(<OrderHeader documentId="INV26-0042" status="open" typeLabel="Dine-in" isDirty />);

    expect(screen.getByText('Unsent changes')).toBeInTheDocument();
  });

  it('omits the creator line when createdByName is null or empty', () => {
    const { rerender } = render(
      <OrderHeader
        documentId="INV26-0042"
        status="open"
        typeLabel="Dine-in"
        createdByName={null}
      />,
    );
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();

    rerender(
      <OrderHeader documentId="INV26-0042" status="open" typeLabel="Dine-in" createdByName="" />,
    );
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();
  });

  it('hides the created-at line when createdAt is null, undefined or 0', () => {
    const { rerender } = render(
      <OrderHeader documentId="INV26-0042" status="open" typeLabel="Dine-in" createdAt={null} />,
    );
    expect(screen.queryByText(/\d{1,2}\/\d{1,2}\/\d{4}/)).not.toBeInTheDocument();

    rerender(<OrderHeader documentId="INV26-0042" status="open" typeLabel="Dine-in" />);
    expect(screen.queryByText(/\d{1,2}\/\d{1,2}\/\d{4}/)).not.toBeInTheDocument();

    rerender(
      <OrderHeader documentId="INV26-0042" status="open" typeLabel="Dine-in" createdAt={0} />,
    );
    expect(screen.queryByText(/\d{1,2}\/\d{1,2}\/\d{4}/)).not.toBeInTheDocument();
  });

  it('status falls back to the raw status string when unknown', () => {
    render(<OrderHeader documentId="INV26-0042" status="archived" typeLabel="Dine-in" />);

    expect(screen.getByText('archived')).toBeInTheDocument();
  });
});
