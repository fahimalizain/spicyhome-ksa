import { IsInt, IsOptional, IsString, Min, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class SyncOrderItemDto {
  @ApiPropertyOptional({
    ...ApiInt64,
    example: 10,
    description: 'Existing order item ID to update',
  })
  @IsOptional()
  @IsInt()
  orderItemId?: number;

  @ApiPropertyOptional({
    ...ApiInt64,
    example: 5,
    description: 'Menu item ID for new lines (required when orderItemId absent)',
  })
  @IsOptional()
  @IsInt()
  itemId?: number;

  @ApiProperty({ ...ApiInt32, example: 2, description: 'Desired quantity (≥1)' })
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ type: String, example: 'no onion', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class SyncOrderItemsDto {
  @ApiProperty({
    ...ApiInt64,
    example: 1720000000,
    description:
      'Last known orders.updated_at the client hydrated from. Server returns 409 if stale.',
  })
  @IsInt()
  baseUpdatedAt!: number;

  @ApiProperty({
    type: [SyncOrderItemDto],
    description: 'Full desired cart — missing existing lines are removed',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOrderItemDto)
  items!: SyncOrderItemDto[];
}
