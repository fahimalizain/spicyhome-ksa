import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class PromotionResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ example: 'KSA National Day' })
  name!: string;

  @ApiProperty({ example: 'اليوم الوطني' })
  nameAr!: string;

  /** Basis points: 1000 = 10%. */
  @ApiProperty({ ...ApiInt32, example: 1000 })
  percentBp!: number;

  /** Inclusive Business Date YYYY-MM-DD. */
  @ApiProperty({ example: '2026-09-23' })
  startBusinessDate!: string;

  /** Inclusive Business Date YYYY-MM-DD. */
  @ApiProperty({ example: '2026-09-25' })
  endBusinessDate!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;

  /** False once the current service day has passed endBusinessDate (read-only). */
  @ApiProperty({ example: true })
  canEdit!: boolean;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  updatedBy!: number | null;
}
