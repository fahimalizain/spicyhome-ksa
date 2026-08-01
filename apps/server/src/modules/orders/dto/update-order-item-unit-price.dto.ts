import { IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

/**
 * PATCH /orders/:id/items/:orderItemId/unit-price body (ADR 0007).
 *
 * Per-line partner price override: sets `order_items.unit_price_halalas`
 * (the VAT-inclusive snapshot) and recomputes the line total and the order
 * totals. `unitPriceHalalas` must be an integer ≥ the live catalog
 * `items.price_halalas` at edit time (the floor); the server rejects
 * below-floor prices with the floor in the message.
 */
export class UpdateOrderItemUnitPriceDto {
  @ApiProperty({
    ...ApiInt64,
    example: 1720000000,
    description:
      'Last known orders.updated_at the client hydrated from. Server returns 409 if stale.',
  })
  @IsInt()
  baseUpdatedAt!: number;

  @ApiProperty({
    ...ApiInt64,
    example: 2500,
    description:
      'New VAT-inclusive unit price in halalas (SAR × 100). Must be an integer ≥ the live catalog items.price_halalas (the floor).',
  })
  @IsInt()
  unitPriceHalalas!: number;
}
