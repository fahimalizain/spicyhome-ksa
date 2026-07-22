import { ApiProperty } from '@nestjs/swagger';

export class PrinterStatusResponse {
  @ApiProperty({ example: true })
  reachable!: boolean;
}
