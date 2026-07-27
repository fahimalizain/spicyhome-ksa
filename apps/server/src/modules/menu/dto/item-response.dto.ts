import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class ItemResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ ...ApiInt64, example: 1 })
  categoryId!: number;

  @ApiProperty({ example: 'Zinger Burger' })
  name!: string;

  @ApiProperty({ type: String, example: 'زنجر برجر', nullable: true })
  nameAr!: string | null;

  @ApiProperty({ ...ApiInt64, example: 2300, description: 'VAT-inclusive price in halalas' })
  priceHalalas!: number;

  @ApiProperty({ ...ApiInt32, example: 1500, description: 'VAT rate in basis points' })
  vatRateBp!: number;

  @ApiProperty({ ...ApiInt32, example: 0 })
  sortOrder!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  updatedBy!: number | null;
}
