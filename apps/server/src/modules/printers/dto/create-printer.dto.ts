import { IsString, MinLength, IsInt, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePrinterDto {
  @ApiProperty({ example: 'Kitchen' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: '192.168.1.100' })
  @IsString()
  @MinLength(1)
  ip!: string;

  @ApiPropertyOptional({ default: 9100 })
  @IsOptional()
  @IsInt()
  port?: number;

  @ApiProperty({ enum: ['receipt', 'kitchen'], example: 'kitchen' })
  @IsString()
  @IsIn(['receipt', 'kitchen'])
  role!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePrinterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  ip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  port?: number;

  @ApiPropertyOptional({ enum: ['receipt', 'kitchen'] })
  @IsOptional()
  @IsString()
  @IsIn(['receipt', 'kitchen'])
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
