import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ZatcaInvoiceAttemptDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  attemptNo!: number;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  icv!: number;

  @ApiProperty()
  uuid!: string;

  @ApiProperty({ type: [String] })
  errors!: string[];

  @ApiProperty({ type: [String] })
  warnings!: string[];

  @ApiProperty({ nullable: true })
  httpStatus!: number | null;

  @ApiProperty()
  createdAt!: number;

  @ApiProperty()
  updatedAt!: number;
}

export class ZatcaInvoiceStatusResponse {
  @ApiProperty({ enum: ['simplified', 'standard', 'none'] })
  invoiceType!: string;

  @ApiPropertyOptional({ type: ZatcaInvoiceAttemptDto, nullable: true })
  current!: ZatcaInvoiceAttemptDto | null;

  @ApiProperty({ type: [ZatcaInvoiceAttemptDto] })
  attempts!: ZatcaInvoiceAttemptDto[];

  @ApiProperty()
  canRetryClearance!: boolean;

  @ApiProperty()
  canReissue!: boolean;
}
