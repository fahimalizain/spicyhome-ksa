import { ApiProperty } from '@nestjs/swagger';

export class RoleResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'staff' })
  name!: string;

  @ApiProperty({ example: true })
  createOrder!: boolean;

  @ApiProperty({ example: true })
  updateOrder!: boolean;

  @ApiProperty({ example: false })
  deleteOrderItem!: boolean;

  @ApiProperty({ example: false })
  voidOrder!: boolean;

  @ApiProperty({ example: false })
  refundOrder!: boolean;

  @ApiProperty({ example: false })
  manageMenu!: boolean;

  @ApiProperty({ example: false })
  manageTables!: boolean;

  @ApiProperty({ example: false })
  managePrinters!: boolean;

  @ApiProperty({ example: false })
  manageUsers!: boolean;

  @ApiProperty({ example: false })
  manageSettings!: boolean;

  @ApiProperty({ example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  updatedBy!: number | null;
}
