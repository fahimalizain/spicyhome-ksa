import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class OpenDayDto {
  @ApiProperty({ ...ApiInt64, description: 'Opening cash counted in halalas', example: 50000 })
  @IsInt()
  @Min(0)
  openingCashHalalas!: number;
}

export class DayOpeningResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ example: '2026-07-22' })
  businessDate!: string;

  @ApiProperty({ example: 'open' })
  status!: string;

  @ApiProperty({ ...ApiInt64, example: 50000 })
  openingCashHalalas!: number;

  @ApiProperty({ ...ApiInt64 })
  openedAt!: number;

  @ApiProperty({ ...ApiInt64 })
  openedBy!: number;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  closedAt?: number | null;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  closedBy?: number | null;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  closingCashHalalas?: number | null;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  totalSalesHalalas?: number | null;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  totalVatHalalas?: number | null;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  orderCount?: number | null;

  @ApiProperty({ ...ApiInt64 })
  createdAt!: number;

  @ApiProperty({ ...ApiInt64 })
  updatedAt!: number;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  createdBy?: number | null;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  updatedBy?: number | null;
}
