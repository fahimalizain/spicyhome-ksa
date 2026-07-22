import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { printers } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

@Injectable()
export class PrintersService {
  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {}

  list(): any[] {
    return this.db.select().from(printers).all();
  }

  get(id: number): any {
    const printer = this.db.select().from(printers).where(eq(printers.id, id)).get();
    if (!printer) throw new NotFoundException('Printer not found');
    return printer;
  }

  create(dto: any, userId: number): any {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      name: dto.name,
      ip: dto.ip,
      port: dto.port ?? 9100,
      role: dto.role,
      isActive: dto.isActive !== undefined ? (dto.isActive ? 1 : 0) : 1,
      ...createAuditFields(userId, now),
    };
    const result = this.db.insert(printers).values(row as any).run();
    return { id: Number(result.lastInsertRowid), ...row };
  }

  update(id: number, dto: any, userId: number): any {
    const printer = this.db.select().from(printers).where(eq(printers.id, id)).get();
    if (!printer) throw new NotFoundException('Printer not found');

    const updates: Record<string, any> = { ...updateAuditFields(userId) };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.ip !== undefined) updates.ip = dto.ip;
    if (dto.port !== undefined) updates.port = dto.port;
    if (dto.role !== undefined) updates.role = dto.role;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;

    this.db.update(printers).set(updates).where(eq(printers.id, id)).run();
    return this.db.select().from(printers).where(eq(printers.id, id)).get();
  }
}
