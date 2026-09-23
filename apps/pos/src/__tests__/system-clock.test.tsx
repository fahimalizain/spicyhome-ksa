import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SystemClock } from '../components/SystemClock';

describe('SystemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the current system date and time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 23, 14, 35, 7));

    render(<SystemClock />);

    expect(screen.getByText('2:35:07 PM')).toBeInTheDocument();
    expect(screen.getByText('Wed 23 Sep 2026')).toBeInTheDocument();
  });

  it('ticks every second', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 23, 14, 35, 7));

    render(<SystemClock />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('2:35:08 PM')).toBeInTheDocument();
  });

  it('clears its interval on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 23, 14, 35, 7));

    const { unmount } = render(<SystemClock />);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
