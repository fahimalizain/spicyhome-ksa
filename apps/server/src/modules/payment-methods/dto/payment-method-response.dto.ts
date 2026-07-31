import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class PaymentMethodResponse {
  @ApiProperty({ example: 'cash' })
  id!: string;

  @ApiProperty({ example: 'Cash' })
  title!: string;

  @ApiProperty({
    example: '10',
    description: 'ZATCA UN/ECE 4461 Payment Means code (allow-list: 10, 30, 42, 48, 1)',
  })
  zatcaPaymentMeansCode!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({ ...ApiInt32, example: 0 })
  sortOrder!: number;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  updatedBy!: number | null;
}
