import { ApiProperty } from '@nestjs/swagger';

export class OrderItemResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  orderId!: number;

  @ApiProperty({ example: 1, nullable: true })
  itemId!: number | null;

  @ApiProperty({ example: 'Zinger Burger' })
  itemName!: string;

  @ApiProperty({ example: 2300 })
  unitPriceHalalas!: number;

  @ApiProperty({ example: 1500 })
  vatRateBp!: number;

  @ApiProperty({ example: 2 })
  qty!: number;

  @ApiProperty({ example: 4600 })
  totalHalalas!: number;

  @ApiProperty({ example: 'no onion', nullable: true })
  notes!: string | null;

  @ApiProperty({ example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  updatedBy!: number | null;
}
