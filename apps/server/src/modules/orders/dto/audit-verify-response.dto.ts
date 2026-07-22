import { ApiProperty } from '@nestjs/swagger';

export class AuditVerifyResponse {
  @ApiProperty({ example: true })
  valid!: boolean;
}
