import { todayInRiyadh, riyadhCalendarDayBoundsUnix } from './riyadh';

/**
 * Helper: build a Unix-ms value for a given Asia/Riyadh local date-time.
 *
 * Riyadh is UTC+3 with no DST, so `Date.UTC(y, m, d, h - 3, min, sec)` gives
 * the correct Unix epoch in ms.
 */
function riyadhMs(y: number, m: number, d: number, h: number, min = 0, sec = 0, ms = 0): number {
  return Date.UTC(y, m, d, h - 3, min, sec, ms);
}

describe('todayInRiyadh', () => {
  it('returns the Riyadh calendar date at noon', () => {
    const ms = riyadhMs(2026, 6, 27, 12, 0, 0);
    expect(todayInRiyadh(ms)).toBe('2026-07-27');
  });

  it('returns the same calendar date at 23:59:59', () => {
    const ms = riyadhMs(2026, 0, 15, 23, 59, 59);
    expect(todayInRiyadh(ms)).toBe('2026-01-15');
  });

  it('starts a new calendar day at 00:00:00 Riyadh', () => {
    const ms = riyadhMs(2026, 0, 16, 0, 0, 0);
    expect(todayInRiyadh(ms)).toBe('2026-01-16');
  });

  it('one second before Riyadh midnight is still the previous day', () => {
    const ms = riyadhMs(2026, 0, 16, 0, 0, 0) - 1000;
    expect(todayInRiyadh(ms)).toBe('2026-01-15');
  });

  it('crosses month boundaries correctly', () => {
    // 2026-01-31 23:00 Riyadh
    expect(todayInRiyadh(riyadhMs(2026, 0, 31, 23, 0, 0))).toBe('2026-01-31');
    // 2026-02-01 00:30 Riyadh
    expect(todayInRiyadh(riyadhMs(2026, 1, 1, 0, 30, 0))).toBe('2026-02-01');
  });

  it('crosses year boundaries correctly', () => {
    // 2025-12-31 23:59 Riyadh
    expect(todayInRiyadh(riyadhMs(2025, 11, 31, 23, 59, 0))).toBe('2025-12-31');
    // 2026-01-01 00:01 Riyadh
    expect(todayInRiyadh(riyadhMs(2026, 0, 1, 0, 1, 0))).toBe('2026-01-01');
  });

  it('handles leap years', () => {
    // 2024-02-29 is a leap day; 2023 has no Feb 29.
    expect(todayInRiyadh(riyadhMs(2024, 1, 29, 12, 0, 0))).toBe('2024-02-29');
    // 2024-03-01 00:30 Riyadh (day after leap day)
    expect(todayInRiyadh(riyadhMs(2024, 2, 1, 0, 30, 0))).toBe('2024-03-01');
  });

  it('is independent of the host timezone (explicit UTC instants)', () => {
    // 2026-07-28 02:00 UTC = 2026-07-28 05:00 Asia/Riyadh
    expect(todayInRiyadh(Date.UTC(2026, 6, 28, 2, 0, 0))).toBe('2026-07-28');
    // 2026-07-27 21:00 UTC = 2026-07-28 00:00 Asia/Riyadh
    expect(todayInRiyadh(Date.UTC(2026, 6, 27, 21, 0, 0))).toBe('2026-07-28');
    // 2026-07-27 20:59:59 UTC = 2026-07-27 23:59:59 Asia/Riyadh
    expect(todayInRiyadh(Date.UTC(2026, 6, 27, 20, 59, 59))).toBe('2026-07-27');
  });

  it('defaults to now when no argument is given', () => {
    expect(todayInRiyadh()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('riyadhCalendarDayBoundsUnix', () => {
  it('returns half-open bounds spanning exactly one day (86400 s)', () => {
    const bounds = riyadhCalendarDayBoundsUnix('2026-07-27');
    expect(bounds).not.toBeNull();
    expect(bounds!.endUnix - bounds!.startUnix).toBe(86400);
  });

  it('starts at Riyadh midnight (UTC 21:00 previous day)', () => {
    const bounds = riyadhCalendarDayBoundsUnix('2026-07-27');
    // Riyadh 2026-07-27 00:00 = UTC 2026-07-26 21:00
    expect(bounds!.startUnix).toBe(Date.UTC(2026, 6, 26, 21, 0, 0) / 1000);
    expect(bounds!.endUnix).toBe(Date.UTC(2026, 6, 27, 21, 0, 0) / 1000);
  });

  it('bounds contain instants inside the Riyadh day and exclude neighbors', () => {
    const bounds = riyadhCalendarDayBoundsUnix('2026-07-27')!;
    // 2026-07-27 00:00:00 Riyadh (inclusive start)
    expect(riyadhMs(2026, 6, 27, 0, 0, 0) / 1000).toBe(bounds.startUnix);
    // 2026-07-27 12:00:00 Riyadh (inside)
    const noon = riyadhMs(2026, 6, 27, 12, 0, 0) / 1000;
    expect(noon).toBeGreaterThanOrEqual(bounds.startUnix);
    expect(noon).toBeLessThan(bounds.endUnix);
    // 2026-07-27 23:59:59 Riyadh (last second inside)
    expect(riyadhMs(2026, 6, 27, 23, 59, 59) / 1000).toBeLessThan(bounds.endUnix);
    // 2026-07-28 00:00:00 Riyadh (next day, excluded — half-open)
    expect(riyadhMs(2026, 6, 28, 0, 0, 0) / 1000).toBe(bounds.endUnix);
    // 2026-07-26 23:59:59 Riyadh (previous day, excluded)
    expect(riyadhMs(2026, 6, 26, 23, 59, 59) / 1000).toBeLessThan(bounds.startUnix);
  });

  it('handles month/year boundaries', () => {
    const bounds = riyadhCalendarDayBoundsUnix('2026-01-01')!;
    expect(bounds.startUnix).toBe(Date.UTC(2025, 11, 31, 21, 0, 0) / 1000);
    expect(bounds.endUnix).toBe(Date.UTC(2026, 0, 1, 21, 0, 0) / 1000);
  });

  it('accepts leap day 2024-02-29 and rejects 2023-02-29', () => {
    expect(riyadhCalendarDayBoundsUnix('2024-02-29')).not.toBeNull();
    expect(riyadhCalendarDayBoundsUnix('2023-02-29')).toBeNull();
  });

  it('rejects malformed date strings', () => {
    expect(riyadhCalendarDayBoundsUnix('2026-13-01')).toBeNull(); // month out of range
    expect(riyadhCalendarDayBoundsUnix('2026-02-30')).toBeNull(); // day out of range
    expect(riyadhCalendarDayBoundsUnix('2026-1-1')).toBeNull(); // no zero padding
    expect(riyadhCalendarDayBoundsUnix('2026/01/01')).toBeNull(); // wrong separator
    expect(riyadhCalendarDayBoundsUnix('abc')).toBeNull();
    expect(riyadhCalendarDayBoundsUnix('')).toBeNull();
    expect(riyadhCalendarDayBoundsUnix('2026-01-01T00:00:00')).toBeNull();
  });
});
