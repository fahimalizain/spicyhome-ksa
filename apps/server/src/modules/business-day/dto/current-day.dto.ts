import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class CurrentDayResponse {
  @ApiProperty({ description: 'Whether a business day is open', example: true })
  open!: boolean;

  @ApiPropertyOptional({ ...ApiInt64, example: 1 })
  id?: number;

  @ApiPropertyOptional({ example: '2026-07-22' })
  businessDate?: string;

  @ApiPropertyOptional({ example: 'open' })
  status?: string;

  @ApiPropertyOptional({ ...ApiInt64, example: 50000 })
  openingCashHalalas?: number;

  @ApiPropertyOptional({ ...ApiInt64 })
  openedAt?: number;

  @ApiPropertyOptional({ ...ApiInt64 })
  openedBy?: number;

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

  @ApiPropertyOptional({ ...ApiInt64 })
  createdAt?: number;

  @ApiPropertyOptional({ ...ApiInt64 })
  updatedAt?: number;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  createdBy?: number | null;

  @ApiPropertyOptional({ ...ApiInt64, nullable: true })
  updatedBy?: number | null;

  // Live X-report fields (only present when open)
  @ApiPropertyOptional({ ...ApiInt64, description: 'Live sales total (halalas) for open day' })
  liveSalesHalalas?: number;

  @ApiPropertyOptional({ ...ApiInt64, description: 'Live VAT total (halalas) for open day' })
  liveVatHalalas?: number;

  @ApiPropertyOptional({ ...ApiInt64, description: 'Live paid order count for open day' })
  liveOrderCount?: number;
}
