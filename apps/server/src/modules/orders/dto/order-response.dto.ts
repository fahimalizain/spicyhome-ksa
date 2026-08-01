import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderItemResponse } from './order-item-response.dto';
import { OrderEventResponse } from './order-event-response.dto';
import { OrderPaymentResponse } from './order-payment-response.dto';
import { ApiInt64 } from '../../../common/api-property-helpers';
import { ZatcaBuyerDetailsDto } from './zatca-buyer-details.dto';

export class OrderResponse {
  @ApiProperty({ ...ApiInt64, example: 1 })
  id!: number;

  @ApiProperty({ ...ApiInt64, example: 1 })
  orderNo!: number;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  uuid!: string;

  @ApiProperty({ example: 'dine_in' })
  type!: string;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  tableId!: number | null;

  @ApiProperty({ ...ApiInt64, example: 1 })
  dayOpeningId!: number;

  @ApiProperty({ example: 'open' })
  status!: string;

  @ApiProperty({ ...ApiInt64, example: 4000 })
  subtotalHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 600 })
  vatHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 4600 })
  totalHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 0 })
  discountHalalas!: number;

  // ── Delivery partner (ADR 0007) ────────────────────────────────────────────

  @ApiProperty({
    example: 'hungerstation',
    nullable: true,
    description:
      'Delivery partner slug, only set on takeaway orders. Walk-in takeaway and dine-in orders have null.',
  })
  deliveryPartnerId!: string | null;

  @ApiProperty({
    example: 'HungerStation',
    nullable: true,
    description: 'Delivery partner title (joined from delivery_partners when a partner is set).',
  })
  deliveryPartnerTitle!: string | null;

  @ApiProperty({
    example: 'HS-883129',
    nullable: true,
    description:
      "Delivery app's order number for reconciliation (only meaningful alongside a partner).",
  })
  deliveryExternalRef!: string | null;

  @ApiProperty({
    description: 'ZATCA root cbc:ID — the business invoice number',
    example: 'INV26-0001',
  })
  documentId!: string;

  // ── Standard invoice (ZATCA) buyer fields ───────────────────────────────────

  @ApiProperty({ description: 'Whether this order is a ZATCA standard invoice', example: false })
  isStandardInvoice!: boolean;

  @ApiPropertyOptional({
    description: 'ZATCA standard invoice buyer details (JSON)',
    type: ZatcaBuyerDetailsDto,
    nullable: true,
  })
  zatcaBuyerDetails?: ZatcaBuyerDetailsDto | null;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  createdAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1700000000 })
  updatedAt!: number;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  createdBy!: number | null;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  updatedBy!: number | null;

  @ApiProperty({ type: [OrderItemResponse] })
  items!: OrderItemResponse[];

  @ApiProperty({ type: [OrderEventResponse] })
  events!: OrderEventResponse[];

  @ApiProperty({ type: [OrderPaymentResponse] })
  payments!: OrderPaymentResponse[];
}
