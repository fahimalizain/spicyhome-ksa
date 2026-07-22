import { ApiProperty } from '@nestjs/swagger';
import { OrderItemResponse } from './order-item-response.dto';
import { AuditLogEntry } from './audit-log-entry.dto';

export class OrderResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  orderNo!: number;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  uuid!: string;

  @ApiProperty({ example: 'dine_in' })
  type!: string;

  @ApiProperty({ example: 1, nullable: true })
  tableId!: number | null;

  @ApiProperty({ example: 1 })
  dayOpeningId!: number;

  @ApiProperty({ example: 'open' })
  status!: string;

  @ApiProperty({ example: 4000 })
  subtotalHalalas!: number;

  @ApiProperty({ example: 600 })
  vatHalalas!: number;

  @ApiProperty({ example: 4600 })
  totalHalalas!: number;

  @ApiProperty({ example: 0 })
  discountHalalas!: number;

  @ApiProperty({ example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  updatedBy!: number | null;

  @ApiProperty({ type: [OrderItemResponse] })
  items!: OrderItemResponse[];

  @ApiProperty({ type: [AuditLogEntry] })
  auditLog!: AuditLogEntry[];
}
