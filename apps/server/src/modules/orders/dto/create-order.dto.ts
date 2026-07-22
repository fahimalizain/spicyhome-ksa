import { IsString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderType } from '@spicyhome/shared';

export class CreateOrderDto {
  @ApiProperty({ enum: ['dine_in', 'takeaway'], example: 'dine_in' })
  @IsString()
  @IsIn([OrderType.DINE_IN, OrderType.TAKEAWAY])
  type!: typeof OrderType.DINE_IN | typeof OrderType.TAKEAWAY;

  @ApiPropertyOptional({ example: 1, description: 'Required for dine_in' })
  @IsOptional()
  @IsInt()
  tableId?: number;
}

export class AddOrderItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  itemId!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ example: 'no onion' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrderItemDto {
  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @ApiPropertyOptional({ example: 'extra cheese' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReprintOrderDto {
  @ApiProperty({ enum: ['receipt', 'kitchen'], example: 'receipt' })
  @IsString()
  @IsIn(['receipt', 'kitchen'])
  target!: string;
}
