import { ApiProperty } from '@nestjs/swagger';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';
import { PrinterConfigDto } from './create-printer.dto';

export class PrinterResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ example: 'Kitchen' })
  name!: string;

  @ApiProperty({ example: '192.168.1.100' })
  ip!: string;

  @ApiProperty({ ...ApiInt32, example: 9100 })
  port!: number;

  @ApiProperty({ example: 'kitchen' })
  role!: string;

  @ApiProperty({ type: PrinterConfigDto })
  @ValidateNested()
  @Type(() => PrinterConfigDto)
  config!: PrinterConfigDto;

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
