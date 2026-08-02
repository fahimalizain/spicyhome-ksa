import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt64 } from '../../../common/api-property-helpers';
import { ZatcaBuyerDetailsDto } from './zatca-buyer-details.dto';

/**
 * Finalize an open order (ADR 0006): the only `open → paid` path.
 *
 * Payments must already exist on the order via `POST /orders/:id/payments`;
 * the submit request carries **no** payment lines. All preconditions are
 * validated server-side inside a transaction:
 *
 * - status is `open`
 * - ≥ 1 order item
 * - `SUM(order_payments.amount_halalas) === order.total_halalas` (outstanding 0)
 * - every payment method nets ≥ 0 (negative method nets rejected)
 * - optional `baseUpdatedAt` concurrency check (stale → 409)
 */
export class SubmitOrderDto {
  @ApiPropertyOptional({
    ...ApiInt64,
    description:
      'Order updated_at observed by the client; if present it must match the current value or the submit is rejected with 409.',
  })
  @IsOptional()
  @IsInt()
  baseUpdatedAt?: number;

  // ── Standard invoice (ZATCA) ──────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Enable standard invoice with buyer details for ZATCA',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isStandardInvoice?: boolean;

  @ApiPropertyOptional({
    description: 'ZATCA standard invoice buyer details (required when isStandardInvoice is true)',
    type: ZatcaBuyerDetailsDto,
  })
  @IsOptional()
  zatcaBuyerDetails?: ZatcaBuyerDetailsDto;

  // ── Receipt print on submit ────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Controls the automatic receipt print on submit for SIMPLIFIED invoices only. ' +
      'Defaults to true when omitted (current behavior). When false on a simplified invoice, ' +
      'the receipt print is skipped (no receipt_print_enqueued event and no physical print), ' +
      'but if a positive cash payment exists the cash drawer is still kicked. ' +
      'IGNORED for standard invoices: their receipt is always deferred until ZATCA clearance, ' +
      'and the cash drawer is kicked on submit for cash orders regardless of this flag.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  printReceipt?: boolean;
}
