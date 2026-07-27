import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class OrderItemResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ ...ApiInt64, example: 1 })
  orderId!: number;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  itemId!: number | null;

  @ApiProperty({ example: 'Zinger Burger' })
  itemName!: string;

  @ApiProperty({ ...ApiInt64, example: 2300 })
  unitPriceHalalas!: number;

  @ApiProperty({ ...ApiInt32, example: 1500 })
  vatRateBp!: number;

  @ApiProperty({ ...ApiInt32, example: 2 })
  qty!: number;

  @ApiProperty({ ...ApiInt64, example: 4600 })
  totalHalalas!: number;

  @ApiProperty({ type: String, example: 'no onion', nullable: true })
  notes!: string | null;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  updatedBy!: number | null;
}
