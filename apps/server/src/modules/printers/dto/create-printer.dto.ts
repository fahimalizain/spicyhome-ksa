import {
  IsString,
  MinLength,
  IsInt,
  IsOptional,
  IsBoolean,
  IsIn,
  Min,
  Max,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt32 } from '../../../common/api-property-helpers';

export class PrinterArabicConfigDto {
  @ApiProperty({
    enum: ['none', 'utf8', 'pc864', 'w1256'],
    example: 'none',
    description: 'How to encode Arabic Unicode -> bytes before send',
  })
  @IsString()
  @IsIn(['none', 'utf8', 'pc864', 'w1256'])
  encoding!: 'none' | 'utf8' | 'pc864' | 'w1256';

  @ApiProperty({
    ...ApiInt32,
    example: 0,
    minimum: 0,
    maximum: 255,
    description: 'ESC t n code-page index (0-255). Vendor-specific.',
  })
  @IsInt()
  @Min(0)
  @Max(255)
  codePage!: number;

  @ApiProperty({
    example: false,
    description: 'Reverse glyph order for LTR thermal heads (visual RTL)',
  })
  @IsBoolean()
  visualRtl!: boolean;
}

export class PrinterConfigDto {
  @ApiProperty({ type: PrinterArabicConfigDto })
  @ValidateNested()
  @Type(() => PrinterArabicConfigDto)
  arabic!: PrinterArabicConfigDto;
}

export class CreatePrinterDto {
  @ApiProperty({ example: 'Kitchen' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({
    enum: ['tcp', 'windows'],
    default: 'tcp',
    description: 'How to connect to the printer: TCP/IP network or Windows spooler queue.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['tcp', 'windows'])
  connectionType?: string;

  @ApiPropertyOptional({
    example: 'XP-80C',
    description: 'Windows printer queue name. Required when connectionType is "windows".',
  })
  @ValidateIf((o: any) => o.connectionType === 'windows')
  @IsString()
  @MinLength(1)
  windowsPrinterName?: string;

  @ApiPropertyOptional({
    example: '192.168.1.100',
    description:
      'IP address or hostname. Required when connectionType is "tcp" (default). Can be empty string for windows.',
  })
  @ValidateIf((o: any) => (o.connectionType ?? 'tcp') === 'tcp')
  @IsString()
  @MinLength(1)
  ip?: string;

  @ApiPropertyOptional({ ...ApiInt32, default: 9100 })
  @IsOptional()
  @IsInt()
  port?: number;

  @ApiProperty({ enum: ['receipt', 'kitchen'], example: 'kitchen' })
  @IsString()
  @IsIn(['receipt', 'kitchen'])
  role!: string;

  @ApiPropertyOptional({
    type: PrinterConfigDto,
    description: 'Per-printer configuration (Arabic encoding etc.).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrinterConfigDto)
  config?: PrinterConfigDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePrinterDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    enum: ['tcp', 'windows'],
    description: 'How to connect to the printer: TCP/IP network or Windows spooler queue.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['tcp', 'windows'])
  connectionType?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Windows printer queue name. Required when connectionType is "windows".',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  windowsPrinterName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MinLength(1)
  ip?: string;

  @ApiPropertyOptional({ ...ApiInt32 })
  @IsOptional()
  @IsInt()
  port?: number;

  @ApiPropertyOptional({ enum: ['receipt', 'kitchen'] })
  @IsOptional()
  @IsString()
  @IsIn(['receipt', 'kitchen'])
  role?: string;

  @ApiPropertyOptional({
    type: PrinterConfigDto,
    description: 'Per-printer configuration (Arabic encoding etc.).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrinterConfigDto)
  config?: PrinterConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
