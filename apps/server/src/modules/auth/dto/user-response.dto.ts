import { ApiProperty } from '@nestjs/swagger';

export class UserResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'cashier1' })
  username!: string;

  @ApiProperty({ example: 'Ahmed' })
  name!: string;

  @ApiProperty({ example: 2 })
  roleId!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  updatedBy!: number | null;
}
