import { ApiProperty } from '@nestjs/swagger';

export class ItemResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  categoryId!: number;

  @ApiProperty({ example: 'Zinger Burger' })
  name!: string;

  @ApiProperty({ example: 'زنجر برجر', nullable: true })
  nameAr!: string | null;

  @ApiProperty({ example: 2300, description: 'VAT-inclusive price in halalas' })
  priceHalalas!: number;

  @ApiProperty({ example: 1500, description: 'VAT rate in basis points' })
  vatRateBp!: number;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  updatedBy!: number | null;
}
