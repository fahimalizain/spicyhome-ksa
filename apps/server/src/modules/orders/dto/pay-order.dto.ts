import { IsString, IsInt, IsOptional, Min, ValidateNested, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

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
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  @ArrayNotEmpty()
  payments!: PaymentLineDto[];
}
