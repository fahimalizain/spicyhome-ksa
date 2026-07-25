import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: 1 })
  refundId!: number;

  @ApiProperty({ example: 'paid' })
  status!: string;
}
