import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SentryErrorFallback } from '../components/SentryErrorFallback';

// Mock import.meta.env.DEV
vi.mock('../components/SentryErrorFallback', async () => {
  const actual = await vi.importActual('../components/SentryErrorFallback');
  return actual;
});

describe('SentryErrorFallback', () => {
  const mockResetError = vi.fn();
  const mockReload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location.reload
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: mockReload },
    });
  });

  it('renders error message and Retry/Reload buttons', () => {
    render(
      <SentryErrorFallback
        error={new Error('Test error')}
        resetError={mockResetError}
        eventId="test-event-id"
      />,
    );

    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Retry')).toBeDefined();
    expect(screen.getByText('Reload')).toBeDefined();
    expect(screen.getByText('Event ID: test-event-id')).toBeDefined();
  });

  it('calls resetError on Retry click', () => {
    render(
      <SentryErrorFallback
        error={new Error('Test error')}
        resetError={mockResetError}
        eventId="test-event-id"
      />,
    );

    fireEvent.click(screen.getByText('Retry'));
    expect(mockResetError).toHaveBeenCalledTimes(1);
  });

  it('calls location.reload on Reload click', () => {
    render(
      <SentryErrorFallback
        error={new Error('Test error')}
        resetError={mockResetError}
        eventId="test-event-id"
      />,
    );

    fireEvent.click(screen.getByText('Reload'));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});
