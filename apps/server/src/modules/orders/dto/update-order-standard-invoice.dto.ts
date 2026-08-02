import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';
import { ZatcaBuyerDetailsDto } from './zatca-buyer-details.dto';

/**
 * PATCH /orders/:id/standard-invoice — set or clear the ZATCA standard
 * invoice buyer details on an open order.
 *
 * `isStandardInvoice: true` persists the buyer on the order so a later
 * submit (with only `baseUpdatedAt`) still produces a standard invoice;
 * `isStandardInvoice: false` clears the flag and the buyer. The buyer is
 * required when enabling (400 otherwise) and ignored when clearing.
 */
export class UpdateOrderStandardInvoiceDto {
  @ApiProperty({
    ...ApiInt64,
    example: 1720000000,
    description:
      'Last known orders.updated_at the client hydrated from. Server returns 409 if stale.',
  })
  @IsInt()
  baseUpdatedAt!: number;

  @ApiProperty({
    description: 'Enable (true) or clear (false) the ZATCA standard invoice buyer details.',
    example: false,
  })
  @IsBoolean()
  isStandardInvoice!: boolean;

  @ApiPropertyOptional({
    type: ZatcaBuyerDetailsDto,
    description:
      'ZATCA standard invoice buyer details — required when isStandardInvoice is true; ignored when false.',
  })
  @IsOptional()
  zatcaBuyerDetails?: ZatcaBuyerDetailsDto;
}
