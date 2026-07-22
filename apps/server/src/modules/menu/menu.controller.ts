import { Controller, Get, Post, Put, Param, Body, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { MenuService } from './menu.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/create-category.dto';
import { CategoryResponse } from './dto/category-response.dto';
import { CreateItemDto, UpdateItemDto } from './dto/create-item.dto';
import { ItemResponse } from './dto/item-response.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('menu')
@Controller('menu')
@ApiBearerAuth()
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List all categories' })
  @ApiOkResponse({ description: 'List of categories', type: [CategoryResponse] })
  listCategories() {
    return this.menuService.listCategories();
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiOkResponse({ description: 'Category details', type: CategoryResponse })
  getCategory(@Param('id', ParseIntPipe) id: number) {
    return this.menuService.getCategory(id);
  }

  @Post('categories')
  @RequiresPermission('manage_menu')
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ description: 'Created category', type: CategoryResponse })
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: any) {
    return this.menuService.createCategory(dto, user.sub);
  }

  @Put('categories/:id')
  @RequiresPermission('manage_menu')
  @ApiOperation({ summary: 'Update a category' })
  @ApiOkResponse({ description: 'Updated category', type: CategoryResponse })
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.menuService.updateCategory(id, dto, user.sub);
  }

  @Get('items')
  @ApiOperation({ summary: 'List all items, optionally filtered by category' })
  @ApiOkResponse({ description: 'List of items', type: [ItemResponse] })
  listItems(@Query('categoryId') categoryId?: string) {
    const catId = categoryId ? parseInt(categoryId, 10) : undefined;
    return this.menuService.listItems(catId);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiOkResponse({ description: 'Item details', type: ItemResponse })
  getItem(@Param('id', ParseIntPipe) id: number) {
    return this.menuService.getItem(id);
  }

  @Post('items')
  @RequiresPermission('manage_menu')
  @ApiOperation({ summary: 'Create an item' })
  @ApiCreatedResponse({ description: 'Created item', type: ItemResponse })
  createItem(@Body() dto: CreateItemDto, @CurrentUser() user: any) {
    return this.menuService.createItem(dto, user.sub);
  }

  @Put('items/:id')
  @RequiresPermission('manage_menu')
  @ApiOperation({ summary: 'Update an item' })
  @ApiOkResponse({ description: 'Updated item', type: ItemResponse })
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: any,
  ) {
    return this.menuService.updateItem(id, dto, user.sub);
  }
}
