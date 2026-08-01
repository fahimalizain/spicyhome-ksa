import { IsString, IsInt, IsOptional, Min, NotEquals } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

/**
 * Append ONE payment line to an open order (ADR 0006). Status stays `open`;
 * finalization happens later via submit. `amountHalalas` is a signed integer:
 * negatives are allowed as correction/balancing lines.
 */
export class AddOrderPaymentDto {
  @ApiProperty({ example: 'card', description: 'Payment method slug' })
  @IsString()
  methodId!: string;

  @ApiProperty({
    ...ApiInt64,
    example: 5000,
    description:
      'Amount in halalas. Signed integer: positive lines are payments, negative lines are corrections. Zero is rejected.',
  })
  @IsInt()
  @NotEquals(0)
  amountHalalas!: number;

  @ApiPropertyOptional({
    ...ApiInt64,
    example: 10000,
    description: 'Cash tendered amount in halalas (positive cash lines only)',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  tenderedHalalas?: number;
}
