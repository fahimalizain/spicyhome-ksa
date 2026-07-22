import { Controller, Get, Post, Put, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { PrintersService } from './printers.service';
import { PrintJobService } from './print-job.service';
import { CreatePrinterDto, UpdatePrinterDto } from './dto/create-printer.dto';
import { PrinterResponse } from './dto/printer-response.dto';
import { PrinterStatusResponse } from './dto/printer-status-response.dto';
import { SuccessResponse } from '../orders/dto/success-response.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('printers')
@Controller('printers')
@ApiBearerAuth()
export class PrintersController {
  constructor(
    private readonly printersService: PrintersService,
    private readonly printJobService: PrintJobService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all printers' })
  @ApiOkResponse({ description: 'List of printers', type: [PrinterResponse] })
  list() {
    return this.printersService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get printer by ID' })
  @ApiOkResponse({ description: 'Printer details', type: PrinterResponse })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.printersService.get(id);
  }

  @Post()
  @RequiresPermission('manage_printers')
  @ApiOperation({ summary: 'Create a printer' })
  @ApiCreatedResponse({ description: 'Created printer', type: PrinterResponse })
  create(@Body() dto: CreatePrinterDto, @CurrentUser() user: any) {
    return this.printersService.create(dto, user.sub);
  }

  @Put(':id')
  @RequiresPermission('manage_printers')
  @ApiOperation({ summary: 'Update a printer' })
  @ApiOkResponse({ description: 'Updated printer', type: PrinterResponse })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePrinterDto,
    @CurrentUser() user: any,
  ) {
    return this.printersService.update(id, dto, user.sub);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Check printer TCP reachability' })
  @ApiOkResponse({ description: 'Printer reachability status', type: PrinterStatusResponse })
  async checkStatus(@Param('id', ParseIntPipe) id: number) {
    return this.printersService.checkPrinter(id);
  }

  @Post(':id/test')
  @RequiresPermission('manage_printers')
  @ApiOperation({ summary: 'Print a test ticket' })
  @ApiOkResponse({ description: 'Test ticket sent', type: SuccessResponse })
  async testPrint(@Param('id', ParseIntPipe) id: number) {
    await this.printJobService.printTestTicket(id);
    return { success: true };
  }
}
