import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReportsPage } from '../pages/ReportsPage';

function renderHub() {
  return render(
    <MemoryRouter initialEntries={['/reports']}>
      <ReportsPage />
    </MemoryRouter>,
  );
}

describe('ReportsPage hub', () => {
  it('shows both report tiles with their routes', () => {
    renderHub();

    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();

    const salesRegister = screen.getByRole('link', { name: 'Sales Register' });
    expect(salesRegister).toHaveAttribute('href', '/reports/sales-register');

    const itemWise = screen.getByRole('link', { name: 'Item-wise Sales' });
    expect(itemWise).toHaveAttribute('href', '/reports/item-wise');
  });
});
