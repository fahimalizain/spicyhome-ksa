import { BadRequestException } from '@nestjs/common';
import { getServiceDayBoundsUnix } from '@spicyhome/shared';

/**
 * A half-open report window over service-day labels (Asia/Riyadh).
 * `[startUnix, endUnix)` Unix seconds — the service day of `from` 05:00
 * through the service day of `to` 05:00 (exclusive).
 *
 * Reused by every report endpoint that takes a `from`/`to` business-date
 * range (sales register today, item-wise sales later).
 */
export interface ReportPeriod {
  startUnix: number;
  endUnix: number;
}

/**
 * Parse and validate a required `from`/`to` business-date range.
 *
 * Both values must be valid `YYYY-MM-DD` service-day labels (see
 * `getServiceDayBoundsUnix`). Throws:
 * - 400 when either value is missing,
 * - 400 `Invalid date: <value> (expected YYYY-MM-DD)` when a value is not a
 *   valid label (same wording as `OrdersService.listOrders`),
 * - 400 when `from` sorts after `to`.
 */
export function parseReportPeriod(from?: string, to?: string): ReportPeriod {
  if (!from || !to) {
    throw new BadRequestException('from and to are required (expected YYYY-MM-DD)');
  }

  const fromBounds = getServiceDayBoundsUnix(from);
  if (!fromBounds) {
    throw new BadRequestException(`Invalid date: ${from} (expected YYYY-MM-DD)`);
  }

  const toBounds = getServiceDayBoundsUnix(to);
  if (!toBounds) {
    throw new BadRequestException(`Invalid date: ${to} (expected YYYY-MM-DD)`);
  }

  // YYYY-MM-DD labels compare lexicographically like chronologically.
  if (from > to) {
    throw new BadRequestException('from must not be after to');
  }

  return { startUnix: fromBounds.startUnix, endUnix: toBounds.endUnix };
}
