import { IsString, MinLength, IsInt, IsOptional, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  categoryId!: number;

  @ApiProperty({ example: 'Zinger Burger' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'زنجر برجر' })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({ example: 2300, description: 'VAT-inclusive price in halalas (23.00 SAR)' })
  @IsInt()
  @Min(0)
  priceHalalas!: number;

  @ApiPropertyOptional({ default: 1500, description: 'VAT rate in basis points (1500 = 15%)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  vatRateBp?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priceHalalas?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  vatRateBp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
