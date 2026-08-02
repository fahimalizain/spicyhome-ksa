import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrderVoidModal } from '../components/orders/OrderVoidModal';

const mockVoid = vi.fn();

vi.mock('../api', () => ({
  client: {
    orders: {
      void: (...args: any[]) => mockVoid(...args),
    },
  },
}));

function renderModal() {
  const onVoided = vi.fn();
  const onClose = vi.fn();
  render(
    <OrderVoidModal
      orderId={7}
      orderLabel="Order INV26-0042"
      onVoided={onVoided}
      onClose={onClose}
    />,
  );
  return { onVoided, onClose };
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Void Order' }) as HTMLButtonElement;
}

describe('OrderVoidModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders title, warning copy and the card as the OSK scope with a md QWERTY dock', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Void Order' })).toBeInTheDocument();
    expect(screen.getByText('Voiding is permanent and cannot be undone.')).toBeInTheDocument();
    expect(screen.getByText('Order INV26-0042')).toBeInTheDocument();
    // Card root carries the OSK scope so the QWERTY keyboard docks inside the modal
    expect(document.querySelector('[data-osk-scope]')).toHaveClass('w-[420px]');
    expect(screen.getByTestId('osk-dock')).toHaveAttribute('data-osk-size', 'md');
  });

  it('keeps Confirm disabled when the reason is empty or whitespace-only', () => {
    renderModal();

    expect(confirmButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Void reason'), { target: { value: '   ' } });
    expect(confirmButton().disabled).toBe(true);
    expect(mockVoid).not.toHaveBeenCalled();
  });

  it('enables Confirm with a non-empty reason', () => {
    renderModal();

    fireEvent.change(screen.getByLabelText('Void reason'), { target: { value: 'Customer left' } });
    expect(confirmButton().disabled).toBe(false);
  });

  it('Cancel calls onClose and never touches the void API', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockVoid).not.toHaveBeenCalled();
  });

  it('Confirm voids with the trimmed reason, then calls onVoided', async () => {
    mockVoid.mockResolvedValue({ status: 'voided' });
    const { onVoided } = renderModal();

    fireEvent.change(screen.getByLabelText('Void reason'), {
      target: { value: '  Customer left  ' },
    });
    fireEvent.click(confirmButton());

    await waitFor(() => {
      expect(mockVoid).toHaveBeenCalledTimes(1);
    });
    expect(mockVoid.mock.calls[0]).toEqual([7, { reason: 'Customer left' }]);
    expect(onVoided).toHaveBeenCalledTimes(1);
  });

  it('shows the API error inline and does not call onVoided', async () => {
    mockVoid.mockRejectedValue(new Error('Order has payments — cannot void'));
    const { onVoided } = renderModal();

    fireEvent.change(screen.getByLabelText('Void reason'), { target: { value: 'Wrong order' } });
    fireEvent.click(confirmButton());

    await waitFor(() => {
      expect(screen.getByText('Order has payments — cannot void')).toBeInTheDocument();
    });
    expect(onVoided).not.toHaveBeenCalled();
  });

  it('limits the reason input to 500 characters and shows the character count', () => {
    renderModal();

    const textarea = screen.getByLabelText('Void reason') as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute('maxlength', '500');
    expect(screen.getByText('0/500')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'Customer left' } });
    expect(screen.getByText('13/500')).toBeInTheDocument();
  });
});
