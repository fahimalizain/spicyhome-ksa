import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class UserOptionResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ example: 'cashier1' })
  username!: string;

  @ApiProperty({ example: 'Ahmed' })
  name!: string;
}
