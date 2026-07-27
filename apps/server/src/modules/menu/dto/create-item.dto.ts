import { IsString, MinLength, IsInt, IsOptional, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class CreateItemDto {
  @ApiProperty({ ...ApiInt64, example: 1 })
  @IsInt()
  categoryId!: number;

  @ApiProperty({ example: 'Zinger Burger' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ type: String, example: 'زنجر برجر' })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({
    ...ApiInt64,
    example: 2300,
    description: 'VAT-inclusive price in halalas (23.00 SAR)',
  })
  @IsInt()
  @Min(0)
  priceHalalas!: number;

  @ApiPropertyOptional({
    ...ApiInt32,
    default: 1500,
    description: 'VAT rate in basis points (1500 = 15%)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  vatRateBp?: number;

  @ApiPropertyOptional({ ...ApiInt32, default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateItemDto {
  @ApiPropertyOptional({ ...ApiInt64 })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional({ ...ApiInt64 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceHalalas?: number;

  @ApiPropertyOptional({ ...ApiInt32 })
  @IsOptional()
  @IsInt()
  @Min(0)
  vatRateBp?: number;

  @ApiPropertyOptional({ ...ApiInt32 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
