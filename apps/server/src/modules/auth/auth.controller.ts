import { Controller, Post, Get, Put, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/create-role.dto';
import { Public } from '../../common/decorators/public.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login with username and PIN' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.pin);
  }

  @Get('users')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all users' })
  listUsers() {
    return this.authService.listUsers();
  }

  @Get('users/:id')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user by ID' })
  getUser(@Param('id', ParseIntPipe) id: number) {
    return this.authService.getUserById(id);
  }

  @Post('users')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new user' })
  createUser(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.authService.createUser(dto, user.sub);
  }

  @Put('users/:id')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a user' })
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.authService.updateUser(id, dto, user.sub);
  }

  @Get('roles')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all roles' })
  listRoles() {
    return this.authService.listRoles();
  }

  @Post('roles')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new role' })
  createRole(@Body() dto: CreateRoleDto, @CurrentUser() user: any) {
    return this.authService.createRole(dto, user.sub);
  }

  @Put('roles/:id')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a role' })
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: any,
  ) {
    return this.authService.updateRole(id, dto, user.sub);
  }
}
