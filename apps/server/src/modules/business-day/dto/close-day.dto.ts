import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class CloseDayDto {
  @ApiProperty({ ...ApiInt64, description: 'Closing cash counted in halalas', example: 125000 })
  @IsInt()
  @Min(0)
  closingCashHalalas!: number;
}

export class CloseDayResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ example: '2026-07-22' })
  businessDate!: string;

  @ApiProperty({ example: 'closed' })
  status!: string;

  @ApiProperty({ ...ApiInt64, example: 50000 })
  openingCashHalalas!: number;

  @ApiProperty({ ...ApiInt64 })
  openedAt!: number;

  @ApiProperty({ ...ApiInt64 })
  openedBy!: number;

  @ApiProperty({ ...ApiInt64 })
  closedAt!: number;

  @ApiProperty({ ...ApiInt64 })
  closedBy!: number;

  @ApiProperty({ ...ApiInt64, example: 125000 })
  closingCashHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 46000 })
  totalSalesHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 6000 })
  totalVatHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 5 })
  orderCount!: number;
}
