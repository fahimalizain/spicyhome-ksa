import { IsString, IsIn, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderType } from '@spicyhome/shared';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class UpdateOrderMetaDto {
  @ApiProperty({
    ...ApiInt64,
    example: 1720000000,
    description:
      'Last known orders.updated_at the client hydrated from. Server returns 409 if stale.',
  })
  @IsInt()
  baseUpdatedAt!: number;

  @ApiProperty({ enum: ['dine_in', 'takeaway'], example: 'dine_in' })
  @IsString()
  @IsIn([OrderType.DINE_IN, OrderType.TAKEAWAY])
  type!: typeof OrderType.DINE_IN | typeof OrderType.TAKEAWAY;

  @ApiPropertyOptional({
    ...ApiInt64,
    example: 1,
    description:
      'Target table (required for dine_in). Ignored and forced to null when type is takeaway.',
  })
  @IsOptional()
  @IsInt()
  tableId?: number;
}
