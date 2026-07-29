import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PrintersPage } from '../pages/admin/PrintersPage';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockTest = vi.fn();
const mockWindowsQueues = vi.fn();

vi.mock('../api', () => ({
  client: {
    printers: {
      list: (...args: any[]) => mockList(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
      test: (...args: any[]) => mockTest(...args),
      listWindowsQueues: (...args: any[]) => mockWindowsQueues(...args),
    },
  },
}));

const basePrinter = {
  connectionType: 'tcp' as const,
  windowsPrinterName: null as string | null,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  createdBy: 1,
  updatedBy: 1,
};

const printerKitchen = {
  ...basePrinter,
  id: 1,
  name: 'Kitchen',
  ip: '192.168.1.100',
  port: 9100,
  role: 'kitchen' as const,
  isActive: true,
  config: {
    arabic: {
      encoding: 'pc864' as const,
      codePage: 22,
      visualRtl: false,
    },
  },
};

const printerReceipt = {
  ...basePrinter,
  id: 2,
  name: 'Receipt',
  ip: '192.168.1.101',
  port: 9100,
  role: 'receipt' as const,
  isActive: true,
  config: {
    arabic: {
      encoding: 'none' as const,
      codePage: 0,
      visualRtl: false,
    },
  },
};

const printerRtl = {
  ...basePrinter,
  id: 3,
  name: 'RTL Printer',
  ip: '192.168.1.102',
  port: 9100,
  role: 'kitchen' as const,
  isActive: true,
  config: {
    arabic: {
      encoding: 'pc864' as const,
      codePage: 22,
      visualRtl: true,
    },
  },
};

const printerWindows = {
  ...basePrinter,
  id: 4,
  name: 'USB Printer',
  connectionType: 'windows' as const,
  windowsPrinterName: 'XP-80C',
  ip: '',
  port: 9100,
  role: 'kitchen' as const,
  isActive: true,
  config: {
    arabic: {
      encoding: 'none' as const,
      codePage: 0,
      visualRtl: false,
    },
  },
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
      // For labels followed by a div wrapper (flex layout), go into the wrapper
      let sibling = label.nextElementSibling as HTMLElement;
      if (sibling && sibling.tagName === 'DIV') {
        const input = sibling.querySelector('input');
        if (input) return input;
      }
      if (sibling) return sibling as HTMLElement;
    }
  }
  throw new Error(`Could not find input with label "${labelText}"`);
}

describe('PrintersPage — config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([printerKitchen, printerReceipt, printerRtl]);
    mockCreate.mockResolvedValue({ ...printerKitchen, id: 9 });
    mockUpdate.mockResolvedValue({ ...printerKitchen, id: 1 });
    mockWindowsQueues.mockResolvedValue({ queues: ['XP-80C', 'Receipt Printer'] });
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

    const nameInput = getByLabel(form, 'Name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Printer' } });

    const ipInput = getByLabel(form, 'IP Address') as HTMLInputElement;
    fireEvent.change(ipInput, { target: { value: '10.0.0.1' } });

    const portInput = getByLabel(form, 'Port') as HTMLInputElement;
    fireEvent.change(portInput, { target: { value: '9100' } });

    const encodingSelect = screen.getByTestId('encoding-select');
    fireEvent.change(encodingSelect, { target: { value: 'pc864' } });

    const rtlCheckbox = form.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(rtlCheckbox);

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Printer',
          connectionType: 'tcp',
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

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('encoding-select')).toHaveValue('pc864');
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue('22')).toBeInTheDocument();
    });
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
      expect(screen.getByTestId('encoding-select')).toHaveValue('none');
    });
  });

  it('update sends updated config', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('AR: pc864/22')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Printer')).toBeInTheDocument();
    });

    const encodingSelect = screen.getByTestId('encoding-select');
    fireEvent.change(encodingSelect, { target: { value: 'w1256' } });

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

    expect(within(encodingSelect).getByText('none — ASCII only')).toBeInTheDocument();
    expect(within(encodingSelect).getByText('utf8 — UTF-8')).toBeInTheDocument();
    expect(
      within(encodingSelect).getByText('pc864 — PC864 (often code page 22)'),
    ).toBeInTheDocument();
    expect(
      within(encodingSelect).getByText('w1256 — Windows-1256 (often code page 50)'),
    ).toBeInTheDocument();
  });

  // ── Connection type tests ──────────────────────────────────────────────────

  it('shows IP and Port fields when connection type is TCP', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Printers')).toBeInTheDocument();
    });

    // Default is TCP — IP and Port labels should be visible
    expect(screen.getByText('IP Address')).toBeInTheDocument();
    expect(screen.getByText('Port')).toBeInTheDocument();
  });

  it('switches to Windows fields when connection type is changed', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Printers')).toBeInTheDocument();
    });

    const connSelect = screen.getByTestId('connection-type-select');
    fireEvent.change(connSelect, { target: { value: 'windows' } });

    await waitFor(() => {
      // Should now show Windows Printer Name label and Refresh button
      expect(screen.getByText('Windows Printer Name')).toBeInTheDocument();
      expect(screen.getByText('Refresh')).toBeInTheDocument();
      // IP Address and Port should be gone
      expect(screen.queryByText('IP Address')).not.toBeInTheDocument();
      expect(screen.queryByText('Port')).not.toBeInTheDocument();
    });
  });

  it('save payload includes connectionType when creating windows printer', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Printers')).toBeInTheDocument();
    });

    // Switch to windows
    const connSelect = screen.getByTestId('connection-type-select');
    fireEvent.change(connSelect, { target: { value: 'windows' } });

    await waitFor(() => {
      expect(screen.getByText('Windows Printer Name')).toBeInTheDocument();
    });

    const form = container.querySelector('form')!;
    const nameField = getByLabel(form, 'Name') as HTMLInputElement;
    fireEvent.change(nameField, { target: { value: 'USB Kitchen' } });

    // Find the Windows Printer Name input
    const winNameInput = getByLabel(form, 'Windows Printer Name') as HTMLInputElement;
    fireEvent.change(winNameInput, { target: { value: 'XP-80C' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'USB Kitchen',
          connectionType: 'windows',
          windowsPrinterName: 'XP-80C',
          ip: '',
        }),
      );
    });
  });

  it('displays USB badge and Win: prefix for windows printers in list', async () => {
    mockList.mockResolvedValue([printerWindows]);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('USB')).toBeInTheDocument();
      expect(screen.getByText('Win: XP-80C')).toBeInTheDocument();
    });
  });

  it('displays ip:port for TCP printers in list', async () => {
    mockList.mockResolvedValue([printerKitchen]);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('192.168.1.100:9100')).toBeInTheDocument();
    });
  });

  it('edit loads connection type for windows printer', async () => {
    mockList.mockResolvedValue([printerWindows]);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('USB Printer')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('connection-type-select')).toHaveValue('windows');
      expect(screen.getByDisplayValue('XP-80C')).toBeInTheDocument();
    });
  });
});
