import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PaymentMethodsPage } from '../pages/admin/PaymentMethodsPage';

const mockListPaymentMethods = vi.fn();
const mockCreatePaymentMethod = vi.fn();
const mockUpdatePaymentMethod = vi.fn();

vi.mock('../api', () => ({
  client: {
    paymentMethods: {
      list: (...args: any[]) => mockListPaymentMethods(...args),
      create: (...args: any[]) => mockCreatePaymentMethod(...args),
      update: (...args: any[]) => mockUpdatePaymentMethod(...args),
    },
  },
}));

const baseMethod = {
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const cashMethod = {
  ...baseMethod,
  id: 'cash',
  title: 'Cash',
  zatcaPaymentMeansCode: '10',
  enabled: true,
  sortOrder: 0,
  isDeliveryPartner: false,
};
const cardMethod = {
  ...baseMethod,
  id: 'card',
  title: 'Card',
  zatcaPaymentMeansCode: '48',
  enabled: true,
  sortOrder: 1,
  isDeliveryPartner: false,
};
const partnerMethod = {
  ...baseMethod,
  id: 'hungerstation',
  title: 'HungerStation',
  zatcaPaymentMeansCode: '30',
  enabled: true,
  sortOrder: 2,
  isDeliveryPartner: true,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PaymentMethodsPage />
    </MemoryRouter>,
  );
}

describe('PaymentMethodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPaymentMethods.mockResolvedValue([cashMethod, cardMethod, partnerMethod]);
    mockCreatePaymentMethod.mockResolvedValue({ ...cardMethod, id: 'sadad' });
    mockUpdatePaymentMethod.mockResolvedValue({ ...cardMethod, id: 'card' });
  });

  it('renders titles, slugs, ZATCA badges, cash lock, and partner badge; dialog hidden until New/Edit', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
    });

    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('HungerStation')).toBeInTheDocument();
    expect(screen.getByText('card')).toBeInTheDocument();
    expect(screen.getByText('hungerstation')).toBeInTheDocument();
    // ZATCA BT-81 badges.
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    // Cash lock + Delivery partner badge.
    expect(screen.getByText('🔒')).toBeInTheDocument();
    expect(screen.getByText('Delivery partner')).toBeInTheDocument();

    // Row enable/disable checkboxes sit at the row start, next to the title;
    // the "Active"/"Disabled" status labels are gone (dialog still closed).
    expect(screen.getByRole('checkbox', { name: 'Disable Cash' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Disable Card' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Disable HungerStation' })).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Disabled')).not.toBeInTheDocument();

    // Dialog hidden until New or Edit is clicked.
    expect(screen.queryByRole('heading', { name: 'New Payment Method' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit Payment Method' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('New Payment Method'));
    expect(screen.getByRole('heading', { name: 'New Payment Method' })).toBeInTheDocument();
  });

  it('New: ZATCA defaults to 30; Create sends only title + zatcaPaymentMeansCode, closes and reloads', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Payment Method'));

    expect(screen.getByRole('heading', { name: 'New Payment Method' })).toBeInTheDocument();
    expect(screen.getByLabelText('ZATCA Payment Means Code (BT-81)')).toHaveValue('30');
    // Create UI does not expose sort order or enabled — the create API cannot persist them.
    expect(screen.queryByLabelText('Sort Order')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Enabled')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'SADAD' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreatePaymentMethod).toHaveBeenCalledWith({
        title: 'SADAD',
        zatcaPaymentMeansCode: '30',
      });
    });
    const payload = mockCreatePaymentMethod.mock.calls[0][0];
    expect(payload).not.toHaveProperty('sortOrder');
    expect(payload).not.toHaveProperty('enabled');

    // Success closes the dialog and reloads the list.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'New Payment Method' })).not.toBeInTheDocument();
    });
    expect(mockListPaymentMethods).toHaveBeenCalledTimes(2);
  });

  it('does not call create when the title is empty', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Payment Method'));
    expect(screen.getByRole('heading', { name: 'New Payment Method' })).toBeInTheDocument();

    const createButton = screen.getByText('Create') as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);
    fireEvent.click(createButton);

    expect(mockCreatePaymentMethod).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'New Payment Method' })).toBeInTheDocument();
  });

  it('row click opens Edit with fields populated; Update sends the full payload', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Card'));

    expect(screen.getByRole('heading', { name: 'Edit Payment Method' })).toBeInTheDocument();
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Card');
    expect(screen.getByLabelText('ZATCA Payment Means Code (BT-81)')).toHaveValue('48');
    expect((screen.getByLabelText('Sort Order') as HTMLInputElement).value).toBe('1');
    expect(screen.getByLabelText('Enabled')).toBeChecked();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Bank Card' } });
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdatePaymentMethod).toHaveBeenCalledWith('card', {
        title: 'Bank Card',
        sortOrder: 1,
        enabled: true,
        zatcaPaymentMeansCode: '48',
      });
    });
  });

  it('Edit cash: title/code/enabled disabled; Update still sends the full payload with sortOrder', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cash'));

    expect(screen.getByRole('heading', { name: 'Edit Payment Method' })).toBeInTheDocument();
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByLabelText('ZATCA Payment Means Code (BT-81)')).toBeDisabled();
    expect(screen.getByLabelText('Enabled')).toBeDisabled();
    expect(screen.getByText('Cash is locked to code 10 (In cash).')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Sort Order'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Update'));

    // cash is NOT isDeliveryPartner, so the full payload goes out (cash is just
    // locked in the UI) — no special cash update rules.
    await waitFor(() => {
      expect(mockUpdatePaymentMethod).toHaveBeenCalledWith('cash', {
        title: 'Cash',
        sortOrder: 5,
        enabled: true,
        zatcaPaymentMeansCode: '10',
      });
    });
  });

  it('Edit partner-owned: title/code/enabled disabled; Update sends only sortOrder', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('HungerStation')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('HungerStation'));

    expect(screen.getByRole('heading', { name: 'Edit Payment Method' })).toBeInTheDocument();
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByLabelText('ZATCA Payment Means Code (BT-81)')).toBeDisabled();
    expect(screen.getByLabelText('Enabled')).toBeDisabled();
    expect(
      screen.getByText('Managed via Delivery Partners — only sort order is editable here.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Sort Order'), { target: { value: '9' } });
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdatePaymentMethod).toHaveBeenCalledWith('hungerstation', { sortOrder: 9 });
    });
  });

  it('row toggle updates enabled without opening the dialog; cash/partner toggles are disabled', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Card')).toBeInTheDocument();
    });

    expect(screen.getByRole('checkbox', { name: 'Disable Cash' })).toBeDisabled(); // cash is locked
    expect(screen.getByRole('checkbox', { name: 'Disable HungerStation' })).toBeDisabled(); // partner-owned

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Card' })); // card row toggle

    await waitFor(() => {
      expect(mockUpdatePaymentMethod).toHaveBeenCalledWith('card', { enabled: false });
    });
    // stopPropagation on the toggle container: the dialog must not open.
    expect(screen.queryByRole('heading', { name: 'Edit Payment Method' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New Payment Method' })).not.toBeInTheDocument();
    // No full-page reload: the list is fetched once (initial load only).
    expect(mockListPaymentMethods).toHaveBeenCalledTimes(1);
    // The row flips locally on success.
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Enable Card' })).not.toBeChecked();
    });
    // Cash and partner rows are untouched and still locked.
    expect(screen.getByRole('checkbox', { name: 'Disable Cash' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Disable HungerStation' })).toBeDisabled();
  });

  it('shows the toggle error in the page error banner and keeps the dialog closed', async () => {
    mockUpdatePaymentMethod.mockRejectedValueOnce(new Error('Cannot disable payment method'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Card' }));

    await waitFor(() => {
      expect(screen.getByText('Cannot disable payment method')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Edit Payment Method' })).not.toBeInTheDocument();
    // No flip on error: Card stays enabled (checked) with its Disable label.
    expect(screen.getByRole('checkbox', { name: 'Disable Card' })).toBeChecked();
    // Still no reload.
    expect(mockListPaymentMethods).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('grays out only the in-flight row while the toggle is pending', async () => {
    let resolveUpdate!: (value: unknown) => void;
    mockUpdatePaymentMethod.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Card' }));

    // No full-page loading flash; only the row is marked busy.
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.getByText('Card').closest('[aria-busy="true"]')).not.toBeNull();
    const busyRow = screen.getByText('Card').closest('[aria-busy="true"]')!;
    expect(busyRow.className).toContain('opacity-50');
    // Cash is NOT inside a busy row (locked, not toggling).
    expect(screen.getByText('Cash').closest('[aria-busy="true"]')).toBeNull();

    resolveUpdate({});
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Enable Card' })).not.toBeChecked();
    });
    expect(screen.getByText('Card').closest('[aria-busy="true"]')).toBeNull();
  });

  it('shows a failed save error inside the dialog and stays open', async () => {
    mockCreatePaymentMethod.mockRejectedValueOnce(new Error('Slug already exists'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Payment Method'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'SADAD' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Slug already exists')).toBeInTheDocument();
    });
    // Still open, still on the same mode.
    expect(screen.getByRole('heading', { name: 'New Payment Method' })).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });
});
