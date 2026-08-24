import { ApiProperty } from '@nestjs/swagger';
import { ApiInt32 } from '../../../common/api-property-helpers';

export class ZatcaDocumentCountsDto {
  @ApiProperty({
    ...ApiInt32,
    example: 12,
    description: 'Current documents with status reported (simplified) or cleared (standard)',
  })
  submitted!: number;

  @ApiProperty({
    ...ApiInt32,
    example: 2,
    description: 'Current documents with status signed (awaiting report) or pending (in clearance)',
  })
  queued!: number;

  @ApiProperty({
    ...ApiInt32,
    example: 1,
    description: 'Current documents with status failed (reporting) or error (retryable clearance)',
  })
  failed!: number;

  @ApiProperty({
    ...ApiInt32,
    example: 0,
    description: 'Current documents with status rejected (must reissue with a new ICV)',
  })
  rejected!: number;

  @ApiProperty({
    ...ApiInt32,
    example: 15,
    description: 'Current documents (latest attempt per order / refund; prefers cleared)',
  })
  total!: number;
}

export class ZatcaDocumentsOverallDto extends ZatcaDocumentCountsDto {
  @ApiProperty({
    enum: ['ok', 'attention'],
    example: 'ok',
    description: 'ok when failed + rejected is 0; queued alone stays ok',
  })
  health!: 'ok' | 'attention';
}

export class ZatcaDocumentsSummaryDto {
  @ApiProperty({ type: ZatcaDocumentCountsDto })
  invoices!: ZatcaDocumentCountsDto;

  @ApiProperty({ type: ZatcaDocumentCountsDto })
  creditNotes!: ZatcaDocumentCountsDto;

  @ApiProperty({ type: ZatcaDocumentsOverallDto })
  overall!: ZatcaDocumentsOverallDto;
}
