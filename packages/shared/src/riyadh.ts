/**
 * Calendar-day helpers for Asia/Riyadh (+03:00, no DST).
 *
 * Unlike `service-day.ts` (05:00-based service day), these helpers deal with
 * the plain **calendar** day in Riyadh: 00:00 Asia/Riyadh starts a new day.
 *
 * These helpers use an explicit UTC+3 offset — they do **not** depend on
 * `process.env.TZ` or the host timezone (same approach as `service-day.ts`).
 */

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, no DST
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Return the Asia/Riyadh **calendar** day (`YYYY-MM-DD`) for `nowMs`.
 *
 * @param nowMs Unix milliseconds (e.g. `Date.now()`). Defaults to now.
 */
export function todayInRiyadh(nowMs: number = Date.now()): string {
  const d = new Date(nowMs + RIYADH_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface RiyadhDateParts {
  year: number;
  /** 0-indexed month (January = 0). */
  monthIndex: number;
  /** Day of month (1–31). */
  day: number;
}

/**
 * Parse and validate a `YYYY-MM-DD` string. Returns the calendar day parts,
 * or `null` when the string is not a valid date (bad format, out-of-range
 * month/day, e.g. `2026-13-01` or `2026-02-30`).
 */
function parseRiyadhDate(dateStr: string): RiyadhDateParts | null {
  const m = DATE_RE.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);

  // Reject out-of-range values by round-tripping through Date.UTC.
  const d = new Date(Date.UTC(year, monthIndex, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) {
    return null;
  }
  return { year, monthIndex, day };
}

/**
 * Return the half-open `[startUnix, endUnix)` bounds — Unix **seconds** — of
 * the given Asia/Riyadh **calendar** day (`YYYY-MM-DD`). All instants within
 * that Riyadh day satisfy `startUnix <= t < endUnix`.
 *
 * Returns `null` when `dateStr` is not a valid `YYYY-MM-DD` (servers should
 * map that to a 400).
 */
export function riyadhCalendarDayBoundsUnix(
  dateStr: string,
): { startUnix: number; endUnix: number } | null {
  const parts = parseRiyadhDate(dateStr);
  if (!parts) return null;
  // Riyadh midnight = UTC midnight − 3h (UTC+3, no DST).
  const startUnix =
    Date.UTC(parts.year, parts.monthIndex, parts.day) / 1000 - RIYADH_OFFSET_MS / 1000;
  return { startUnix, endUnix: startUnix + DAY_MS / 1000 };
}
