import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Burgers' })
  name!: string;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ example: 1, nullable: true })
  printerId!: number | null;

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
