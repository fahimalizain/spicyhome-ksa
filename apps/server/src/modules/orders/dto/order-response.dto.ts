import { ApiProperty } from '@nestjs/swagger';
import { OrderItemResponse } from './order-item-response.dto';
import { OrderEventResponse } from './order-event-response.dto';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class OrderResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ ...ApiInt64, example: 1 })
  orderNo!: number;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  uuid!: string;

  @ApiProperty({ example: 'dine_in' })
  type!: string;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  tableId!: number | null;

  @ApiProperty({ ...ApiInt64, example: 1 })
  dayOpeningId!: number;

  @ApiProperty({ example: 'open' })
  status!: string;

  @ApiProperty({ ...ApiInt64, example: 4000 })
  subtotalHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 600 })
  vatHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 4600 })
  totalHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 0 })
  discountHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  updatedBy!: number | null;

  @ApiProperty({ type: [OrderItemResponse] })
  items!: OrderItemResponse[];

  @ApiProperty({ type: [OrderEventResponse] })
  events!: OrderEventResponse[];
}
