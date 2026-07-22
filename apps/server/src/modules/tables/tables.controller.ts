import { Controller, Get, Post, Put, Param, Body, ParseIntPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { TablesService } from './tables.service';
import { CreateTableDto, UpdateTableDto } from './dto/create-table.dto';
import { TableResponse } from './dto/table-response.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('tables')
@Controller('tables')
@ApiBearerAuth()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  @ApiOperation({ summary: 'List all tables' })
  @ApiOkResponse({ description: 'List of tables', type: [TableResponse] })
  list() {
    return this.tablesService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get table by ID' })
  @ApiOkResponse({ description: 'Table details', type: TableResponse })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.tablesService.get(id);
  }

  @Post()
  @RequiresPermission('manage_tables')
  @ApiOperation({ summary: 'Create a table' })
  @ApiCreatedResponse({ description: 'Created table', type: TableResponse })
  create(@Body() dto: CreateTableDto, @CurrentUser() user: any) {
    return this.tablesService.create(dto, user.sub);
  }

  @Put(':id')
  @RequiresPermission('manage_tables')
  @ApiOperation({ summary: 'Update a table' })
  @ApiOkResponse({ description: 'Updated table', type: TableResponse })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTableDto,
    @CurrentUser() user: any,
  ) {
    return this.tablesService.update(id, dto, user.sub);
  }
}
