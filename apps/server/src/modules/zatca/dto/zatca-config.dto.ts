import { IsString, IsOptional, IsIn, Matches, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ZATCAEnvironment } from '@spicyhome/shared';

export class ZatcaConfigDto {
  @ApiProperty({
    example: 'SpicyHome Restaurant',
    description: 'Legal seller name for CSR and invoice XML',
  })
  @IsString()
  @MinLength(1)
  sellerName!: string;

  @ApiProperty({
    example: '300123456789003',
    description: '15-digit KSA VAT number (starts and ends with 3)',
  })
  @IsString()
  @Matches(/^3\d{13}3$/, {
    message: 'vatNumber must be exactly 15 digits, starting and ending with 3',
  })
  vatNumber!: string;

  @ApiProperty({ example: '1234567890', description: '10-digit Commercial Registration number' })
  @IsString()
  @Matches(/^\d{10}$/, { message: 'crNumber must be exactly 10 digits' })
  crNumber!: string;

  @ApiProperty({ example: 'King Fahd Road', description: 'Street name' })
  @IsString()
  @MinLength(1)
  street!: string;

  @ApiProperty({ example: '1234', description: 'Building number' })
  @IsString()
  @MinLength(1)
  building!: string;

  @ApiProperty({ example: 'Riyadh', description: 'City name' })
  @IsString()
  @MinLength(1)
  city!: string;

  @ApiProperty({ example: '12345', description: '5-digit postal code' })
  @IsString()
  @Matches(/^\d{5}$/, { message: 'postalCode must be exactly 5 digits' })
  postalCode!: string;

  @ApiProperty({ example: 'SA', description: '2-letter ISO country code' })
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter ISO code (e.g. SA)' })
  country!: string;

  @ApiProperty({ example: 'SpicyHome POS', description: 'Organizational unit for CSR' })
  @IsString()
  @MinLength(1)
  orgUnit!: string;

  @ApiPropertyOptional({
    example: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    description: 'ZATCA API base URL (defaults to developer portal)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\/.+/, { message: 'apiBaseUrl must be a valid URL starting with http' })
  apiBaseUrl?: string;

  @ApiPropertyOptional({
    example: 'production',
    description:
      'ZATCA environment — controls CSR OID label (sandbox→TESTZATCA-Code-Signing, production→ZATCA-Code-Signing)',
  })
  @IsOptional()
  @IsIn(['sandbox', 'production'])
  environment?: ZATCAEnvironment;
}
