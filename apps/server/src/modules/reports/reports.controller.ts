import { Controller, Get, Post, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
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

  @Post('z/:dayId/print')
  @RequiresPermission('create_order')
  @ApiOperation({ summary: 'Print Z-report on receipt printer' })
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
