/**
 * Service-day helpers for Asia/Riyadh timezone.
 *
 * A **service day** at SpicyHome runs from 05:00 to (next day) 05:00
 * in Asia/Riyadh (+03:00, no DST). Used for JWT access-token expiry;
 * intended for future business-day alignment.
 *
 * - Window: [D 05:00, (D+1) 05:00)  (half-open).
 * - Label D: YYYY-MM-DD = start date of the window.
 * - Times before 05:00 belong to the **previous** service day.
 *
 * These helpers use an explicit UTC+3 offset — they do **not** depend on
 * `process.env.TZ` or the host timezone.
 */

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, no DST
const SERVICE_DAY_HOUR = 5;

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
