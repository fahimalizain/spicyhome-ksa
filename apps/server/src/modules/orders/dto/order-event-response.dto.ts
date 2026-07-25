import { ApiProperty } from '@nestjs/swagger';

export class OrderEventResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  orderId!: number;

  @ApiProperty({ example: 1 })
  eventIdx!: number;

  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ example: 'item_added' })
  type!: string;

  @ApiProperty({ example: '{"orderItemId":1,"itemName":"Burger","qty":1}' })
  payload!: string;

  @ApiProperty({ example: '' })
  prevHash!: string;

  @ApiProperty({ example: 'abc123...' })
  hash!: string;

  @ApiProperty({ example: 1700000000 })
  createdAt!: number;
}
