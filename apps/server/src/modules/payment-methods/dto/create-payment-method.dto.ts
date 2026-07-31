import { IsString, MinLength, IsInt, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt32 } from '../../../common/api-property-helpers';
import { ZATCA_PAYMENT_MEANS_CODES } from '@spicyhome/shared';

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'SADAD' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({
    example: '30',
    description: 'ZATCA UN/ECE 4461 Payment Means code (allow-list: 10, 30, 42, 48, 1)',
  })
  @IsIn([...ZATCA_PAYMENT_MEANS_CODES])
  zatcaPaymentMeansCode!: string;
}

export class UpdatePaymentMethodDto {
  @ApiPropertyOptional({ type: String, example: 'SADAD' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({
    example: '30',
    description: 'ZATCA UN/ECE 4461 Payment Means code (allow-list: 10, 30, 42, 48, 1)',
  })
  @IsOptional()
  @IsIn([...ZATCA_PAYMENT_MEANS_CODES])
  zatcaPaymentMeansCode?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ ...ApiInt32, default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
