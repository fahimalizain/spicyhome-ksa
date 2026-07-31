import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ZatcaClearanceDetailDto {
  @ApiProperty({ example: 'CLEARED' })
  status!: string;

  @ApiProperty({ example: 200 })
  httpStatus!: number;

  @ApiProperty({ type: String, example: '<Invoice>...</Invoice>', nullable: true })
  clearedXml!: string | null;

  @ApiProperty({ type: String, example: 'base64...', nullable: true })
  clearedInvoiceBase64!: string | null;

  @ApiProperty({ type: [String] })
  warnings!: string[];

  @ApiProperty({ type: [String] })
  errors!: string[];

  @ApiProperty({ type: String, nullable: true })
  rawBody!: string | null;
}

/** Result of a ZATCA standard-invoice / credit-note retry or reissue attempt. */
export class ZatcaReissueResultDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  icv!: number;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  uuid!: string;

  @ApiProperty({ example: 'hash...' })
  invoiceHash!: string;

  @ApiProperty({ example: 'pending' })
  status!: string;

  @ApiProperty({ example: 1 })
  attemptNo!: number;

  @ApiProperty({ example: 'base64...' })
  qrTlvBase64!: string;

  @ApiProperty({ example: '<Invoice>...</Invoice>' })
  signedXml!: string;

  @ApiPropertyOptional({ type: ZatcaClearanceDetailDto, nullable: true })
  clearance!: ZatcaClearanceDetailDto | null;
}
