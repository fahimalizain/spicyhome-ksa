import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponse {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class StatusResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'sent' })
  status!: string;
}
