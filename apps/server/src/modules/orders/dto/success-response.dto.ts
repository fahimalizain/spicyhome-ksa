import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class SuccessResponse {
  @ApiProperty({ example: true })
  success!: boolean;
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

  @ApiProperty({ ...ApiInt64, example: 1 })
  refundId!: number;

  @ApiProperty({ example: 'paid' })
  status!: string;
}
