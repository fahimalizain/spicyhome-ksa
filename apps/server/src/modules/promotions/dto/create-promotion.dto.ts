import { IsString, MinLength, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt32 } from '../../../common/api-property-helpers';

export class CreatePromotionDto {
  @ApiProperty({ example: 'KSA National Day' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'اليوم الوطني' })
  @IsString()
  @MinLength(1)
  nameAr!: string;

  /** Basis points: 1000 = 10%. Range 1..10000. */
  @ApiProperty({ ...ApiInt32, example: 1000, minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  percentBp!: number;

  /** Inclusive Business Date YYYY-MM-DD. */
  @ApiProperty({ example: '2026-09-23' })
  @IsString()
  @MinLength(1)
  startBusinessDate!: string;

  /** Inclusive Business Date YYYY-MM-DD. */
  @ApiProperty({ example: '2026-09-25' })
  @IsString()
  @MinLength(1)
  endBusinessDate!: string;
}

export class UpdatePromotionDto {
  @ApiPropertyOptional({ type: String, example: 'KSA National Day' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ type: String, example: 'اليوم الوطني' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  nameAr?: string;

  /** Basis points: 1000 = 10%. Range 1..10000. */
  @ApiPropertyOptional({ ...ApiInt32, example: 1000, minimum: 1, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  percentBp?: number;

  /** Inclusive Business Date YYYY-MM-DD. */
  @ApiPropertyOptional({ type: String, example: '2026-09-23' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  startBusinessDate?: string;

  /** Inclusive Business Date YYYY-MM-DD. */
  @ApiPropertyOptional({ type: String, example: '2026-09-25' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  endBusinessDate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
