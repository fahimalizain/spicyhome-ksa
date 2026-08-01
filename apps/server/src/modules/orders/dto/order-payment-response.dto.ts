import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class OrderPaymentResponse {
  @ApiProperty({ ...ApiInt64, example: 1, description: 'Payment line id' })
  id!: number;

  @ApiProperty({ example: 'card', description: 'Payment method slug' })
  methodId!: string;

  @ApiProperty({ example: 'Card', description: 'Payment method display title' })
  methodTitle!: string;

  @ApiProperty({
    example: '48',
    description: 'ZATCA UN/ECE 4461 Payment Means code snapshot at pay time',
  })
  zatcaPaymentMeansCode!: string;

  @ApiProperty({ ...ApiInt64, example: 5000, description: 'Amount paid in halalas' })
  amountHalalas!: number;

  @ApiProperty({
    ...ApiInt64,
    example: 5000,
    description: 'Cash tendered in halalas (null for non-cash)',
    nullable: true,
  })
  tenderedHalalas!: number | null;

  @ApiProperty({
    ...ApiInt64,
    example: 0,
    description: 'Change given in halalas (null for non-cash)',
    nullable: true,
  })
  changeHalalas!: number | null;

  @ApiProperty({ ...ApiInt64, example: 1700000000, description: 'Payment line creation time' })
  createdAt!: number;
}
