import { ApiProperty } from '@nestjs/swagger';

export class RefundItemResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 5 })
  orderItemId!: number;

  @ApiProperty({ example: 'Burger' })
  itemName!: string;

  @ApiProperty({ example: 2500 })
  unitPriceHalalas!: number;

  @ApiProperty({ example: 1500 })
  vatRateBp!: number;

  @ApiProperty({ example: 2 })
  qty!: number;

  @ApiProperty({ example: 5000 })
  totalHalalas!: number;
}

export class OrderRefundResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 10 })
  orderId!: number;

  @ApiProperty({ example: 3 })
  userId!: number;

  @ApiProperty({ example: 4348 })
  subtotalHalalas!: number;

  @ApiProperty({ example: 652 })
  vatHalalas!: number;

  @ApiProperty({ example: 5000 })
  totalHalalas!: number;

  @ApiProperty({ example: 'Customer changed mind' })
  reason!: string | null;

  @ApiProperty({ example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ type: [RefundItemResponse] })
  items!: RefundItemResponse[];
}
