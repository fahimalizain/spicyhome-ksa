/**
 * Formats an elapsed duration in seconds as a compact, human-readable string
 * without zero-padding. Omitted higher units and zero trailing segments are
 * omitted:
 *
 * - 0        → `0s`
 * - 45       → `45s`
 * - 60       → `1m`
 * - 65       → `1m 5s`
 * - 3600     → `1h`
 * - 3605     → `1h 5s`
 * - 3660     → `1h 1m`
 * - 3665     → `1h 1m 5s`
 * - 7325     → `2h 2m 5s`
 *
 * Negative inputs are clamped to `0s`.
 */
export function formatElapsed(seconds: number): string {
  const totalSec = Math.max(0, seconds);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);

  if (h > 0) {
    if (m === 0 && s === 0) return `${h}h`;
    if (m === 0) return `${h}h ${s}s`;
    if (s === 0) return `${h}h ${m}m`;
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  }
  return `${s}s`;
}
