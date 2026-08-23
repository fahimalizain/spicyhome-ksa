import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';

export class SalesRegisterTenderDto {
  @ApiProperty({ example: 'cash' })
  methodId!: string;

  @ApiProperty({ example: 'Cash' })
  methodTitle!: string;

  @ApiProperty({ ...ApiInt64, example: 2300 })
  amountHalalas!: number;
}

export class SalesRegisterRowDto {
  @ApiProperty({
    example: 'sale',
    description: 'Document kind: sale (invoice) or refund (credit note)',
  })
  kind!: 'sale' | 'refund';

  @ApiProperty({
    ...ApiInt64,
    example: 1787220000,
    description:
      'Posting time (Unix seconds): earliest payment for sales, refund creation for refunds',
  })
  postedAt!: number;

  @ApiProperty({
    example: '2026-08-20',
    description:
      'Service-day label (Asia/Riyadh) of postedAt — the business date the document posts to',
  })
  businessDate!: string;

  @ApiProperty({ example: 'INV26-0001' })
  documentId!: string;

  @ApiProperty({ ...ApiInt64, example: 1 })
  orderId!: number;

  @ApiProperty({
    ...ApiInt64,
    example: 5,
    nullable: true,
    description: 'Refund id; null on sale rows',
  })
  refundId!: number | null;

  @ApiProperty({
    ...ApiInt64,
    example: 1,
    description: 'Parent order number (same on refund rows)',
  })
  orderNo!: number;

  @ApiProperty({ example: 'dine_in' })
  type!: string;

  @ApiProperty({ ...ApiInt64, example: 2, nullable: true })
  tableId!: number | null;

  @ApiProperty({ type: String, example: 'T1', nullable: true })
  tableName!: string | null;

  @ApiProperty({ type: String, example: 'hungerstation', nullable: true })
  deliveryPartnerId!: string | null;

  @ApiProperty({ type: String, example: 'HungerStation', nullable: true })
  deliveryPartnerTitle!: string | null;

  @ApiProperty({ type: String, example: 'HS-883129', nullable: true })
  deliveryExternalRef!: string | null;

  @ApiProperty({
    ...ApiInt64,
    example: 2000,
    description: 'Sale: order subtotal; refund: negative',
  })
  subtotalHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 300, description: 'Sale: order VAT; refund: negative' })
  vatHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 2300, description: 'Sale: order total; refund: negative' })
  totalHalalas!: number;

  @ApiProperty({
    type: [SalesRegisterTenderDto],
    description: 'Sale: all order payments; refund: single entry with the refund method',
  })
  tenders!: SalesRegisterTenderDto[];

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  cashierUserId!: number | null;

  @ApiProperty({ example: 'Admin', description: 'users.name, or "Unknown" when the user is gone' })
  cashierName!: string;

  @ApiProperty({
    type: String,
    example: 'Call on arrival',
    nullable: true,
    description: 'Sale: order notes; refund: "Refund of <parent document id>"',
  })
  notes!: string | null;
}

export class SalesRegisterFooterDto {
  @ApiProperty({ ...ApiInt64, example: 12 })
  saleCount!: number;

  @ApiProperty({ ...ApiInt64, example: 2 })
  refundCount!: number;

  @ApiProperty({ ...ApiInt64, example: 27600, description: 'Signed sum of row subtotals' })
  subtotalHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 4140, description: 'Signed sum of row VAT' })
  vatHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 31740, description: 'Signed sum of row totals' })
  totalHalalas!: number;
}

export class SalesRegisterResponseDto {
  @ApiProperty({ type: [SalesRegisterRowDto] })
  rows!: SalesRegisterRowDto[];

  @ApiProperty({ type: SalesRegisterFooterDto })
  footer!: SalesRegisterFooterDto;
}
