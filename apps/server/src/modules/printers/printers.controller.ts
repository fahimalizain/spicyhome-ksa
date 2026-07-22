import { Controller, Get, Post, Put, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrintersService } from './printers.service';
import { CreatePrinterDto, UpdatePrinterDto } from './dto/create-printer.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('printers')
@Controller('printers')
@ApiBearerAuth()
export class PrintersController {
  constructor(private readonly printersService: PrintersService) {}

  @Get()
  @ApiOperation({ summary: 'List all printers' })
  list() {
    return this.printersService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get printer by ID' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.printersService.get(id);
  }

  @Post()
  @RequiresPermission('manage_printers')
  @ApiOperation({ summary: 'Create a printer' })
  create(@Body() dto: CreatePrinterDto, @CurrentUser() user: any) {
    return this.printersService.create(dto, user.sub);
  }

  @Put(':id')
  @RequiresPermission('manage_printers')
  @ApiOperation({ summary: 'Update a printer' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePrinterDto,
    @CurrentUser() user: any,
  ) {
    return this.printersService.update(id, dto, user.sub);
  }
}
