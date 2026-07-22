import { ApiProperty } from '@nestjs/swagger';

export class MeResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'cashier1' })
  username!: string;

  @ApiProperty({ example: 'Ahmed' })
  name!: string;

  @ApiProperty({ example: 2 })
  roleId!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 'staff' })
  roleName!: string;

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
}
