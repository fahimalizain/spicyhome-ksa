import { ApiProperty } from '@nestjs/swagger';

export class PrinterResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Kitchen' })
  name!: string;

  @ApiProperty({ example: '192.168.1.100' })
  ip!: string;

  @ApiProperty({ example: 9100 })
  port!: number;

  @ApiProperty({ example: 'kitchen' })
  role!: string;

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
