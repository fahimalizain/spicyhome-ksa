/**
 * Shared OpenAPI @ApiProperty type/format fragments to keep DTO annotations
 * consistent and avoid silent "type: object" for nullable primitives.
 *
 * All monetary values are integer halalas (SAR × 100) with int64 format.
 * All timestamps are integer Unix epochs with int64 format.
 * All IDs are int64. Small counters (qty, sortOrder, port, vatRateBp) are int32.
 */

/** ID fields, money (halalas), Unix timestamps */
export const ApiInt64 = { type: 'integer' as const, format: 'int64' as const };

/** qty, sortOrder, port, vatRateBp, page, limit, small counters */
export const ApiInt32 = { type: 'integer' as const, format: 'int32' as const };
