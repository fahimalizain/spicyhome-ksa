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
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  AddOrderItemDto,
  UpdateOrderItemDto,
  ReprintOrderDto,
} from './dto/create-order.dto';
import { CreateOrderResponse } from './dto/create-order-response.dto';
import { OrderResponse } from './dto/order-response.dto';
import { SuccessResponse, StatusResponse } from './dto/success-response.dto';
import { AuditVerifyResponse } from './dto/audit-verify-response.dto';
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
  @ApiOkResponse({ description: 'List of orders', type: [OrderResponse] })
  listOrders(@Query('status') status?: string, @Query('date') date?: string) {
    return this.ordersService.listOrders({ status, date });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID with items and audit log' })
  @ApiOkResponse({ description: 'Order with items and audit log', type: OrderResponse })
  getOrder(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getOrder(id);
  }

  @Get(':id/audit/verify')
  @ApiOperation({ summary: 'Verify audit log hash chain for an order' })
  @ApiOkResponse({ description: 'Audit chain verification result', type: AuditVerifyResponse })
  verifyAuditChain(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.verifyAuditChain(id);
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
  @ApiCreatedResponse({ description: 'Item added', type: SuccessResponse })
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
  @ApiOkResponse({ description: 'Item removed', type: SuccessResponse })
  removeItem(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.removeItem(orderId, itemId, user.sub);
  }

  @Post(':id/send')
  @RequiresPermission('update_order')
  @ApiOperation({ summary: 'Send order to kitchen (open → sent)' })
  @ApiCreatedResponse({ description: 'Order sent', type: StatusResponse })
  sendOrder(@Param('id', ParseIntPipe) orderId: number, @CurrentUser() user: any) {
    return this.ordersService.sendOrder(orderId, user.sub);
  }

  @Post(':id/pay')
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Mark order as paid (sent → paid)' })
  @ApiCreatedResponse({ description: 'Order paid', type: StatusResponse })
  payOrder(@Param('id', ParseIntPipe) orderId: number, @CurrentUser() user: any) {
    return this.ordersService.payOrder(orderId, user.sub);
  }

  @Post(':id/void')
  @RequiresPermission('void_order')
  @ApiOperation({ summary: 'Void an order (open|sent → voided)' })
  @ApiCreatedResponse({ description: 'Order voided', type: StatusResponse })
  voidOrder(@Param('id', ParseIntPipe) orderId: number, @CurrentUser() user: any) {
    return this.ordersService.voidOrder(orderId, user.sub);
  }

  @Post(':id/print')
  @RequiresPermission('update_order')
  @ApiOperation({ summary: 'Reprint receipt or kitchen ticket for an order' })
  @ApiCreatedResponse({ description: 'Print result', type: PrintResponse })
  reprintOrder(
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: ReprintOrderDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.reprintOrder(orderId, dto.target, user.sub);
  }
}
