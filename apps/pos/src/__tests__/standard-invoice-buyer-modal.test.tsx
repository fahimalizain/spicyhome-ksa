import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StandardInvoiceBuyerModal } from '../components/orders/StandardInvoiceBuyerModal';
import {
  emptyStandardInvoiceBuyer,
  type ZatcaBuyerDetails,
} from '../components/orders/StandardInvoiceBuyerForm';

function makeBuyer(overrides: Partial<ZatcaBuyerDetails> = {}): ZatcaBuyerDetails {
  return {
    name: 'Abdullah Al-Otaibi Est.',
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

function fillValidForm() {
  const buyer = makeBuyer();
  fireEvent.change(screen.getByPlaceholderText('Company / Legal Name'), {
    target: { value: buyer.name },
  });
  fireEvent.change(screen.getByPlaceholderText('300123456789012'), {
    target: { value: buyer.vatNumber },
  });
  fireEvent.change(screen.getByPlaceholderText('King Fahd Road'), {
    target: { value: buyer.street },
  });
  fireEvent.change(screen.getByPlaceholderText('7845'), {
    target: { value: buyer.buildingNumber },
  });
  fireEvent.change(screen.getByPlaceholderText('Al-Olaya'), {
    target: { value: buyer.citySubdivision },
  });
  fireEvent.change(screen.getByPlaceholderText('Riyadh'), {
    target: { value: buyer.city },
  });
  fireEvent.change(screen.getByPlaceholderText('12271'), {
    target: { value: buyer.postalCode },
  });
  fireEvent.change(screen.getByPlaceholderText('SA'), {
    target: { value: buyer.country },
  });
  return buyer;
}

describe('StandardInvoiceBuyerModal', () => {
  it('renders the buyer form seeded from initialBuyer plus a docked OSK host', () => {
    const buyer = makeBuyer();
    render(<StandardInvoiceBuyerModal initialBuyer={buyer} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('Standard Invoice — Buyer Details')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Company / Legal Name')).toHaveValue(buyer.name);
    expect(screen.getByPlaceholderText('SA')).toHaveValue(buyer.country);
    // Full QWERTY keyboard dock (md), not the sm numpad
    expect(screen.getByTestId('osk-dock')).toBeInTheDocument();
    expect(screen.getByTestId('osk-dock')).toHaveAttribute('data-osk-size', 'md');
  });

  it('Done validates the draft and keeps the modal open with field errors when invalid', () => {
    const onSave = vi.fn();
    render(
      <StandardInvoiceBuyerModal
        initialBuyer={emptyStandardInvoiceBuyer()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Standard Invoice — Buyer Details')).toBeInTheDocument();
    expect(screen.getByText('name is required')).toBeInTheDocument();
    expect(screen.getByText('vatNumber must be exactly 15 digits')).toBeInTheDocument();
  });

  it('Done saves a valid draft', () => {
    const onSave = vi.fn();
    render(
      <StandardInvoiceBuyerModal
        initialBuyer={emptyStandardInvoiceBuyer()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const expected = fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(expected);
  });

  it('Cancel calls onCancel without saving the draft', () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <StandardInvoiceBuyerModal initialBuyer={makeBuyer()} onSave={onSave} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
