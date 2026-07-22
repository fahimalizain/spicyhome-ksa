import { Injectable, CanActivate, ExecutionContext, Inject, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { userRoles } from '@spicyhome/db';
import { DRIZZLE } from '../../modules/database/database.module';
import { REQUIRED_PERMISSION_KEY, PermissionName } from '../decorators/requires-permission.decorator';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

const DB_TO_CAMEL: Record<string, keyof typeof userRoles.$inferSelect> = {
  create_order: 'createOrder',
  update_order: 'updateOrder',
  delete_order_item: 'deleteOrderItem',
  void_order: 'voidOrder',
  refund_order: 'refundOrder',
  manage_menu: 'manageMenu',
  manage_tables: 'manageTables',
  manage_printers: 'managePrinters',
  manage_users: 'manageUsers',
  manage_settings: 'manageSettings',
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<PermissionName>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const user = (request as any).user;
    if (!user) throw new ForbiddenException('Access denied');

    const role = this.db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, user.roleId))
      .get();

    if (!role) throw new ForbiddenException('Role not found');

    const camelKey = DB_TO_CAMEL[requiredPermission] || requiredPermission;
    const hasPermission = (role as any)[camelKey];
    if (!hasPermission) throw new ForbiddenException('Insufficient permissions');

    return true;
  }
}
