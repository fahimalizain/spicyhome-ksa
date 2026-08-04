import { IsString, MinLength, IsInt, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class CreateSubcategoryDto {
  @ApiProperty({ ...ApiInt64, example: 1, description: 'Parent category ID' })
  @IsInt()
  categoryId!: number;

  @ApiProperty({ example: 'Non Veg' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ ...ApiInt32, default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSubcategoryDto {
  @ApiPropertyOptional({ ...ApiInt64, description: 'Parent category ID' })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ type: String, example: 'Non Veg' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ ...ApiInt32 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
