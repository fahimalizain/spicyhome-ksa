import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class AuditLogEntry {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ ...ApiInt64, example: 1 })
  orderId!: number;

  @ApiProperty({ ...ApiInt64, example: 1 })
  userId!: number;

  @ApiProperty({ example: 'created' })
  action!: string;

  @ApiProperty({ example: '{"type":"dine_in","tableId":1}' })
  payload!: string;

  @ApiProperty({ example: '' })
  prevHash!: string;

  @ApiProperty({ example: 'abc123...' })
  hash!: string;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  createdAt!: number;
}
