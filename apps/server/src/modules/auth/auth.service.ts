import { Injectable, Inject, UnauthorizedException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compareSync, hashSync } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { users, userRoles } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

const DTO_TO_DB_PERMISSIONS: Record<string, string> = {
  createOrder: 'create_order',
  updateOrder: 'update_order',
  deleteOrderItem: 'delete_order_item',
  voidOrder: 'void_order',
  refundOrder: 'refund_order',
  manageMenu: 'manage_menu',
  manageTables: 'manage_tables',
  managePrinters: 'manage_printers',
  manageUsers: 'manage_users',
  manageSettings: 'manage_settings',
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private jwtService: JwtService,
  ) {}

  async login(username: string, pin: string): Promise<{ accessToken: string }> {
    const user = this.db.select().from(users).where(eq(users.username, username)).get();
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');

    const valid = compareSync(pin, user.pinHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, username: user.username, roleId: user.roleId };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken };
  }

  listUsers(): any[] {
    return this.db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        roleId: users.roleId,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        createdBy: users.createdBy,
        updatedBy: users.updatedBy,
      })
      .from(users)
      .all();
  }

  getUserById(id: number): any {
    const user = this.db.select().from(users).where(eq(users.id, id)).get();
    if (!user) throw new NotFoundException('User not found');
    const { pinHash, ...safe } = user;
    return safe;
  }

  createUser(dto: { username: string; pin: string; name: string; roleId: number }, createdBy: number): any {
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
      ...createAuditFields(createdBy, now),
    };

    const result = this.db.insert(users).values(row as any).run();
    return { id: Number(result.lastInsertRowid), username: dto.username, name: dto.name, roleId: dto.roleId, isActive: true };
  }

  updateUser(id: number, dto: { name?: string; roleId?: number; isActive?: boolean; pin?: string }, updatedBy: number): any {
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
    if (dto.pin !== undefined) updates.pinHash = hashSync(dto.pin, 10);

    this.db.update(users).set(updates).where(eq(users.id, id)).run();

    const updated = this.db.select().from(users).where(eq(users.id, id)).get()!;
    const { pinHash, ...safe } = updated;
    return safe;
  }

  listRoles(): any[] {
    return this.db.select().from(userRoles).all();
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

    const result = this.db.insert(userRoles).values(row as any).run();
    return { id: Number(result.lastInsertRowid), ...row };
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
    return this.db.select().from(userRoles).where(eq(userRoles.id, id)).get();
  }
}
