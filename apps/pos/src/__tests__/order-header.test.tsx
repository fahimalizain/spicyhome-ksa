import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderHeader, titleCaseName } from '../components/orders/OrderHeader';

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
    // Type label and creator name coexist (same row, no "Created by" prefix)
    expect(screen.getByText('HungerStation / HS-1')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();
    expect(screen.getByText(expectedCreated)).toBeInTheDocument();
    expect(screen.queryByText('Unsent changes')).not.toBeInTheDocument();
  });

  it('dirty flag shows "Unsent changes"', () => {
    render(<OrderHeader documentId="INV26-0042" status="open" typeLabel="Dine-in" isDirty />);

    expect(screen.getByText('Unsent changes')).toBeInTheDocument();
  });

  it('omits the creator name when createdByName is null or empty', () => {
    const { rerender } = render(
      <OrderHeader
        documentId="INV26-0042"
        status="open"
        typeLabel="Dine-in"
        createdByName="Sara"
      />,
    );
    expect(screen.getByText('Sara')).toBeInTheDocument();

    rerender(
      <OrderHeader
        documentId="INV26-0042"
        status="open"
        typeLabel="Dine-in"
        createdByName={null}
      />,
    );
    expect(screen.queryByText('Sara')).not.toBeInTheDocument();
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();

    rerender(
      <OrderHeader documentId="INV26-0042" status="open" typeLabel="Dine-in" createdByName="" />,
    );
    expect(screen.queryByText('Sara')).not.toBeInTheDocument();
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();
  });

  it('title-cases the creator name via JS (not CSS capitalize)', () => {
    render(
      <OrderHeader
        documentId="INV26-0042"
        status="open"
        typeLabel="Dine-in"
        createdByName="john DOE"
      />,
    );

    // The displayed text is the JS title-cased name — CSS `capitalize` would
    // leave the DOM text as the raw input and fails on ALL-CAPS input.
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByText('john DOE')).not.toBeInTheDocument();
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();
  });

  it('variant="detail": renders documentId/status/type with notes and previous document ids', () => {
    render(
      <OrderHeader
        variant="detail"
        documentId="INV26-0042"
        status="paid"
        typeLabel="HungerStation / HS-1"
        createdAt={1750000000}
        createdByName="SARA ahmed"
        notes="  Call on arrival  "
        previousDocumentIds={['INV26-0041']}
      />,
    );

    expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('HungerStation / HS-1')).toBeInTheDocument();
    expect(screen.getByText('Sara Ahmed')).toBeInTheDocument();
    expect(screen.getByText(new Date(1750000000 * 1000).toLocaleString())).toBeInTheDocument();
    // Notes trimmed, with the muted "Notes:" prefix
    expect(screen.getByText('Notes:')).toBeInTheDocument();
    expect(screen.getByText('Call on arrival')).toBeInTheDocument();
    expect(screen.getByText('Previous: INV26-0041')).toBeInTheDocument();
  });

  it('variant="detail": notes and previous ids hidden when empty', () => {
    render(
      <OrderHeader
        variant="detail"
        documentId="INV26-0042"
        status="open"
        typeLabel="Dine-in"
        notes=""
        previousDocumentIds={[]}
      />,
    );

    expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Dine-in')).toBeInTheDocument();
    expect(screen.queryByText('Notes:')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Previous:/)).not.toBeInTheDocument();
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

describe('titleCaseName', () => {
  it('empty and whitespace-only strings return empty', () => {
    expect(titleCaseName('')).toBe('');
    expect(titleCaseName('   ')).toBe('');
    expect(titleCaseName('\t \n ')).toBe('');
  });

  it('single word is capitalized', () => {
    expect(titleCaseName('sara')).toBe('Sara');
    expect(titleCaseName('SARA')).toBe('Sara');
    expect(titleCaseName('Sara')).toBe('Sara');
  });

  it('multi-word names are title-cased per word', () => {
    expect(titleCaseName('john doe')).toBe('John Doe');
    expect(titleCaseName('sara ahmed')).toBe('Sara Ahmed');
  });

  it('mixed case and ALL CAPS normalize to title case', () => {
    expect(titleCaseName('jOhN dOe')).toBe('John Doe');
    expect(titleCaseName('JOHN DOE')).toBe('John Doe');
    expect(titleCaseName('AL MOHAMMED')).toBe('Al Mohammed');
  });

  it('collapses internal runs of whitespace', () => {
    expect(titleCaseName('  john    doe  ')).toBe('John Doe');
    expect(titleCaseName('sara\tahmed\nali')).toBe('Sara Ahmed Ali');
  });
});
