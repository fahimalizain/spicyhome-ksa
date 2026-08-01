import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  Query,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, ReprintOrderDto, CreateRefundDto } from './dto/create-order.dto';
import { SyncOrderItemsDto } from './dto/sync-order-items.dto';
import { UpdateOrderMetaDto } from './dto/update-order-meta.dto';
import { UpdateOrderPartnerDto } from './dto/update-order-partner.dto';
import { SubmitOrderDto } from './dto/submit-order.dto';
import { AddOrderPaymentDto } from './dto/add-order-payment.dto';
import { CreateOrderResponse } from './dto/create-order-response.dto';
import { OrderResponse } from './dto/order-response.dto';
import { OrderSummaryResponse } from './dto/order-summary-response.dto';
import { StatusResponse, RefundResponse } from './dto/success-response.dto';
import { AuditVerifyResponse } from './dto/audit-verify-response.dto';
import { OrderEventResponse } from './dto/order-event-response.dto';
import { OrderRefundResponse } from './dto/refund-response.dto';
import { PrintResponse } from './dto/print-response.dto';
import { ZatcaInvoiceStatusResponse } from './dto/zatca-invoice-status-response.dto';
import { ZatcaInvoiceReissueDto } from './dto/zatca-invoice-reissue.dto';
import { ZatcaReissueResultDto } from './dto/zatca-reissue-result.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('orders')
@Controller('orders')
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders with optional filters' })
  @ApiOkResponse({ description: 'List of orders', type: [OrderSummaryResponse] })
  listOrders(@Query('status') status?: string, @Query('date') date?: string) {
    return this.ordersService.listOrders({ status, date });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID with items and events' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'Order with items and events', type: OrderResponse })
  getOrder(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getOrder(id);
  }

  @Patch(':id')
  @RequiresPermission('update_order')
  @ApiOperation({ summary: 'Update open order type and/or table' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'Updated order with items and events', type: OrderResponse })
  updateOrderMeta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderMetaDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateOrderMeta(id, dto, user.sub);
  }

  @Patch(':id/partner')
  @RequiresPermission('update_order')
  @ApiOperation({
    summary:
      'Set, change or clear the delivery partner (+ external ref) on an open order (ADR 0007)',
  })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'Updated order with items and events', type: OrderResponse })
  updateOrderPartner(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderPartnerDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateOrderPartner(id, dto, user.sub);
  }

  @Post()
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Create a new order' })
  @ApiCreatedResponse({ description: 'Created order summary', type: CreateOrderResponse })
  createOrder(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.ordersService.createOrder(dto, user.sub);
  }

  @Put(':orderId/items/sync')
  @RequiresPermission('update_order')
  @ApiOperation({ summary: 'Bulk sync cart items (add, update, remove) for an open order' })
  @ApiParam({ name: 'orderId', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'Order with items and events', type: OrderResponse })
  syncItems(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: SyncOrderItemsDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.syncItems(orderId, dto, user.sub, user.clientType);
  }

  @Post(':id/send-to-kitchen')
  @HttpCode(200)
  @RequiresPermission('update_order')
  @ApiOperation({
    summary:
      'Send unsent item quantities to the kitchen (explicit differential print; 200 no-op when nothing unsent)',
  })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'Order with items and events', type: OrderResponse })
  sendToKitchen(@Param('id', ParseIntPipe) orderId: number, @CurrentUser() user: any) {
    return this.ordersService.sendToKitchen(orderId, user.sub);
  }

  @Post(':id/submit')
  @RequiresPermission('pay_order')
  @ApiOperation({
    summary: 'Submit an open order: finalize payment (open → paid) with ZATCA invoice + receipt',
  })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Order paid', type: StatusResponse })
  submitOrder(
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: SubmitOrderDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.submitOrder(orderId, user.sub, dto);
  }

  @Post(':id/payments')
  @RequiresPermission('pay_order')
  @ApiOperation({
    summary: 'Append one payment line to an open order (status stays open)',
  })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Order with the appended payment line', type: OrderResponse })
  addOrderPayment(
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: AddOrderPaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.addOrderPayment(orderId, user.sub, dto);
  }

  @Post(':id/void')
  @RequiresPermission('void_order')
  @ApiOperation({ summary: 'Void an order (open → voided)' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Order voided', type: StatusResponse })
  voidOrder(@Param('id', ParseIntPipe) orderId: number, @CurrentUser() user: any) {
    return this.ordersService.voidOrder(orderId, user.sub);
  }

  @Post(':id/print')
  @RequiresPermission('update_order')
  @ApiOperation({ summary: 'Reprint receipt or kitchen ticket for an order' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Print result', type: PrintResponse })
  reprintOrder(
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: ReprintOrderDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.reprintOrder(orderId, dto.target, user.sub);
  }

  @Post(':id/refund')
  @RequiresPermission('refund_order')
  @ApiOperation({ summary: 'Refund items on a paid order' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Refund processed', type: RefundResponse })
  refundOrder(
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.refundOrder(orderId, dto, user.sub);
  }

  @Get(':id/refunds')
  @ApiOperation({ summary: 'Get all refunds for an order' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'List of refunds with their items', type: [OrderRefundResponse] })
  getOrderRefunds(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getOrderRefunds(id);
  }

  @Post(':id/refunds/:refundId/print')
  @RequiresPermission('update_order')
  @ApiOperation({ summary: 'Reprint a specific refund receipt' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiParam({ name: 'refundId', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Print result', type: PrintResponse })
  reprintRefundReceipt(
    @Param('id', ParseIntPipe) orderId: number,
    @Param('refundId', ParseIntPipe) refundId: number,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.reprintRefundReceipt(orderId, refundId, user.sub);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Get the complete event chain for an order' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'List of order events', type: [OrderEventResponse] })
  getOrderEvents(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getOrderEvents(id);
  }

  @Get(':id/events/verify')
  @ApiOperation({ summary: 'Verify the hash chain integrity for an order' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'Chain verification result', type: AuditVerifyResponse })
  verifyOrderChain(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.verifyOrderChain(id);
  }

  // ── ZATCA Standard Invoice ──────────────────────────────────────────────────

  @Get(':id/zatca-invoice')
  @RequiresPermission('pay_order')
  @ApiOperation({ summary: 'Get ZATCA invoice status for an order (clearance polling)' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiOkResponse({
    description: 'ZATCA invoice status with clearance attempts',
    type: ZatcaInvoiceStatusResponse,
  })
  getZatcaInvoiceStatus(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getZatcaInvoiceStatus(id);
  }

  @Post(':id/zatca-invoice/retry-clearance')
  @RequiresPermission('pay_order')
  @ApiOperation({ summary: 'Retry ZATCA clearance for an invoice in error status' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Clearance result', type: ZatcaReissueResultDto })
  retryZatcaClearance(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ordersService.retryZatcaClearance(id, user.sub);
  }

  @Post(':id/zatca-invoice/reissue')
  @RequiresPermission('pay_order')
  @ApiOperation({ summary: 'Reissue a standard invoice after rejection (new attempt)' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Reissue result', type: ZatcaReissueResultDto })
  reissueZatcaInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ZatcaInvoiceReissueDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.reissueZatcaInvoice(id, user.sub, dto.zatcaBuyerDetails as any);
  }

  // ── ZATCA Standard Credit Note (refund clearance) ─────────────────────────

  @Get(':id/refunds/:refundId/zatca-credit-note')
  @RequiresPermission('refund_order')
  @ApiOperation({ summary: 'Get ZATCA credit note status for a refund (clearance polling)' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiParam({ name: 'refundId', type: 'integer', format: 'int64' })
  @ApiOkResponse({
    description: 'ZATCA credit note status with clearance attempts',
    type: ZatcaInvoiceStatusResponse,
  })
  getZatcaCreditNoteStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('refundId', ParseIntPipe) refundId: number,
  ) {
    return this.ordersService.getZatcaCreditNoteStatus(id, refundId);
  }

  @Post(':id/refunds/:refundId/zatca-credit-note/retry-clearance')
  @RequiresPermission('refund_order')
  @ApiOperation({ summary: 'Retry ZATCA clearance for a credit note in error status' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiParam({ name: 'refundId', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Clearance result', type: ZatcaReissueResultDto })
  retryZatcaCreditNoteClearance(
    @Param('id', ParseIntPipe) id: number,
    @Param('refundId', ParseIntPipe) refundId: number,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.retryZatcaCreditNoteClearance(id, refundId, user.sub);
  }

  @Post(':id/refunds/:refundId/zatca-credit-note/reissue')
  @RequiresPermission('refund_order')
  @ApiOperation({ summary: 'Reissue a credit note after rejection (new attempt)' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiParam({ name: 'refundId', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Reissue result', type: ZatcaReissueResultDto })
  reissueZatcaCreditNote(
    @Param('id', ParseIntPipe) id: number,
    @Param('refundId', ParseIntPipe) refundId: number,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.reissueZatcaCreditNote(id, refundId, user.sub);
  }
}
