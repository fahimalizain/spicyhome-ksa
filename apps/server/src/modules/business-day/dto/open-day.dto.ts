import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class OpenDayDto {
  @ApiProperty({ description: 'Opening cash counted in halalas', example: 50000 })
  @IsInt()
  @Min(0)
  openingCashHalalas!: number;
}

export class DayOpeningResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '2026-07-22' })
  businessDate!: string;

  @ApiProperty({ example: 'open' })
  status!: string;

  @ApiProperty({ example: 50000 })
  openingCashHalalas!: number;

  @ApiProperty()
  openedAt!: number;

  @ApiProperty()
  openedBy!: number;

  @ApiPropertyOptional({ nullable: true })
  closedAt?: number | null;

  @ApiPropertyOptional({ nullable: true })
  closedBy?: number | null;

  @ApiPropertyOptional({ nullable: true })
  closingCashHalalas?: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalSalesHalalas?: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalVatHalalas?: number | null;

  @ApiPropertyOptional({ nullable: true })
  orderCount?: number | null;

  @ApiProperty()
  createdAt!: number;

  @ApiProperty()
  updatedAt!: number;

  @ApiPropertyOptional({ nullable: true })
  createdBy?: number | null;

  @ApiPropertyOptional({ nullable: true })
  updatedBy?: number | null;
}
