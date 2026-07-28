import {
  IsString,
  IsInt,
  IsBoolean,
  IsArray,
  IsOptional,
  Min,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';
import { ZatcaBuyerDetailsDto } from './zatca-buyer-details.dto';

export class PaymentLineDto {
  @ApiProperty({ example: 'card', description: 'Payment method slug' })
  @IsString()
  methodId!: string;

  @ApiProperty({ ...ApiInt64, example: 5000, description: 'Amount in halalas' })
  @IsInt()
  @Min(1)
  amountHalalas!: number;

  @ApiPropertyOptional({
    ...ApiInt64,
    example: 10000,
    description: 'Cash tendered amount in halalas (cash only)',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  tenderedHalalas?: number;
}

export class PayOrderDto {
  @ApiProperty({
    type: [PaymentLineDto],
    description: 'Payment lines (at least one required)',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  @ArrayNotEmpty()
  payments!: PaymentLineDto[];

  // ── Standard invoice (ZATCA) ──────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Enable standard invoice with buyer details for ZATCA',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isStandardInvoice?: boolean;

  @ApiPropertyOptional({
    description: 'ZATCA standard invoice buyer details (required when isStandardInvoice is true)',
    type: ZatcaBuyerDetailsDto,
  })
  @IsOptional()
  zatcaBuyerDetails?: ZatcaBuyerDetailsDto;
}
