import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, AddOrderItemDto, UpdateOrderItemDto } from './dto/create-order.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('orders')
@Controller('orders')
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders with optional filters' })
  listOrders(@Query('status') status?: string, @Query('date') date?: string) {
    return this.ordersService.listOrders({ status, date });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID with items and audit log' })
  getOrder(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getOrder(id);
  }

  @Get(':id/audit/verify')
  @ApiOperation({ summary: 'Verify audit log hash chain for an order' })
  verifyAuditChain(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.verifyAuditChain(id);
  }

  @Post()
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Create a new order' })
  createOrder(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.ordersService.createOrder(dto, user.sub);
  }

  @Post(':id/items')
  @RequiresPermission('update_order')
  @ApiOperation({ summary: 'Add an item to an order' })
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
  sendOrder(@Param('id', ParseIntPipe) orderId: number, @CurrentUser() user: any) {
    return this.ordersService.sendOrder(orderId, user.sub);
  }

  @Post(':id/pay')
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Mark order as paid (sent → paid)' })
  payOrder(@Param('id', ParseIntPipe) orderId: number, @CurrentUser() user: any) {
    return this.ordersService.payOrder(orderId, user.sub);
  }

  @Post(':id/void')
  @RequiresPermission('void_order')
  @ApiOperation({ summary: 'Void an order (open|sent → voided)' })
  voidOrder(@Param('id', ParseIntPipe) orderId: number, @CurrentUser() user: any) {
    return this.ordersService.voidOrder(orderId, user.sub);
  }
}
