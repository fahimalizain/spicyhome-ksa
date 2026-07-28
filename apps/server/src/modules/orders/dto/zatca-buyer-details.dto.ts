import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ZatcaBuyerDetailsDto {
  @ApiProperty({ example: 'Abdullah Al-Otaibi Est.' })
  name!: string;

  @ApiProperty({ example: '300123456789012' })
  vatNumber!: string;

  @ApiProperty({ example: 'King Fahd Road' })
  street!: string;

  @ApiProperty({ example: '7845' })
  buildingNumber!: string;

  @ApiProperty({ example: 'Al-Olaya' })
  citySubdivision!: string;

  @ApiProperty({ example: 'Riyadh' })
  city!: string;

  @ApiProperty({ example: '12271' })
  postalCode!: string;

  @ApiPropertyOptional({ example: 'SA' })
  country?: string;
}
