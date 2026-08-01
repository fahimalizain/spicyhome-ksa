import { IsString, IsIn, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderType } from '@spicyhome/shared';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class CreateOrderDto {
  @ApiProperty({ enum: ['dine_in', 'takeaway'], example: 'dine_in' })
  @IsString()
  @IsIn([OrderType.DINE_IN, OrderType.TAKEAWAY])
  type!: typeof OrderType.DINE_IN | typeof OrderType.TAKEAWAY;

  @ApiPropertyOptional({ ...ApiInt64, example: 1, description: 'Required for dine_in' })
  @IsOptional()
  @IsInt()
  tableId?: number;

  @ApiPropertyOptional({
    type: String,
    example: 'Call on arrival',
    nullable: true,
    description: 'Order-level notes ("Order notes"). An empty string is stored as null.',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class AddOrderItemDto {
  @ApiProperty({ ...ApiInt64, example: 1 })
  @IsInt()
  itemId!: number;

  @ApiProperty({ ...ApiInt32, example: 2 })
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ type: String, example: 'no onion' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrderItemDto {
  @ApiPropertyOptional({ ...ApiInt32, example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @ApiPropertyOptional({ type: String, example: 'extra cheese' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReprintOrderDto {
  @ApiProperty({
    enum: ['receipt', 'open_receipt'],
    example: 'receipt',
    description:
      "Print target: 'receipt' = ZATCA tax receipt reprint (paid); 'open_receipt' = non-ZATCA open order slip",
  })
  @IsString()
  @IsIn(['receipt', 'open_receipt'])
  target!: string;
}

export class RefundItemDto {
  @ApiProperty({ ...ApiInt64, example: 1 })
  @IsInt()
  orderItemId!: number;

  @ApiProperty({ ...ApiInt32, example: 1 })
  @IsInt()
  @Min(1)
  qty!: number;
}

export class CreateRefundDto {
  @ApiProperty({ type: [RefundItemDto], description: 'Items and quantities to refund' })
  @ValidateNested({ each: true })
  @Type(() => RefundItemDto)
  items!: RefundItemDto[];

  @ApiPropertyOptional({ type: String, example: 'Customer changed mind' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    type: String,
    example: 'cash',
    description: 'Payment method slug for this refund',
  })
  @IsString()
  methodId!: string;
}
