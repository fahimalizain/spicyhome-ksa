import { IsString, MinLength, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'manager' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  createOrder?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  updateOrder?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  deleteOrderItem?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  voidOrder?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  refundOrder?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  manageMenu?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  manageTables?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  managePrinters?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  manageUsers?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  manageSettings?: boolean;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'manager' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  createOrder?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  updateOrder?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  deleteOrderItem?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  voidOrder?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  refundOrder?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  manageMenu?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  manageTables?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  managePrinters?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  manageUsers?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  manageSettings?: boolean;
}
