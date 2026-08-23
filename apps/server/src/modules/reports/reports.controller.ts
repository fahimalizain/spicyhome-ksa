import { Controller, Get, Post, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { SalesRegisterResponseDto } from './dto/sales-register-response.dto';
import { ItemWiseSalesResponseDto } from './dto/item-wise-sales-response.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';

@ApiTags('reports')
@Controller('reports')
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('x')
  @ApiOperation({ summary: 'Live X-report for the current open day' })
  @ApiOkResponse({ description: 'X-report snapshot' })
  getXReport() {
    return this.reportsService.getXReport();
  }

  @Get('z/:dayId')
  @ApiOperation({ summary: 'Z-report for a closed day' })
  @ApiParam({ name: 'dayId', type: 'integer', format: 'int64' })
  @ApiOkResponse({ description: 'Z-report detail' })
  getZReport(@Param('dayId', ParseIntPipe) dayId: number) {
    return this.reportsService.getZReport(dayId);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Daily sales totals over a date range' })
  @ApiOkResponse({ description: 'Daily sales totals' })
  getSales(@Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.getSalesRange(from, to);
  }

  @Get('vat')
  @ApiOperation({ summary: 'VAT summary over a date range (for VAT return)' })
  @ApiOkResponse({ description: 'VAT summary with grand total' })
  getVat(@Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.getVatSummary(from, to);
  }

  @Get('sales-register')
  @ApiOperation({
    summary: 'Sales register (day-book of invoices and refunds) over a date range',
  })
  @ApiOkResponse({
    description: 'Sales register rows sorted by posting time, with signed footer totals',
    type: SalesRegisterResponseDto,
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description:
      'Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive start of the window.',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description:
      'Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive end of the window.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by parent order type: dine_in | takeaway. Omit → all types.',
  })
  @ApiQuery({
    name: 'partner',
    required: false,
    description:
      "Filter by delivery partner slug on the parent order; 'none' for walk-in orders. Omit → all partners.",
  })
  @ApiQuery({
    name: 'kind',
    required: false,
    description: 'Filter by document kind: sale | refund. Omit → both.',
  })
  getSalesRegister(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('partner') partner?: string,
    @Query('kind') kind?: string,
  ) {
    return this.reportsService.getSalesRegister({ from, to, type, partner, kind });
  }

  @Get('item-wise')
  @ApiOperation({
    summary: 'Item-wise sales (product mix) over a date range',
  })
  @ApiOkResponse({
    description: 'One row per catalog item with sold, refunded and net quantities and amounts',
    type: ItemWiseSalesResponseDto,
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description:
      'Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive start of the window.',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description:
      'Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive end of the window.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by parent order type: dine_in | takeaway. Omit → all types.',
  })
  @ApiQuery({
    name: 'partner',
    required: false,
    description:
      "Filter by delivery partner slug on the parent order; 'none' for walk-in orders. Omit → all partners.",
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description:
      "Filter by category id (numeric); 'none' for Uncategorized rows only. Omit → all categories.",
  })
  getItemWiseSales(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('partner') partner?: string,
    @Query('category') category?: string,
  ) {
    return this.reportsService.getItemWiseSales({ from, to, type, partner, category });
  }

  @Post('z/:dayId/print')
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Print Z-report on receipt printer' })
  @ApiParam({ name: 'dayId', type: 'integer', format: 'int64' })
  @ApiCreatedResponse({ description: 'Print result' })
  printZReport(@Param('dayId', ParseIntPipe) dayId: number) {
    return this.reportsService.printZReport(dayId);
  }

  @Post('x/print')
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Print X-report on receipt printer' })
  @ApiCreatedResponse({ description: 'Print result' })
  printXReport() {
    return this.reportsService.printXReport();
  }
}
