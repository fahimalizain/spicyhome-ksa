import { IsString, MinLength, IsInt, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt32 } from '../../../common/api-property-helpers';

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'SADAD' })
  @IsString()
  @MinLength(1)
  title!: string;
}

export class UpdatePaymentMethodDto {
  @ApiPropertyOptional({ type: String, example: 'SADAD' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ ...ApiInt32, default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
