import { Controller, Post, Get, Put, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponse } from './dto/login-response.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponse } from './dto/user-response.dto';
import { MeResponse } from './dto/me-response.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/create-role.dto';
import { RoleResponse } from './dto/role-response.dto';
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
  @ApiCreatedResponse({ description: 'JWT access token', type: LoginResponse })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.pin);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info with role permissions' })
  @ApiOkResponse({ description: 'Current user details', type: MeResponse })
  getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user.sub);
  }

  @Get('users')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all users' })
  @ApiOkResponse({ description: 'List of users', type: [UserResponse] })
  listUsers() {
    return this.authService.listUsers();
  }

  @Get('users/:id')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiOkResponse({ description: 'User details', type: UserResponse })
  getUser(@Param('id', ParseIntPipe) id: number) {
    return this.authService.getUserById(id);
  }

  @Post('users')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiCreatedResponse({ description: 'Created user', type: UserResponse })
  createUser(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.authService.createUser(dto, user.sub);
  }

  @Put('users/:id')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a user' })
  @ApiOkResponse({ description: 'Updated user', type: UserResponse })
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
  @ApiOkResponse({ description: 'List of roles', type: [RoleResponse] })
  listRoles() {
    return this.authService.listRoles();
  }

  @Post('roles')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new role' })
  @ApiCreatedResponse({ description: 'Created role', type: RoleResponse })
  createRole(@Body() dto: CreateRoleDto, @CurrentUser() user: any) {
    return this.authService.createRole(dto, user.sub);
  }

  @Put('roles/:id')
  @RequiresPermission('manage_users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a role' })
  @ApiOkResponse({ description: 'Updated role', type: RoleResponse })
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: any,
  ) {
    return this.authService.updateRole(id, dto, user.sub);
  }
}
