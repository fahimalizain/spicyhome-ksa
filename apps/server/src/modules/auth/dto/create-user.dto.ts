import { IsString, MinLength, IsInt, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

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

  @ApiProperty({ ...ApiInt64, example: 2, description: 'role_id — 1 for admin, 2 for staff' })
  @IsInt()
  roleId!: number;

  @ApiPropertyOptional({ example: true, description: 'Defaults to true (shown on Android login)' })
  @IsOptional()
  @IsBoolean()
  androidLogin?: boolean;
}
