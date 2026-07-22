import { ApiProperty } from '@nestjs/swagger';

export class AuditLogEntry {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  orderId!: number;

  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ example: 'created' })
  action!: string;

  @ApiProperty({ example: '{"type":"dine_in","tableId":1}' })
  payload!: string;

  @ApiProperty({ example: '' })
  prevHash!: string;

  @ApiProperty({ example: 'abc123...' })
  hash!: string;

  @ApiProperty({ example: 1700000000 })
  createdAt!: number;
}
