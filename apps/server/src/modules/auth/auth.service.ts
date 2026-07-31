import {
  Injectable,
  Inject,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compareSync, hashSync } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { users, userRoles } from '@spicyhome/db';
import { getNextServiceDayBoundaryUnix } from '@spicyhome/shared';
import { MeResponse } from './dto/me-response.dto';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import { mapBools } from '../../common/bool-mapper.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

const DTO_TO_DB_PERMISSIONS: Record<string, string> = {
  createOrder: 'create_order',
  updateOrder: 'update_order',
  deleteOrderItem: 'delete_order_item',
  voidOrder: 'void_order',
  refundOrder: 'refund_order',
  payOrder: 'pay_order',
  manageMenu: 'manage_menu',
  manageTables: 'manage_tables',
  managePrinters: 'manage_printers',
  manageUsers: 'manage_users',
  manageSettings: 'manage_settings',
};

const USER_BOOL_FIELDS = ['isActive', 'androidLogin'] as const;
const ROLE_BOOL_FIELDS = Object.keys(DTO_TO_DB_PERMISSIONS) as readonly string[];

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private jwtService: JwtService,
  ) {}

  listUsernames(platform?: string): { usernames: string[] } {
    const where =
      platform === 'android'
        ? and(eq(users.isActive, 1), eq(users.androidLogin, 1))
        : eq(users.isActive, 1);
    const rows = this.db
      .select({ username: users.username })
      .from(users)
      .where(where)
      .orderBy(users.username)
      .all();
    return { usernames: rows.map((r) => r.username) };
  }

  async login(
    username: string,
    pin: string,
    clientType: 'android' | 'pos',
  ): Promise<{ accessToken: string }> {
    const user = this.db.select().from(users).where(eq(users.username, username)).get();
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');

    const valid = compareSync(pin, user.pinHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // ADR 0004: Android logins require users.android_login = 1. Use the same
    // generic message as bad credentials to avoid user enumeration.
    if (clientType === 'android' && user.androidLogin !== 1) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // User context for Sentry is now set per-request by SentryUserInterceptor
    // (apps/server/src/common/interceptors/sentry-user.interceptor.ts).
    // This avoids cross-contamination when multiple cashiers use the same server.

    const nowMs = Date.now();
    const payload = {
      sub: user.id,
      username: user.username,
      roleId: user.roleId,
      clientType,
      exp: getNextServiceDayBoundaryUnix(nowMs),
    };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken };
  }

  async getMe(userId: number): Promise<MeResponse> {
    const user = this.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw new NotFoundException('User not found');

    const role = this.db.select().from(userRoles).where(eq(userRoles.id, user.roleId)).get();
    if (!role) throw new NotFoundException('Role not found');

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      roleId: user.roleId,
      isActive: user.isActive === 1,
      roleName: role.name,
      createOrder: role.createOrder === 1,
      updateOrder: role.updateOrder === 1,
      deleteOrderItem: role.deleteOrderItem === 1,
      voidOrder: role.voidOrder === 1,
      refundOrder: role.refundOrder === 1,
      payOrder: role.payOrder === 1,
      manageMenu: role.manageMenu === 1,
      manageTables: role.manageTables === 1,
      managePrinters: role.managePrinters === 1,
      manageUsers: role.manageUsers === 1,
      manageSettings: role.manageSettings === 1,
    };
  }

  listUsers(): any[] {
    return this.db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        roleId: users.roleId,
        isActive: users.isActive,
        androidLogin: users.androidLogin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        createdBy: users.createdBy,
        updatedBy: users.updatedBy,
      })
      .from(users)
      .all()
      .map((r) => mapBools(r, USER_BOOL_FIELDS));
  }

  getUserById(id: number): any {
    const user = this.db.select().from(users).where(eq(users.id, id)).get();
    if (!user) throw new NotFoundException('User not found');
    const { pinHash: _pinHash, ...safe } = user;
    return mapBools(safe, USER_BOOL_FIELDS);
  }

  createUser(
    dto: { username: string; pin: string; name: string; roleId: number; androidLogin?: boolean },
    createdBy: number,
  ): any {
    const existing = this.db.select().from(users).where(eq(users.username, dto.username)).get();
    if (existing) throw new ConflictException('Username already exists');

    const role = this.db.select().from(userRoles).where(eq(userRoles.id, dto.roleId)).get();
    if (!role) throw new BadRequestException('Role not found');

    const pinHash = hashSync(dto.pin, 10);
    const now = Math.floor(Date.now() / 1000);
    const row = {
      username: dto.username,
      pinHash,
      name: dto.name,
      roleId: dto.roleId,
      isActive: 1,
      androidLogin: dto.androidLogin === false ? 0 : 1,
      ...createAuditFields(createdBy, now),
    };

    const result = this.db
      .insert(users)
      .values(row as any)
      .run();
    return {
      id: Number(result.lastInsertRowid),
      username: dto.username,
      name: dto.name,
      roleId: dto.roleId,
      isActive: true,
      androidLogin: dto.androidLogin !== false,
    };
  }

  updateUser(
    id: number,
    dto: {
      name?: string;
      roleId?: number;
      isActive?: boolean;
      pin?: string;
      androidLogin?: boolean;
    },
    updatedBy: number,
  ): any {
    const user = this.db.select().from(users).where(eq(users.id, id)).get();
    if (!user) throw new NotFoundException('User not found');

    const updates: Record<string, any> = {
      ...updateAuditFields(updatedBy),
    };

    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.roleId !== undefined) {
      const role = this.db.select().from(userRoles).where(eq(userRoles.id, dto.roleId)).get();
      if (!role) throw new BadRequestException('Role not found');
      updates.roleId = dto.roleId;
    }
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;
    if (dto.androidLogin !== undefined) updates.androidLogin = dto.androidLogin ? 1 : 0;
    if (dto.pin !== undefined) updates.pinHash = hashSync(dto.pin, 10);

    this.db.update(users).set(updates).where(eq(users.id, id)).run();

    const updated = this.db.select().from(users).where(eq(users.id, id)).get()!;
    const { pinHash: _pinHash, ...safe } = updated;
    return mapBools(safe, USER_BOOL_FIELDS);
  }

  listRoles(): any[] {
    return this.db
      .select()
      .from(userRoles)
      .all()
      .map((r) => mapBools(r, ROLE_BOOL_FIELDS));
  }

  createRole(dto: Record<string, any>, createdBy: number): any {
    const now = Math.floor(Date.now() / 1000);
    const row: Record<string, any> = {
      name: dto.name,
      ...createAuditFields(createdBy, now),
    };
    for (const [dtoKey, dbKey] of Object.entries(DTO_TO_DB_PERMISSIONS)) {
      row[dbKey] = dto[dtoKey] ? 1 : 0;
    }

    const result = this.db
      .insert(userRoles)
      .values(row as any)
      .run();
    const id = Number(result.lastInsertRowid);
    const created = this.db.select().from(userRoles).where(eq(userRoles.id, id)).get()!;
    return mapBools(created, ROLE_BOOL_FIELDS);
  }

  updateRole(id: number, dto: Record<string, any>, updatedBy: number): any {
    const role = this.db.select().from(userRoles).where(eq(userRoles.id, id)).get();
    if (!role) throw new NotFoundException('Role not found');

    const updates: Record<string, any> = { ...updateAuditFields(updatedBy) };

    if (dto.name !== undefined) updates.name = dto.name;
    for (const [dtoKey, dbKey] of Object.entries(DTO_TO_DB_PERMISSIONS)) {
      if (dto[dtoKey] !== undefined) {
        updates[dbKey] = dto[dtoKey] ? 1 : 0;
      }
    }

    this.db.update(userRoles).set(updates).where(eq(userRoles.id, id)).run();
    const updated = this.db.select().from(userRoles).where(eq(userRoles.id, id)).get()!;
    return mapBools(updated, ROLE_BOOL_FIELDS);
  }
}
