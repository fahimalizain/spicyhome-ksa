import { IsString, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

/**
 * PATCH /orders/:id/partner body (ADR 0007).
 *
 * `deliveryPartnerId` is the delivery-partner slug to set, `null` to clear
 * (which also resets every line price to the live catalog and force-nulls
 * `deliveryExternalRef`), or omitted to keep the current partner. When
 * omitted, `deliveryExternalRef` may still be sent alone to edit the
 * external ref of an already-linked order.
 */
export class UpdateOrderPartnerDto {
  @ApiProperty({
    ...ApiInt64,
    example: 1720000000,
    description:
      'Last known orders.updated_at the client hydrated from. Server returns 409 if stale.',
  })
  @IsInt()
  baseUpdatedAt!: number;

  @ApiPropertyOptional({
    example: 'hungerstation',
    nullable: true,
    description:
      'Delivery partner slug to set, or null to clear the partner (resets line prices to the live catalog). Omit to keep the current partner.',
  })
  @IsOptional()
  @IsString()
  deliveryPartnerId?: string | null;

  @ApiPropertyOptional({
    example: 'HS-883129',
    nullable: true,
    description:
      "Delivery app's order number for reconciliation. Optional; may be sent alone to edit the ref of an already-linked order. Force-nulled when the partner is cleared or absent.",
  })
  @IsOptional()
  @IsString()
  deliveryExternalRef?: string | null;
}
