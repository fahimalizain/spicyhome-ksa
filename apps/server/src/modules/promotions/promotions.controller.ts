import { Controller, Get, Post, Patch, Param, Body, ParseIntPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/create-promotion.dto';
import { PromotionResponse } from './dto/promotion-response.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Promotion catalog (ADR 0009 / #191).
 *
 * NOTE: there is deliberately no DELETE route — promotions are soft-disabled
 * only (enabled = 0). Order snapshots retain the stamped percent; historical
 * rows stay for audit.
 */
@ApiTags('promotions')
@Controller('promotions')
@ApiBearerAuth()
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @RequiresPermission('manage_menu')
  @ApiOperation({ summary: 'List all promotions (including disabled)' })
  @ApiOkResponse({ description: 'List of promotions', type: [PromotionResponse] })
  list() {
    return this.promotionsService.list();
  }

  @Post()
  @RequiresPermission('manage_menu')
  @ApiOperation({
    summary: 'Create a promotion (enabled date ranges must not overlap)',
  })
  @ApiCreatedResponse({ description: 'Created promotion', type: PromotionResponse })
  create(@Body() dto: CreatePromotionDto, @CurrentUser() user: any) {
    return this.promotionsService.create(dto, user.sub);
  }

  @Patch(':id')
  @RequiresPermission('manage_menu')
  @ApiOperation({
    summary: 'Update a promotion (name / nameAr / percentBp / dates / enabled; soft-disable only)',
  })
  @ApiParam({ name: 'id', type: 'integer', description: 'Promotion id' })
  @ApiOkResponse({ description: 'Updated promotion', type: PromotionResponse })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser() user: any,
  ) {
    return this.promotionsService.update(id, dto, user.sub);
  }
}
