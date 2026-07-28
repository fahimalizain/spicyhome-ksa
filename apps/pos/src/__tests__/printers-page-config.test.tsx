import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PrintersPage } from '../pages/admin/PrintersPage';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockTest = vi.fn();

vi.mock('../api', () => ({
  client: {
    printers: {
      list: (...args: any[]) => mockList(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
      test: (...args: any[]) => mockTest(...args),
    },
  },
}));

const printerKitchen = {
  id: 1,
  name: 'Kitchen',
  ip: '192.168.1.100',
  port: 9100,
  role: 'kitchen',
  isActive: true,
  config: {
    arabic: {
      encoding: 'pc864' as const,
      codePage: 22,
      visualRtl: false,
    },
  },
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const printerReceipt = {
  id: 2,
  name: 'Receipt',
  ip: '192.168.1.101',
  port: 9100,
  role: 'receipt',
  isActive: true,
  config: {
    arabic: {
      encoding: 'none' as const,
      codePage: 0,
      visualRtl: false,
    },
  },
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const printerRtl = {
  id: 3,
  name: 'RTL Printer',
  ip: '192.168.1.102',
  port: 9100,
  role: 'kitchen',
  isActive: true,
  config: {
    arabic: {
      encoding: 'pc864' as const,
      codePage: 22,
      visualRtl: true,
    },
  },
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PrintersPage />
    </MemoryRouter>,
  );
}

/** Find a form input by its preceding label text using DOM traversal. */
function getByLabel(form: HTMLElement, labelText: string): HTMLElement {
  const labels = form.querySelectorAll('label');
  for (const label of labels) {
    if (label.textContent?.trim() === labelText) {
      const input = label.nextElementSibling as HTMLElement;
      if (input) return input;
    }
  }
  throw new Error(`Could not find input with label "${labelText}"`);
}

describe('PrintersPage — config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([printerKitchen, printerReceipt, printerRtl]);
    mockCreate.mockResolvedValue({ ...printerKitchen, id: 4 });
    mockUpdate.mockResolvedValue({ ...printerKitchen, id: 1 });
  });

  it('renders list printer with config summary (pc864/22)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('AR: pc864/22')).toBeInTheDocument();
    });
  });

  it('renders list printer with config summary (none)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('AR: none')).toBeInTheDocument();
    });
  });

  it('renders list printer with RTL badge', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('AR: pc864/22 RTL')).toBeInTheDocument();
    });
  });

  it('changes code page to 22 when encoding changed to pc864', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Printers')).toBeInTheDocument();
    });

    const encodingSelect = screen.getByTestId('encoding-select');
    fireEvent.change(encodingSelect, { target: { value: 'pc864' } });

    // Code page input should now be 22
    await waitFor(() => {
      expect(screen.getByDisplayValue('22')).toBeInTheDocument();
    });
  });

  it('changes code page to 50 when encoding changed to w1256', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Printers')).toBeInTheDocument();
    });

    const encodingSelect = screen.getByTestId('encoding-select');
    fireEvent.change(encodingSelect, { target: { value: 'w1256' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    });
  });

  it('changes code page to 0 when encoding changed to utf8', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Printers')).toBeInTheDocument();
    });

    const encodingSelect = screen.getByTestId('encoding-select');
    fireEvent.change(encodingSelect, { target: { value: 'utf8' } });

    await waitFor(() => {
      // Code page defaults to 0 for utf8
      const codePageInput = screen.getByDisplayValue('0');
      expect(codePageInput).toBeInTheDocument();
    });
  });

  it('sends config on create', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Printers')).toBeInTheDocument();
    });

    const form = container.querySelector('form')!;

    // Fill name
    const nameInput = getByLabel(form, 'Name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Printer' } });

    // Fill IP
    const ipInput = getByLabel(form, 'IP Address') as HTMLInputElement;
    fireEvent.change(ipInput, { target: { value: '10.0.0.1' } });

    // Fill Port (number input)
    const portInput = getByLabel(form, 'Port') as HTMLInputElement;
    fireEvent.change(portInput, { target: { value: '9100' } });

    // Change encoding to pc864
    const encodingSelect = screen.getByTestId('encoding-select');
    fireEvent.change(encodingSelect, { target: { value: 'pc864' } });

    // Check visual RTL
    const rtlCheckbox = form.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(rtlCheckbox);

    // Submit
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Printer',
          ip: '10.0.0.1',
          port: 9100,
          role: 'kitchen',
          isActive: true,
          config: {
            arabic: {
              encoding: 'pc864',
              codePage: 22,
              visualRtl: true,
            },
          },
        }),
      );
    });
  });

  it('edit loads existing config into form fields', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('AR: pc864/22')).toBeInTheDocument();
    });

    // Click edit on the first printer (Kitchen with pc864/22)
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    // Form should now show pc864 encoding and codePage 22
    await waitFor(() => {
      expect(screen.getByTestId('encoding-select')).toHaveValue('pc864');
    });
    // Code page input should show 22
    await waitFor(() => {
      expect(screen.getByDisplayValue('22')).toBeInTheDocument();
    });
    // Heading should be "Edit Printer"
    expect(screen.getByText('Edit Printer')).toBeInTheDocument();
  });

  it('edit loads default config when printer config missing', async () => {
    const printerNoConfig = {
      ...printerReceipt,
      config: undefined as any,
    };
    mockList.mockResolvedValue([printerNoConfig]);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('AR: none')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      // Default encoding is 'none'
      expect(screen.getByTestId('encoding-select')).toHaveValue('none');
    });
  });

  it('update sends updated config', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('AR: pc864/22')).toBeInTheDocument();
    });

    // Click edit
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Printer')).toBeInTheDocument();
    });

    // Change encoding to w1256
    const encodingSelect = screen.getByTestId('encoding-select');
    fireEvent.change(encodingSelect, { target: { value: 'w1256' } });

    // Submit update
    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          config: {
            arabic: {
              encoding: 'w1256',
              codePage: 50,
              visualRtl: false,
            },
          },
        }),
      );
    });
  });

  it('encoding select shows all four options with descriptions', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Printers')).toBeInTheDocument();
    });

    const encodingSelect = screen.getByTestId('encoding-select');

    // Check all options are present
    expect(within(encodingSelect).getByText('none — ASCII only')).toBeInTheDocument();
    expect(within(encodingSelect).getByText('utf8 — UTF-8')).toBeInTheDocument();
    expect(
      within(encodingSelect).getByText('pc864 — PC864 (often code page 22)'),
    ).toBeInTheDocument();
    expect(
      within(encodingSelect).getByText('w1256 — Windows-1256 (often code page 50)'),
    ).toBeInTheDocument();
  });
});
