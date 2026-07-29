import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class ZatcaInvoiceReissueDto {
  @ApiPropertyOptional({
    description: 'Updated ZATCA buyer details for the reissued invoice',
  })
  @IsOptional()
  @IsObject()
  zatcaBuyerDetails?: Record<string, unknown>;
}
