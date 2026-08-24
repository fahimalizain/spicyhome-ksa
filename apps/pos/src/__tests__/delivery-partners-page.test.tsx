import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DeliveryPartnersPage } from '../pages/admin/DeliveryPartnersPage';

const mockListDeliveryPartners = vi.fn();
const mockCreateDeliveryPartner = vi.fn();
const mockUpdateDeliveryPartner = vi.fn();

vi.mock('../api', () => ({
  client: {
    deliveryPartners: {
      list: (...args: any[]) => mockListDeliveryPartners(...args),
      create: (...args: any[]) => mockCreateDeliveryPartner(...args),
      update: (...args: any[]) => mockUpdateDeliveryPartner(...args),
    },
  },
}));

const basePartner = {
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const jahez = { ...basePartner, id: 'jahez', title: 'Jahez', enabled: true, sortOrder: 0 };
const hungerstation = {
  ...basePartner,
  id: 'hungerstation',
  title: 'HungerStation',
  enabled: false,
  sortOrder: 1,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DeliveryPartnersPage />
    </MemoryRouter>,
  );
}

describe('DeliveryPartnersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDeliveryPartners.mockResolvedValue([jahez, hungerstation]);
    mockCreateDeliveryPartner.mockResolvedValue({ ...jahez, id: 'chefz' });
    mockUpdateDeliveryPartner.mockResolvedValue({ ...jahez, id: 'jahez' });
  });

  it('renders title, slug, and Order: N; dialog hidden until New is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Jahez')).toBeInTheDocument();
    });

    expect(screen.getByText('HungerStation')).toBeInTheDocument();
    expect(screen.getByText('jahez')).toBeInTheDocument();
    expect(screen.getByText('Order: 0')).toBeInTheDocument();
    expect(screen.getByText('Order: 1')).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: 'New Delivery Partner' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Edit Delivery Partner' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('New: Create sends only the title; linked payment method help is visible', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Jahez')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Delivery Partner'));

    expect(screen.getByRole('heading', { name: 'New Delivery Partner' })).toBeInTheDocument();
    expect(
      screen.getByText(/Creating a partner also creates its linked payment method/),
    ).toBeInTheDocument();
    // Create UI does not expose sort order or enabled — the create API cannot persist them.
    expect(screen.queryByLabelText('Sort Order')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Enabled')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The Chefz' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateDeliveryPartner).toHaveBeenCalledWith({ title: 'The Chefz' });
    });
    const payload = mockCreateDeliveryPartner.mock.calls[0][0];
    expect(payload).not.toHaveProperty('sortOrder');
    expect(payload).not.toHaveProperty('enabled');

    // Success closes the dialog and reloads the list.
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'New Delivery Partner' }),
      ).not.toBeInTheDocument();
    });
    expect(mockListDeliveryPartners).toHaveBeenCalledTimes(2);
  });

  it('does not call create when the title is empty', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Jahez')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Delivery Partner'));
    expect(screen.getByRole('heading', { name: 'New Delivery Partner' })).toBeInTheDocument();

    const createButton = screen.getByText('Create') as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);
    fireEvent.click(createButton);

    expect(mockCreateDeliveryPartner).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'New Delivery Partner' })).toBeInTheDocument();
  });

  it('Edit: Update sends title, sortOrder, and enabled', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Jahez')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Jahez'));

    expect(screen.getByRole('heading', { name: 'Edit Delivery Partner' })).toBeInTheDocument();
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Jahez');
    expect((screen.getByLabelText('Sort Order') as HTMLInputElement).value).toBe('0');
    expect(screen.getByLabelText('Enabled')).toBeChecked();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Jahez Plus' } });
    fireEvent.change(screen.getByLabelText('Sort Order'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdateDeliveryPartner).toHaveBeenCalledWith('jahez', {
        title: 'Jahez Plus',
        sortOrder: 5,
        enabled: true,
      });
    });
  });

  it('row toggle updates enabled and does not open the dialog', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Jahez')).toBeInTheDocument();
    });

    const rowCheckboxes = screen.getAllByRole('checkbox');
    expect(rowCheckboxes).toHaveLength(2);

    fireEvent.click(rowCheckboxes[0]); // jahez row toggle

    await waitFor(() => {
      expect(mockUpdateDeliveryPartner).toHaveBeenCalledWith('jahez', { enabled: false });
    });
    // stopPropagation on the toggle container: the dialog must not open.
    expect(
      screen.queryByRole('heading', { name: 'Edit Delivery Partner' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New Delivery Partner' })).not.toBeInTheDocument();
  });

  it('a rejected row toggle shows the parsed server message on the page, dialog stays closed', async () => {
    mockUpdateDeliveryPartner.mockRejectedValueOnce(
      new Error(
        'HTTP 409 Conflict: {"message":"Cannot disable delivery partner while orders are open"}',
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Jahez')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    // errorMessage() surfaces the server's JSON message, not the HTTP envelope,
    // on the page banner (toggle failures are operational, not dialog).
    await waitFor(() => {
      expect(
        screen.getByText('Cannot disable delivery partner while orders are open'),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('heading', { name: 'Edit Delivery Partner' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New Delivery Partner' })).not.toBeInTheDocument();
  });

  it('shows a failed save error inside the dialog and stays open', async () => {
    mockCreateDeliveryPartner.mockRejectedValueOnce(new Error('Title already exists'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Jahez')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Delivery Partner'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The Chefz' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Title already exists')).toBeInTheDocument();
    });
    // Still open, still on the same mode.
    expect(screen.getByRole('heading', { name: 'New Delivery Partner' })).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });
});
