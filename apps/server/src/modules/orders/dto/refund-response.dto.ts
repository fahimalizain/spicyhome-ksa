import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class RefundItemResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ ...ApiInt64, example: 5 })
  orderItemId!: number;

  @ApiProperty({ example: 'Burger' })
  itemName!: string;

  @ApiProperty({ ...ApiInt64, example: 2500 })
  unitPriceHalalas!: number;

  @ApiProperty({ ...ApiInt32, example: 1500 })
  vatRateBp!: number;

  @ApiProperty({ ...ApiInt32, example: 2 })
  qty!: number;

  @ApiProperty({ ...ApiInt64, example: 5000 })
  totalHalalas!: number;
}

export class OrderRefundResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ ...ApiInt64, example: 10 })
  orderId!: number;

  @ApiProperty({ ...ApiInt64, example: 3 })
  userId!: number;

  @ApiProperty({ ...ApiInt64, example: 4348 })
  subtotalHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 652 })
  vatHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 5000 })
  totalHalalas!: number;

  @ApiProperty({ type: String, example: 'Customer changed mind', nullable: true })
  reason!: string | null;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ type: [RefundItemResponse] })
  items!: RefundItemResponse[];
}
