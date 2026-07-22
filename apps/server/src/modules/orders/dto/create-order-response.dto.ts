import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  uuid!: string;

  @ApiProperty({ example: 1 })
  orderNo!: number;
}
