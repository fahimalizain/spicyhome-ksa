import { ApiProperty } from '@nestjs/swagger';

export class PrintResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: [] })
  errors!: string[];
}
