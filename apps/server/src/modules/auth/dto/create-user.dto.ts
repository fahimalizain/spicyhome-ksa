import { IsString, MinLength, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'cashier1' })
  @IsString()
  @MinLength(1)
  username!: string;

  @ApiProperty({ example: '1234' })
  @IsString()
  @MinLength(4)
  pin!: string;

  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 2, description: 'role_id — 1 for admin, 2 for staff' })
  @IsInt()
  roleId!: number;
}
