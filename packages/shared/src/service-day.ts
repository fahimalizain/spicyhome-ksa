/**
 * Service-day helpers for Asia/Riyadh timezone.
 *
 * A **service day** at SpicyHome runs from 05:00 to (next day) 05:00
 * in Asia/Riyadh (+03:00, no DST). Used for JWT access-token expiry and,
 * per ADR 0008 (docs/adr/0008-service-day-business-day.md), for the
 * business day: `day_openings.business_date`, the orders-list `?date=`
 * filter, and `daily_order_seq` reset all run on this window (upcoming
 * call sites).
 *
 * - Window: [D 05:00, (D+1) 05:00)  (half-open).
 * - Label D: YYYY-MM-DD = start date of the window.
 * - Times before 05:00 belong to the **previous** service day.
 *
 * These helpers use an explicit UTC+3 offset — they do **not** depend on
 * `process.env.TZ` or the host timezone.
 *
 * **Android Kotlin counterpart**: the file exists at
 * `apps/android/app/src/main/java/com/spicyhome/pos/util/ServiceDay.kt` —
 * keep the formulas in sync (same path).
 */

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, no DST
const SERVICE_DAY_HOUR = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface RiyadhComponents {
  year: number;
  /** 0-indexed month (January = 0). */
  month: number;
  /** Day of month (1–31). */
  day: number;
  /** Hours in Riyadh local time (0–23). */
  hours: number;
}

/**
 * Decompose a Unix-milliseconds instant into Asia/Riyadh local date components.
 *
 * Riyadh is permanently UTC+3 with no DST, so we add a fixed offset and read
 * the resulting UTC fields — they represent Riyadh local time.
 */
function toRiyadhComponents(nowMs: number): RiyadhComponents {
  const riyadhMs = nowMs + RIYADH_OFFSET_MS;
  const d = new Date(riyadhMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
  };
}

/**
 * Build a YYYY-MM-DD string from a UTC Date (±1 day corrections already applied).
 */
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Return the service-day label (YYYY-MM-DD) for `nowMs`.
 *
 * Times before 05:00 Asia/Riyadh belong to the **previous** calendar day.
 *
 * @param nowMs Unix milliseconds (e.g. `Date.now()`).
 */
export function getServiceDayString(nowMs: number): string {
  const { year, month, day, hours } = toRiyadhComponents(nowMs);

  if (hours < SERVICE_DAY_HOUR) {
    // Pre-05:00 → yesterday in Riyadh.
    const yesterdayMs = Date.UTC(year, month, day) - 86400000;
    return formatDate(new Date(yesterdayMs));
  }

  return formatDate(new Date(Date.UTC(year, month, day)));
}

/**
 * Return the Unix timestamp (seconds) of the **next** 05:00 Asia/Riyadh
 * service-day boundary.
 *
 * At exactly 05:00:00 the boundary is **tomorrow** 05:00 (half-open:
 * the current instant starts the new service day, so the next boundary
 * is +24h).
 *
 * @param nowMs Unix milliseconds (e.g. `Date.now()`).
 * @returns Unix **seconds** suitable for JWT `exp`.
 */
export function getNextServiceDayBoundaryUnix(nowMs: number): number {
  const { year, month, day, hours } = toRiyadhComponents(nowMs);

  // Compute the Riyadh calendar date whose 05:00 is the boundary.
  let boundaryMs: number;
  if (hours < SERVICE_DAY_HOUR) {
    // Next boundary = today at 05:00 Riyadh.
    boundaryMs = Date.UTC(year, month, day);
  } else {
    // Next boundary = tomorrow at 05:00 Riyadh.
    boundaryMs = Date.UTC(year, month, day) + 86400000;
  }

  const bd = new Date(boundaryMs);
  // Riyadh 05:00 = UTC 02:00 (UTC+3, no DST).
  return Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate(), 2, 0, 0) / 1000;
}

interface ParsedServiceDayDate {
  year: number;
  /** 0-indexed month (January = 0). */
  monthIndex: number;
  /** Day of month (1–31). */
  day: number;
}

/**
 * Parse and validate a service-day label (`YYYY-MM-DD`). Returns the date
 * parts, or `null` when the string is not a valid date (bad format,
 * unpadded parts, or out-of-range month/day, e.g. `2026-13-01` or
 * `2026-02-30`). Reject impossible calendar dates via Date.UTC round-trip.
 */
function parseServiceDayDate(dateStr: string): ParsedServiceDayDate | null {
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
 * the service day labeled `dateStr` (`YYYY-MM-DD` = D). Window =
 * `[D 05:00, (D+1) 05:00)` Asia/Riyadh. All instants in the service day
 * satisfy `startUnix <= t < endUnix`.
 *
 * Returns `null` when `dateStr` is not a valid `YYYY-MM-DD` (servers should
 * map that to a 400).
 *
 * @param dateStr Service-day label `YYYY-MM-DD` (the window's start date).
 */
export function getServiceDayBoundsUnix(
  dateStr: string,
): { startUnix: number; endUnix: number } | null {
  const parts = parseServiceDayDate(dateStr);
  if (!parts) return null;

  // Riyadh 05:00 = UTC 02:00 on the same calendar date components (UTC+3, no DST).
  const startUnix = Date.UTC(parts.year, parts.monthIndex, parts.day, 2, 0, 0) / 1000;
  return { startUnix, endUnix: startUnix + DAY_MS / 1000 };
}
