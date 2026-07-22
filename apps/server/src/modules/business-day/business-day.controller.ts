import { Controller, Get, Post, Body, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiConflictResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { BusinessDayService } from './business-day.service';
import { OpenDayDto, DayOpeningResponse } from './dto/open-day.dto';
import { CloseDayDto, CloseDayResponse } from './dto/close-day.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('day')
@Controller('day')
@ApiBearerAuth()
export class BusinessDayController {
  constructor(private readonly businessDayService: BusinessDayService) {}

  @Post('open')
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Open a new business day' })
  @ApiCreatedResponse({ description: 'Business day opened', type: DayOpeningResponse })
  @ApiConflictResponse({ description: 'A business day is already open' })
  openDay(@Body() dto: OpenDayDto, @CurrentUser() user: any) {
    return this.businessDayService.openDay(dto, user.sub);
  }

  @Post('close')
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Close the current open business day' })
  @ApiCreatedResponse({ description: 'Business day closed with frozen totals', type: CloseDayResponse })
  @ApiNotFoundResponse({ description: 'No open business day to close' })
  @ApiConflictResponse({ description: 'Open/sent orders exist — cannot close' })
  closeDay(@Body() dto: CloseDayDto, @CurrentUser() user: any) {
    return this.businessDayService.closeDay(dto, user.sub);
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current open day with live X-report totals' })
  @ApiOkResponse({ description: 'Current open day or null' })
  getCurrent() {
    return this.businessDayService.getCurrentDay() ?? { open: false };
  }

  @Get()
  @ApiOperation({ summary: 'List past business days (paged)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Paged list of business days' })
  list(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.businessDayService.listDays(page ?? 1, limit ?? 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a business day by ID' })
  @ApiOkResponse({ description: 'Business day', type: DayOpeningResponse })
  @ApiNotFoundResponse({ description: 'Business day not found' })
  getDay(@Param('id', ParseIntPipe) id: number) {
    return this.businessDayService.getDay(id);
  }
}
