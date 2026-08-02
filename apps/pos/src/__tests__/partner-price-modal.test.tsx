import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PartnerPriceModal, type PartnerPriceLine } from '../components/orders/PartnerPriceModal';

const mockUpdateItemUnitPrice = vi.fn();

vi.mock('../api', () => ({
  client: {
    orders: {
      updateItemUnitPrice: (...args: any[]) => mockUpdateItemUnitPrice(...args),
    },
  },
}));

function makeLine(overrides: Partial<PartnerPriceLine> = {}): PartnerPriceLine {
  return {
    orderItemId: 101,
    itemId: 1,
    name: 'Burger',
    unitPriceHalalas: 2300,
    qty: 2,
    ...overrides,
  };
}

function renderModal(items: PartnerPriceLine[] = [makeLine()]) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <PartnerPriceModal
      orderId={1}
      baseUpdatedAt={5000}
      items={items}
      floorByItemId={{ 1: 2300 }}
      partnerTitle="HungerStation"
      onSaved={onSaved}
      onClose={onClose}
    />,
  );
  return { onSaved, onClose };
}

describe('PartnerPriceModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the card as the OSK scope with a sm numpad dock above the footer', () => {
    renderModal();

    expect(screen.getByText('Edit Partner Prices')).toBeInTheDocument();
    // Card root carries the OSK scope so the numpad docks inside the modal
    expect(document.querySelector('[data-osk-scope]')).toHaveClass('w-[560px]');
    // Money fields use the sm numpad dock (md is reserved for QWERTY forms)
    expect(screen.getByTestId('osk-dock')).toBeInTheDocument();
    expect(screen.getByTestId('osk-dock')).toHaveAttribute('data-osk-size', 'sm');
  });

  it('seeds drafts from the line prices and keeps Save disabled until a valid change', () => {
    renderModal();

    const burgerInput = screen.getByLabelText('New price for Burger') as HTMLInputElement;
    expect(burgerInput.value).toBe('23.00');

    const save = screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(burgerInput, { target: { value: '25' } });
    expect(save.disabled).toBe(false);
  });

  it('below-floor value shows an error and keeps Save disabled', () => {
    renderModal();

    fireEvent.change(screen.getByLabelText('New price for Burger'), {
      target: { value: '22.99' },
    });

    expect(screen.getByText('Below minimum of 23.00 SAR')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(mockUpdateItemUnitPrice).not.toHaveBeenCalled();
  });

  it('save smoke: valid change PATCHes SAR→halalas, then calls onSaved and onClose', async () => {
    mockUpdateItemUnitPrice.mockResolvedValue({ id: 1, updatedAt: 6000 });
    const { onSaved, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText('New price for Burger'), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdateItemUnitPrice).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateItemUnitPrice.mock.calls[0]).toEqual([
      1,
      101,
      { baseUpdatedAt: 5000, unitPriceHalalas: 2500 },
    ]);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
