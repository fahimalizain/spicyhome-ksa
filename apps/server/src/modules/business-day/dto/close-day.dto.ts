import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CloseDayDto {
  @ApiProperty({ description: 'Closing cash counted in halalas', example: 125000 })
  @IsInt()
  @Min(0)
  closingCashHalalas!: number;
}

export class CloseDayResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '2026-07-22' })
  businessDate!: string;

  @ApiProperty({ example: 'closed' })
  status!: string;

  @ApiProperty({ example: 50000 })
  openingCashHalalas!: number;

  @ApiProperty()
  openedAt!: number;

  @ApiProperty()
  openedBy!: number;

  @ApiProperty()
  closedAt!: number;

  @ApiProperty()
  closedBy!: number;

  @ApiProperty({ example: 125000 })
  closingCashHalalas!: number;

  @ApiProperty({ example: 46000 })
  totalSalesHalalas!: number;

  @ApiProperty({ example: 6000 })
  totalVatHalalas!: number;

  @ApiProperty({ example: 5 })
  orderCount!: number;
}
