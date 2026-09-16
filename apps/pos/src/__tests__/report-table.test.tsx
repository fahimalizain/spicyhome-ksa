import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportTable, REPORT_TF, REPORT_TH } from '../components/reports/ReportTable';

function renderTable(loading = false) {
  return render(
    <ReportTable loading={loading}>
      <thead>
        <tr>
          <th className={REPORT_TH}>Item</th>
          <th className={`${REPORT_TH} text-right`}>Net</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Zinger</td>
          <td>46.00</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td className={REPORT_TF}>Totals</td>
          <td className={REPORT_TF}>46.00</td>
        </tr>
      </tfoot>
    </ReportTable>,
  );
}

describe('ReportTable', () => {
  it('grows to fill remaining height and scrolls inside that frame', () => {
    renderTable();

    const scroll = screen.getByTestId('report-table-scroll');
    expect(scroll).toHaveClass('flex-1', 'min-h-0', 'overflow-auto');
    expect(scroll.parentElement).toHaveClass('flex-1', 'min-h-0');
    expect(screen.getByRole('table')).toHaveClass('min-h-full');
    expect(scroll).toContainElement(screen.getByRole('table'));
  });

  it('injects a spacer into tbody so leftover height does not stretch rows', () => {
    renderTable();

    const spacer = screen.getByTestId('report-table-spacer');
    expect(spacer).toHaveAttribute('data-spacer');
    expect(spacer.querySelector('td')).toHaveAttribute('colspan', '2');
    expect(screen.getByRole('table')).toHaveClass('[&_tbody_tr:not([data-spacer])]:h-0');
  });

  it('pins header cells to the top and footer cells to the bottom', () => {
    renderTable();

    expect(screen.getByRole('columnheader', { name: 'Item' })).toHaveClass('sticky', 'top-0');
    expect(screen.getByRole('cell', { name: 'Totals' })).toHaveClass('sticky', 'bottom-0');
  });

  it('shows a loading overlay over the table', () => {
    renderTable(true);

    expect(screen.getByText('Loading...').closest('[aria-busy="true"]')).toBeTruthy();
  });
});
