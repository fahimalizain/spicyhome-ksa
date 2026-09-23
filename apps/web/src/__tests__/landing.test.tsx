import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingPage } from '../pages/LandingPage';

describe('LandingPage', () => {
  it('renders the app heading', () => {
    render(<LandingPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'SpicyHome POS' })).toBeInTheDocument();
  });

  it('links to the privacy policy page', () => {
    render(<LandingPage />);
    const link = screen.getByRole('link', { name: /privacy policy/i });
    const href = link.getAttribute('href');

    // The link is built from Vite's BASE_URL so it stays valid under the
    // GitHub project Pages subpath (/spicyhome-ksa/).
    expect(href).toBe(`${import.meta.env.BASE_URL}privacy/`);
    expect(href?.startsWith('/')).toBe(true);
    expect(href?.endsWith('/privacy/')).toBe(true);
  });

  it('renders the contact email as a mailto link', () => {
    render(<LandingPage />);
    const link = screen.getByRole('link', { name: 'fahimalizain@gmail.com' });
    expect(link).toHaveAttribute('href', 'mailto:fahimalizain@gmail.com');
  });
});
