import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { itemCategories, items } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

@Injectable()
export class MenuService {
  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {}

  listCategories(): any[] {
    return this.db.select().from(itemCategories).all();
  }

  getCategory(id: number): any {
    const cat = this.db.select().from(itemCategories).where(eq(itemCategories.id, id)).get();
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  createCategory(dto: any, userId: number): any {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      name: dto.name,
      sortOrder: dto.sortOrder ?? 0,
      printerId: dto.printerId ?? null,
      isActive: dto.isActive !== undefined ? (dto.isActive ? 1 : 0) : 1,
      ...createAuditFields(userId, now),
    };
    const result = this.db
      .insert(itemCategories)
      .values(row as any)
      .run();
    return { id: Number(result.lastInsertRowid), ...row };
  }

  updateCategory(id: number, dto: any, userId: number): any {
    const cat = this.db.select().from(itemCategories).where(eq(itemCategories.id, id)).get();
    if (!cat) throw new NotFoundException('Category not found');

    const updates: Record<string, any> = { ...updateAuditFields(userId) };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.sortOrder !== undefined) updates.sortOrder = dto.sortOrder;
    if (dto.printerId !== undefined) updates.printerId = dto.printerId;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;

    this.db.update(itemCategories).set(updates).where(eq(itemCategories.id, id)).run();
    return this.db.select().from(itemCategories).where(eq(itemCategories.id, id)).get();
  }

  listItems(categoryId?: number): any[] {
    if (categoryId) {
      return this.db.select().from(items).where(eq(items.categoryId, categoryId)).all();
    }
    return this.db.select().from(items).all();
  }

  getItem(id: number): any {
    const item = this.db.select().from(items).where(eq(items.id, id)).get();
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  createItem(dto: any, userId: number): any {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      categoryId: dto.categoryId,
      name: dto.name,
      nameAr: dto.nameAr ?? null,
      priceHalalas: dto.priceHalalas,
      vatRateBp: dto.vatRateBp ?? 1500,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive !== undefined ? (dto.isActive ? 1 : 0) : 1,
      ...createAuditFields(userId, now),
    };
    const result = this.db
      .insert(items)
      .values(row as any)
      .run();
    return { id: Number(result.lastInsertRowid), ...row };
  }

  updateItem(id: number, dto: any, userId: number): any {
    const item = this.db.select().from(items).where(eq(items.id, id)).get();
    if (!item) throw new NotFoundException('Item not found');

    const updates: Record<string, any> = { ...updateAuditFields(userId) };
    if (dto.categoryId !== undefined) updates.categoryId = dto.categoryId;
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.nameAr !== undefined) updates.nameAr = dto.nameAr;
    if (dto.priceHalalas !== undefined) updates.priceHalalas = dto.priceHalalas;
    if (dto.vatRateBp !== undefined) updates.vatRateBp = dto.vatRateBp;
    if (dto.sortOrder !== undefined) updates.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;

    this.db.update(items).set(updates).where(eq(items.id, id)).run();
    return this.db.select().from(items).where(eq(items.id, id)).get();
  }
}
