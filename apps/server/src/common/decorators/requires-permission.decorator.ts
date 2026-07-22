import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'required_permission';

export type PermissionName =
  | 'create_order'
  | 'update_order'
  | 'delete_order_item'
  | 'void_order'
  | 'refund_order'
  | 'manage_menu'
  | 'manage_tables'
  | 'manage_printers'
  | 'manage_users'
  | 'manage_settings';

export const RequiresPermission = (permission: PermissionName) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
