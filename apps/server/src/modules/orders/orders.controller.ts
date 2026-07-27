import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  Query,
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
import {
  CreateOrderDto,
  AddOrderItemDto,
  UpdateOrderItemDto,
  ReprintOrderDto,
  CreateRefundDto,
} from './dto/create-order.dto';
import { CreateOrderResponse } from './dto/create-order-response.dto';
import { OrderResponse } from './dto/order-response.dto';
import { OrderSummaryResponse } from './dto/order-summary-response.dto';
import {
  SuccessResponse,
  AddOrderItemResponse,
  StatusResponse,
  RefundResponse,
} from './dto/success-response.dto';
import { AuditVerifyResponse } from './dto/audit-verify-response.dto';
import { OrderEventResponse } from './dto/order-event-response.dto';
import { OrderRefundResponse } from './dto/refund-response.dto';
import { PrintResponse } from './dto/print-response.dto';
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

  @Post()
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Create a new order' })
  @ApiCreatedResponse({ description: 'Created order summary', type: CreateOrderResponse })
  createOrder(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.ordersService.createOrder(dto, user.sub);
  }

  @Post(':id/items')
  @RequiresPermission('update_order')
  @ApiOperation({ summary: 'Add an item to an order' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Item added', type: AddOrderItemResponse })
  addItem(
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: AddOrderItemDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.addItem(orderId, dto, user.sub);
  }

  @Patch(':orderId/items/:itemId')
  @RequiresPermission('update_order')
  @ApiOperation({ summary: 'Update an order item (qty or notes)' })
  @ApiParam({ name: 'orderId', type: 'integer', format: 'int64' })
  @ApiParam({ name: 'itemId', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'Item updated', type: SuccessResponse })
  updateItem(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateOrderItemDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateItem(orderId, itemId, dto, user.sub);
  }

  @Delete(':orderId/items/:itemId')
  @RequiresPermission('delete_order_item')
  @ApiOperation({ summary: 'Remove an item from an order' })
  @ApiParam({ name: 'orderId', type: 'integer', format: 'int64' })
  @ApiParam({ name: 'itemId', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'Item removed', type: SuccessResponse })
  removeItem(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.removeItem(orderId, itemId, user.sub);
  }

  @Post(':id/pay')
  @RequiresPermission('pay_order')
  @ApiOperation({ summary: 'Mark order as paid (open → paid)' })
  @ApiParam({ name: 'id', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Order paid', type: StatusResponse })
  payOrder(@Param('id', ParseIntPipe) orderId: number, @CurrentUser() user: any) {
    return this.ordersService.payOrder(orderId, user.sub);
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
}
