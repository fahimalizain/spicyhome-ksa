import { getServiceDayString, getNextServiceDayBoundaryUnix } from './service-day';

/**
 * Helper: build a Unix-ms value for a given Asia/Riyadh local date-time.
 *
 * Riyadh is UTC+3 with no DST, so `Date.UTC(y, m, d, h - 3, min, sec)` gives
 * the correct Unix epoch in ms.
 */
function riyadhMs(y: number, m: number, d: number, h: number, min = 0, sec = 0, ms = 0): number {
  return Date.UTC(y, m, d, h - 3, min, sec, ms);
}

describe('getServiceDayString', () => {
  // ── Acceptance matrix ──────────────────────────────────────────────
  // | now (Asia/Riyadh) | getServiceDayString   | next boundary exp    |
  // |-------------------|-----------------------|----------------------|
  // | Mon 10:00         | Monday's date         | Tue 05:00            |
  // | Tue 03:00         | Monday's date         | Tue 05:00            |
  // | Tue 04:59:59      | Monday's date         | Tue 05:00            |
  // | Tue 05:00:00      | Tuesday's date        | Wed 05:00            |
  // | Tue 05:00:01      | Tuesday's date        | Wed 05:00            |

  describe('acceptance matrix — 2026-07-27 (Mon) / 2026-07-28 (Tue)', () => {
    // Monday = 2026-07-27
    // Tuesday = 2026-07-28

    it('Mon 10:00 → Monday date', () => {
      const ms = riyadhMs(2026, 6, 27, 10, 0, 0);
      expect(getServiceDayString(ms)).toBe('2026-07-27');
    });

    it('Tue 03:00 → Monday date (previous service day)', () => {
      const ms = riyadhMs(2026, 6, 28, 3, 0, 0);
      expect(getServiceDayString(ms)).toBe('2026-07-27');
    });

    it('Tue 04:59:59 → Monday date (previous service day)', () => {
      const ms = riyadhMs(2026, 6, 28, 4, 59, 59);
      expect(getServiceDayString(ms)).toBe('2026-07-27');
    });

    it('Tue 05:00:00 → Tuesday date (new service day)', () => {
      const ms = riyadhMs(2026, 6, 28, 5, 0, 0);
      expect(getServiceDayString(ms)).toBe('2026-07-28');
    });

    it('Tue 05:00:01 → Tuesday date', () => {
      const ms = riyadhMs(2026, 6, 28, 5, 0, 1);
      expect(getServiceDayString(ms)).toBe('2026-07-28');
    });
  });

  // ── Boundary cases ──────────────────────────────────────────────────

  it('noon → same calendar date', () => {
    const ms = riyadhMs(2026, 0, 15, 12, 0, 0);
    expect(getServiceDayString(ms)).toBe('2026-01-15');
  });

  it('23:59:59 → same calendar date', () => {
    const ms = riyadhMs(2026, 0, 15, 23, 59, 59);
    expect(getServiceDayString(ms)).toBe('2026-01-15');
  });

  it('00:00:00 → previous calendar date', () => {
    const ms = riyadhMs(2026, 0, 16, 0, 0, 0);
    expect(getServiceDayString(ms)).toBe('2026-01-15');
  });

  it('04:00:00 → previous calendar date', () => {
    const ms = riyadhMs(2026, 0, 16, 4, 0, 0);
    expect(getServiceDayString(ms)).toBe('2026-01-15');
  });

  // ── Month/year boundaries ───────────────────────────────────────────

  it('2025-12-31 23:00 → 2025-12-31', () => {
    const ms = riyadhMs(2025, 11, 31, 23, 0, 0);
    expect(getServiceDayString(ms)).toBe('2025-12-31');
  });

  it('2026-01-01 03:00 → 2025-12-31 (previous service day)', () => {
    const ms = riyadhMs(2026, 0, 1, 3, 0, 0);
    expect(getServiceDayString(ms)).toBe('2025-12-31');
  });

  it('2026-01-01 05:00 → 2026-01-01', () => {
    const ms = riyadhMs(2026, 0, 1, 5, 0, 0);
    expect(getServiceDayString(ms)).toBe('2026-01-01');
  });

  // ── Host TZ independence ────────────────────────────────────────────
  // These tests use fixed UTC instants; they must pass regardless of host TZ.

  it('returns correct label even when host TZ is conceptually different (UTC instant)', () => {
    // 2026-07-28 02:00 UTC = 2026-07-28 05:00 Asia/Riyadh
    const ms = Date.UTC(2026, 6, 28, 2, 0, 0);
    expect(getServiceDayString(ms)).toBe('2026-07-28');
  });

  it('returns previous service day for UTC instant just before 05:00 Riyadh', () => {
    // 2026-07-28 01:59:59 UTC = 2026-07-28 04:59:59 Asia/Riyadh
    const ms = Date.UTC(2026, 6, 28, 1, 59, 59);
    expect(getServiceDayString(ms)).toBe('2026-07-27');
  });
});

describe('getNextServiceDayBoundaryUnix', () => {
  // ── Acceptance matrix ──────────────────────────────────────────────

  describe('acceptance matrix — 2026-07-27 (Mon) / 2026-07-28 (Tue)', () => {
    it('Mon 10:00 → Tue 05:00 Riyadh', () => {
      const ms = riyadhMs(2026, 6, 27, 10, 0, 0);
      const exp = getNextServiceDayBoundaryUnix(ms);
      // Tue 05:00 Riyadh = 2026-07-28 02:00 UTC
      expect(exp).toBe(Date.UTC(2026, 6, 28, 2, 0, 0) / 1000);
    });

    it('Tue 03:00 → Tue 05:00 Riyadh (boundary is today at 05:00)', () => {
      const ms = riyadhMs(2026, 6, 28, 3, 0, 0);
      const exp = getNextServiceDayBoundaryUnix(ms);
      // Tue 05:00 Riyadh = 2026-07-28 02:00 UTC
      expect(exp).toBe(Date.UTC(2026, 6, 28, 2, 0, 0) / 1000);
    });

    it('Tue 04:59:59 → Tue 05:00 Riyadh (boundary is today at 05:00)', () => {
      const ms = riyadhMs(2026, 6, 28, 4, 59, 59);
      const exp = getNextServiceDayBoundaryUnix(ms);
      expect(exp).toBe(Date.UTC(2026, 6, 28, 2, 0, 0) / 1000);
    });

    it('Tue 05:00:00 → Wed 05:00 Riyadh (boundary is tomorrow at 05:00)', () => {
      const ms = riyadhMs(2026, 6, 28, 5, 0, 0);
      const exp = getNextServiceDayBoundaryUnix(ms);
      // Wed 05:00 Riyadh = 2026-07-29 02:00 UTC
      expect(exp).toBe(Date.UTC(2026, 6, 29, 2, 0, 0) / 1000);
    });

    it('Tue 05:00:01 → Wed 05:00 Riyadh', () => {
      const ms = riyadhMs(2026, 6, 28, 5, 0, 1);
      const exp = getNextServiceDayBoundaryUnix(ms);
      expect(exp).toBe(Date.UTC(2026, 6, 29, 2, 0, 0) / 1000);
    });
  });

  // ── Boundary cases ──────────────────────────────────────────────────

  it('returns Unix seconds (not milliseconds)', () => {
    const ms = riyadhMs(2026, 0, 15, 12, 0, 0);
    const exp = getNextServiceDayBoundaryUnix(ms);
    // Should be roughly 1.7e9 (year 2026 in seconds)
    expect(exp).toBeGreaterThan(1_700_000_000);
    // Verify it's seconds, not ms (roughly order of magnitude check)
    expect(exp).toBeLessThan(5_000_000_000);
  });

  it('boundary is always in the future relative to nowMs', () => {
    const ms = riyadhMs(2026, 0, 15, 5, 0, 1);
    const exp = getNextServiceDayBoundaryUnix(ms);
    const nowSec = Math.floor(ms / 1000);
    expect(exp).toBeGreaterThan(nowSec);
  });

  // ── Month/year boundary for next service day ────────────────────────

  it('2025-12-31 23:00 → 2026-01-01 05:00 Riyadh', () => {
    const ms = riyadhMs(2025, 11, 31, 23, 0, 0);
    const exp = getNextServiceDayBoundaryUnix(ms);
    // 2026-01-01 05:00 Riyadh = 2026-01-01 02:00 UTC
    expect(exp).toBe(Date.UTC(2026, 0, 1, 2, 0, 0) / 1000);
  });

  it('2026-01-01 03:00 → 2026-01-01 05:00 Riyadh (boundary same day)', () => {
    const ms = riyadhMs(2026, 0, 1, 3, 0, 0);
    const exp = getNextServiceDayBoundaryUnix(ms);
    expect(exp).toBe(Date.UTC(2026, 0, 1, 2, 0, 0) / 1000);
  });

  it('2026-01-01 05:00 → 2026-01-02 05:00 Riyadh', () => {
    const ms = riyadhMs(2026, 0, 1, 5, 0, 0);
    const exp = getNextServiceDayBoundaryUnix(ms);
    expect(exp).toBe(Date.UTC(2026, 0, 2, 2, 0, 0) / 1000);
  });

  it('2026-02-28 10:00 → 2026-03-01 05:00 Riyadh (month boundary)', () => {
    const ms = riyadhMs(2026, 1, 28, 10, 0, 0); // Feb 28
    const exp = getNextServiceDayBoundaryUnix(ms);
    expect(exp).toBe(Date.UTC(2026, 2, 1, 2, 0, 0) / 1000); // Mar 1 02:00 UTC
  });

  // ── Host TZ independence ────────────────────────────────────────────

  it('returns correct boundary from a fixed UTC instant', () => {
    // 2026-07-28 01:30 UTC = 2026-07-28 04:30 Riyadh
    const ms = Date.UTC(2026, 6, 28, 1, 30, 0);
    const exp = getNextServiceDayBoundaryUnix(ms);
    // 04:30 < 05:00, so next boundary = 2026-07-28 05:00 Riyadh = 02:00 UTC
    expect(exp).toBe(Date.UTC(2026, 6, 28, 2, 0, 0) / 1000);
  });

  it('returns next-day boundary from UTC instant after 05:00 Riyadh', () => {
    // 2026-07-28 03:00 UTC = 2026-07-28 06:00 Riyadh
    const ms = Date.UTC(2026, 6, 28, 3, 0, 0);
    const exp = getNextServiceDayBoundaryUnix(ms);
    // 06:00 >= 05:00, so next boundary = 2026-07-29 05:00 Riyadh = 02:00 UTC
    expect(exp).toBe(Date.UTC(2026, 6, 29, 2, 0, 0) / 1000);
  });
});

describe('service-day helpers integration', () => {
  it('getServiceDayString and getNextServiceDayBoundaryUnix are consistent', () => {
    // For any moment after 05:00, the next boundary should be (serviceDay + 1 day) at 05:00.
    const ms = riyadhMs(2026, 6, 28, 10, 0, 0);
    const serviceDay = getServiceDayString(ms);
    expect(serviceDay).toBe('2026-07-28');

    const boundary = getNextServiceDayBoundaryUnix(ms);
    const boundaryDate = new Date(boundary * 1000);

    // Boundary in UTC: Riyadh 05:00 = UTC 02:00
    expect(boundaryDate.getUTCHours()).toBe(2);
    expect(boundaryDate.getUTCMinutes()).toBe(0);

    // Should be 2026-07-29 in UTC (next day's 02:00 UTC)
    const boundaryStr = [
      boundaryDate.getUTCFullYear(),
      String(boundaryDate.getUTCMonth() + 1).padStart(2, '0'),
      String(boundaryDate.getUTCDate()).padStart(2, '0'),
    ].join('-');
    expect(boundaryStr).toBe('2026-07-29');
  });

  it('for pre-05:00, next boundary is same calendar date at 05:00', () => {
    const ms = riyadhMs(2026, 6, 28, 3, 0, 0);
    const serviceDay = getServiceDayString(ms);
    expect(serviceDay).toBe('2026-07-27'); // previous service day

    const boundary = getNextServiceDayBoundaryUnix(ms);
    const boundaryDate = new Date(boundary * 1000);
    // Should be 2026-07-28 05:00 Riyadh = 02:00 UTC
    expect(boundaryDate.getUTCHours()).toBe(2);
    const boundaryStr = [
      boundaryDate.getUTCFullYear(),
      String(boundaryDate.getUTCMonth() + 1).padStart(2, '0'),
      String(boundaryDate.getUTCDate()).padStart(2, '0'),
    ].join('-');
    expect(boundaryStr).toBe('2026-07-28');
  });
});
