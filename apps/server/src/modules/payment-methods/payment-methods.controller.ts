import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/create-payment-method.dto';
import { PaymentMethodResponse } from './dto/payment-method-response.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('payment-methods')
@Controller('payment-methods')
@ApiBearerAuth()
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get()
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'List all payment methods (including disabled)' })
  @ApiOkResponse({ description: 'List of payment methods', type: [PaymentMethodResponse] })
  list() {
    return this.paymentMethodsService.list();
  }

  @Get('enabled')
  @ApiOperation({ summary: 'List enabled payment methods (no special permission required)' })
  @ApiOkResponse({ description: 'List of enabled payment methods', type: [PaymentMethodResponse] })
  listEnabled() {
    return this.paymentMethodsService.listEnabled();
  }

  @Post()
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Create a payment method' })
  @ApiCreatedResponse({ description: 'Created payment method', type: PaymentMethodResponse })
  create(@Body() dto: CreatePaymentMethodDto, @CurrentUser() user: any) {
    return this.paymentMethodsService.create(dto, user.sub);
  }

  @Patch(':id')
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Update a payment method' })
  @ApiParam({ name: 'id', type: 'string', description: 'Payment method slug' })
  @ApiOkResponse({ description: 'Updated payment method', type: PaymentMethodResponse })
  update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto, @CurrentUser() user: any) {
    return this.paymentMethodsService.update(id, dto, user.sub);
  }
}
