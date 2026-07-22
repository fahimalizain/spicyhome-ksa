import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { tables } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

@Injectable()
export class TablesService {
  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {}

  list(): any[] {
    return this.db.select().from(tables).all();
  }

  get(id: number): any {
    const table = this.db.select().from(tables).where(eq(tables.id, id)).get();
    if (!table) throw new NotFoundException('Table not found');
    return table;
  }

  create(dto: any, userId: number): any {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      name: dto.name,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive !== undefined ? (dto.isActive ? 1 : 0) : 1,
      ...createAuditFields(userId, now),
    };
    const result = this.db.insert(tables).values(row as any).run();
    return { id: Number(result.lastInsertRowid), ...row };
  }

  update(id: number, dto: any, userId: number): any {
    const table = this.db.select().from(tables).where(eq(tables.id, id)).get();
    if (!table) throw new NotFoundException('Table not found');

    const updates: Record<string, any> = { ...updateAuditFields(userId) };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.sortOrder !== undefined) updates.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;

    this.db.update(tables).set(updates).where(eq(tables.id, id)).run();
    return this.db.select().from(tables).where(eq(tables.id, id)).get();
  }
}
