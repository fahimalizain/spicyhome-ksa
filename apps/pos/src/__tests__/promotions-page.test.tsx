import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PromotionsPage } from '../pages/admin/PromotionsPage';

const mockListPromotions = vi.fn();
const mockCreatePromotion = vi.fn();
const mockUpdatePromotion = vi.fn();

vi.mock('../api', () => ({
  client: {
    promotions: {
      list: (...args: any[]) => mockListPromotions(...args),
      create: (...args: any[]) => mockCreatePromotion(...args),
      update: (...args: any[]) => mockUpdatePromotion(...args),
    },
  },
}));

const basePromo = {
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const ksaDay = {
  ...basePromo,
  id: 1,
  name: 'KSA National Day',
  nameAr: 'اليوم الوطني',
  percentBp: 1000,
  startBusinessDate: '2026-09-23',
  endBusinessDate: '2026-09-25',
  enabled: true,
};

const weekend = {
  ...basePromo,
  id: 2,
  name: 'Weekend Special',
  nameAr: 'عرض نهاية الأسبوع',
  percentBp: 1500,
  startBusinessDate: '2026-10-01',
  endBusinessDate: '2026-10-03',
  enabled: false,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PromotionsPage />
    </MemoryRouter>,
  );
}

describe('PromotionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPromotions.mockResolvedValue([ksaDay, weekend]);
    mockCreatePromotion.mockResolvedValue({ ...ksaDay, id: 3 });
    mockUpdatePromotion.mockResolvedValue({ ...ksaDay });
  });

  it('renders name, Arabic, 10% (not 1000), date range; dialog hidden until New', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('KSA National Day')).toBeInTheDocument();
    });

    expect(screen.getByText('اليوم الوطني')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.queryByText('1000')).not.toBeInTheDocument();
    expect(screen.getByText('2026-09-23 → 2026-09-25')).toBeInTheDocument();

    expect(screen.getByText('Weekend Special')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByText('2026-10-01 → 2026-10-03')).toBeInTheDocument();

    expect(screen.getByRole('checkbox', { name: 'Disable KSA National Day' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Enable Weekend Special' })).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: 'New Promotion' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit Promotion' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('English name')).not.toBeInTheDocument();
  });

  it('New: typing 10, names, dates → create called with percentBp: 1000 (not 10)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('KSA National Day')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Promotion'));
    expect(screen.getByRole('heading', { name: 'New Promotion' })).toBeInTheDocument();
    // Create does not expose enabled — server forces enabled=1.
    expect(screen.queryByLabelText('Enabled')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('English name'), {
      target: { value: 'KSA National Day' },
    });
    fireEvent.change(screen.getByLabelText('Arabic name'), {
      target: { value: 'اليوم الوطني' },
    });
    fireEvent.change(screen.getByLabelText('Percent'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-09-23' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-09-25' },
    });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreatePromotion).toHaveBeenCalledWith({
        name: 'KSA National Day',
        nameAr: 'اليوم الوطني',
        percentBp: 1000,
        startBusinessDate: '2026-09-23',
        endBusinessDate: '2026-09-25',
      });
    });
    const payload = mockCreatePromotion.mock.calls[0][0];
    expect(payload).not.toHaveProperty('enabled');
    expect(payload.percentBp).not.toBe(10);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'New Promotion' })).not.toBeInTheDocument();
    });
    expect(mockListPromotions).toHaveBeenCalledTimes(2);
  });

  it('Edit existing: opening a 1000 bp row shows input value 10; save sends percentBp 1000', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('KSA National Day')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('KSA National Day'));

    expect(screen.getByRole('heading', { name: 'Edit Promotion' })).toBeInTheDocument();
    expect((screen.getByLabelText('English name') as HTMLInputElement).value).toBe(
      'KSA National Day',
    );
    expect((screen.getByLabelText('Arabic name') as HTMLInputElement).value).toBe('اليوم الوطني');
    expect((screen.getByLabelText('Percent') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('Start date') as HTMLInputElement).value).toBe('2026-09-23');
    expect((screen.getByLabelText('End date') as HTMLInputElement).value).toBe('2026-09-25');
    expect(screen.getByLabelText('Enabled')).toBeChecked();

    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdatePromotion).toHaveBeenCalledWith(1, {
        name: 'KSA National Day',
        nameAr: 'اليوم الوطني',
        percentBp: 1000,
        startBusinessDate: '2026-09-23',
        endBusinessDate: '2026-09-25',
        enabled: true,
      });
    });
  });

  it('row enable checkbox calls update(id, { enabled: false })', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('KSA National Day')).toBeInTheDocument();
    });

    expect(screen.getByRole('checkbox', { name: 'Enable Weekend Special' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable KSA National Day' }));

    await waitFor(() => {
      expect(mockUpdatePromotion).toHaveBeenCalledWith(1, { enabled: false });
    });
    // stopPropagation on the toggle container: the dialog must not open.
    expect(screen.queryByRole('heading', { name: 'Edit Promotion' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New Promotion' })).not.toBeInTheDocument();
    // No full-page reload: the list is fetched once (initial load only).
    expect(mockListPromotions).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Enable KSA National Day' })).not.toBeChecked();
    });
  });

  it('409 overlap surfaces the server message in the dialog', async () => {
    mockCreatePromotion.mockRejectedValueOnce(
      new Error(
        'HTTP 409 Conflict: {"message":"An enabled promotion \\"KSA National Day\\" already covers 2026-09-23–2026-09-25"}',
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('KSA National Day')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Promotion'));
    fireEvent.change(screen.getByLabelText('English name'), {
      target: { value: 'Founding Day' },
    });
    fireEvent.change(screen.getByLabelText('Arabic name'), {
      target: { value: 'يوم التأسيس' },
    });
    fireEvent.change(screen.getByLabelText('Percent'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-09-23' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-09-25' },
    });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(
        screen.getByText(
          'An enabled promotion "KSA National Day" already covers 2026-09-23–2026-09-25',
        ),
      ).toBeInTheDocument();
    });
    // Dialog stays open on save error.
    expect(screen.getByRole('heading', { name: 'New Promotion' })).toBeInTheDocument();
  });

  it('Create button disabled while required fields empty', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('KSA National Day')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Promotion'));
    expect(screen.getByRole('heading', { name: 'New Promotion' })).toBeInTheDocument();

    const createButton = screen.getByText('Create') as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);
    fireEvent.click(createButton);

    expect(mockCreatePromotion).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'New Promotion' })).toBeInTheDocument();
  });
});
