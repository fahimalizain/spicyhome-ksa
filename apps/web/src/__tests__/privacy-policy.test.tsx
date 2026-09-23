import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrivacyPolicyPage } from '../pages/PrivacyPolicyPage';

const SECTION_HEADINGS = [
  'About this app',
  'Information stored on your device',
  "Information stored on your restaurant's server",
  'Diagnostics and crash reports',
  'What the app does not do',
  'Children',
  'Retention and deletion',
  'Changes to this policy',
  'Contact',
];

describe('PrivacyPolicyPage', () => {
  it('renders the page heading and the effective date', () => {
    render(<PrivacyPolicyPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText('Effective date: September 23, 2026')).toBeInTheDocument();
  });

  it.each(SECTION_HEADINGS)('renders the "%s" section heading', (heading) => {
    render(<PrivacyPolicyPage />);

    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
  });

  it('renders the nine sections in order', () => {
    render(<PrivacyPolicyPage />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(SECTION_HEADINGS);
  });

  it('names Sentry and its build-time opt-in in the diagnostics section', () => {
    render(<PrivacyPolicyPage />);

    const diagnostics = screen
      .getByRole('heading', { level: 2, name: 'Diagnostics and crash reports' })
      .closest('section');
    expect(diagnostics).not.toBeNull();
    expect(diagnostics).toHaveTextContent('Sentry');
    expect(diagnostics).toHaveTextContent(
      /only active when the app build includes a Sentry connection/i,
    );
  });

  it('renders the contact email as a mailto link', () => {
    render(<PrivacyPolicyPage />);

    const links = screen.getAllByRole('link', { name: 'fahimalizain@gmail.com' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'mailto:fahimalizain@gmail.com');
    }
  });

  it('states what is stored on the device and on the restaurant server', () => {
    render(<PrivacyPolicyPage />);

    expect(screen.getByText(/stored on the device/i)).toBeInTheDocument();
    expect(
      screen.getByText(/stored by the restaurant's own SpicyHome server/i),
    ).toBeInTheDocument();
  });

  it('states that there are no ads and that data is not sold', () => {
    render(<PrivacyPolicyPage />);

    expect(screen.getByText(/does not show advertising/i)).toBeInTheDocument();
    expect(screen.getByText(/does not sell data/i)).toBeInTheDocument();
  });

  it('names Sentry as the only third party that can receive data', () => {
    render(<PrivacyPolicyPage />);

    expect(
      screen.getByText(/only third party that can receive data is the Sentry service/i),
    ).toBeInTheDocument();
  });

  it('links back to the site home', () => {
    render(<PrivacyPolicyPage />);

    const link = screen.getByRole('link', { name: 'SpicyHome POS' });
    expect(link).toHaveAttribute('href', import.meta.env.BASE_URL);
    expect(import.meta.env.BASE_URL.startsWith('/')).toBe(true);
  });
});
