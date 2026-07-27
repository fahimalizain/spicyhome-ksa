import { IsString, MinLength, IsInt, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class UpdateUserDto {
  @ApiPropertyOptional({ type: String, example: 'Ahmed Ali' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ ...ApiInt64, example: 2 })
  @IsOptional()
  @IsInt()
  roleId?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: String, example: '5678', description: 'New PIN (4-6 digits)' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  pin?: string;
}
