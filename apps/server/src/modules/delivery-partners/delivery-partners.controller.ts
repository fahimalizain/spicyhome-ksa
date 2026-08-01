import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';
import { DeliveryPartnersService } from './delivery-partners.service';
import {
  CreateDeliveryPartnerDto,
  UpdateDeliveryPartnerDto,
} from './dto/create-delivery-partner.dto';
import { DeliveryPartnerResponse } from './dto/delivery-partner-response.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Delivery partner catalog (ADR 0007).
 *
 * NOTE: there is deliberately no DELETE route — partners are soft-disabled
 * only (enabled = 0) to preserve referential integrity for historical
 * orders.delivery_partner_id rows and the auto-created payment method.
 */
@ApiTags('delivery-partners')
@Controller('delivery-partners')
@ApiBearerAuth()
export class DeliveryPartnersController {
  constructor(private readonly deliveryPartnersService: DeliveryPartnersService) {}

  @Get()
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'List all delivery partners (including disabled)' })
  @ApiOkResponse({ description: 'List of delivery partners', type: [DeliveryPartnerResponse] })
  list() {
    return this.deliveryPartnersService.list();
  }

  @Get('enabled')
  @ApiOperation({ summary: 'List enabled delivery partners (no special permission required)' })
  @ApiOkResponse({
    description: 'List of enabled delivery partners',
    type: [DeliveryPartnerResponse],
  })
  listEnabled() {
    return this.deliveryPartnersService.listEnabled();
  }

  @Post()
  @RequiresPermission('manage_settings')
  @ApiOperation({
    summary: 'Create a delivery partner (atomically creates its owned payment method)',
  })
  @ApiCreatedResponse({ description: 'Created delivery partner', type: DeliveryPartnerResponse })
  create(@Body() dto: CreateDeliveryPartnerDto, @CurrentUser() user: any) {
    return this.deliveryPartnersService.create(dto, user.sub);
  }

  @Patch(':id')
  @RequiresPermission('manage_settings')
  @ApiOperation({
    summary:
      'Update a delivery partner (title / enabled / sort_order; mirrors title + enabled to the owned payment method)',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Delivery partner slug' })
  @ApiOkResponse({ description: 'Updated delivery partner', type: DeliveryPartnerResponse })
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryPartnerDto, @CurrentUser() user: any) {
    return this.deliveryPartnersService.update(id, dto, user.sub);
  }
}
