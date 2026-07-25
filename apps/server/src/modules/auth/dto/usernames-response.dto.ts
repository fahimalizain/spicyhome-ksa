import { ApiProperty } from '@nestjs/swagger';

export class UsernamesResponse {
  @ApiProperty({ type: [String], example: ['admin', 'cashier1'] })
  usernames!: string[];
}
