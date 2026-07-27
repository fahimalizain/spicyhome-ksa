import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponse {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class AddOrderItemResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 1, description: 'order_items.id of the newly created line' })
  orderItemId!: number;
}

export class StatusResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'paid' })
  status!: string;
}

export class RefundResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 1 })
  refundId!: number;

  @ApiProperty({ example: 'paid' })
  status!: string;
}
