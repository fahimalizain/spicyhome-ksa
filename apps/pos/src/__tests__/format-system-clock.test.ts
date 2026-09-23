import { describe, it, expect } from 'vitest';
import { formatSystemClock } from '../lib/format-system-clock';

describe('formatSystemClock', () => {
  it('formats date and 12-hour time with AM/PM', () => {
    expect(formatSystemClock(new Date(2026, 8, 23, 14, 35, 7))).toEqual({
      date: 'Wed 23 Sep 2026',
      time: '2:35:07 PM',
    });
  });

  it('formats morning times as AM', () => {
    expect(formatSystemClock(new Date(2026, 0, 5, 4, 3, 2)).time).toBe('4:03:02 AM');
  });

  it('formats midnight as 12:00:00 AM', () => {
    expect(formatSystemClock(new Date(2026, 8, 23, 0, 0, 0)).time).toBe('12:00:00 AM');
  });

  it('formats noon as 12:00:00 PM', () => {
    expect(formatSystemClock(new Date(2026, 8, 23, 12, 0, 0)).time).toBe('12:00:00 PM');
  });

  it('keeps 11:59 PM as PM', () => {
    expect(formatSystemClock(new Date(2026, 8, 23, 23, 59, 0)).time).toBe('11:59:00 PM');
  });

  it('does not zero-pad the day of month', () => {
    expect(formatSystemClock(new Date(2026, 0, 5, 9, 0, 0)).date).toBe('Mon 5 Jan 2026');
  });
});
