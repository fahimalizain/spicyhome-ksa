import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { itemCategories, itemSubcategories, items } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import { mapBools } from '../../common/bool-mapper.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

@Injectable()
export class MenuService {
  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {}

  listCategories(): any[] {
    return this.db
      .select()
      .from(itemCategories)
      .all()
      .map((r) => mapBools(r, ['isActive']));
  }

  getCategory(id: number): any {
    const cat = this.db.select().from(itemCategories).where(eq(itemCategories.id, id)).get();
    if (!cat) throw new NotFoundException('Category not found');
    return mapBools(cat, ['isActive']);
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
    return mapBools({ id: Number(result.lastInsertRowid), ...row }, ['isActive']);
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
    return mapBools(this.db.select().from(itemCategories).where(eq(itemCategories.id, id)).get()!, [
      'isActive',
    ]);
  }

  listSubcategories(categoryId?: number): any[] {
    let rows: any[];
    if (categoryId) {
      rows = this.db
        .select()
        .from(itemSubcategories)
        .where(eq(itemSubcategories.categoryId, categoryId))
        .all();
    } else {
      rows = this.db.select().from(itemSubcategories).all();
    }
    return rows.map((r) => mapBools(r, ['isActive']));
  }

  getSubcategory(id: number): any {
    const sub = this.db.select().from(itemSubcategories).where(eq(itemSubcategories.id, id)).get();
    if (!sub) throw new NotFoundException('Subcategory not found');
    return mapBools(sub, ['isActive']);
  }

  /**
   * Resolve a subcategory row or throw a client error. `forItem` changes the
   * message so item validation failures are not confused with subcategory
   * admin failures.
   */
  private requireSubcategory(id: number, context: string): any {
    const sub = this.db.select().from(itemSubcategories).where(eq(itemSubcategories.id, id)).get();
    if (!sub) {
      throw new BadRequestException(`Subcategory ${id} not found (${context})`);
    }
    return sub;
  }

  createSubcategory(dto: any, userId: number): any {
    // Parent category must exist (FK would also reject, but fail fast with a
    // clear message before audit fields are written).
    const cat = this.db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.id, dto.categoryId))
      .get();
    if (!cat) throw new BadRequestException(`Category ${dto.categoryId} not found`);

    const now = Math.floor(Date.now() / 1000);
    const row = {
      categoryId: dto.categoryId,
      name: dto.name,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive !== undefined ? (dto.isActive ? 1 : 0) : 1,
      ...createAuditFields(userId, now),
    };
    const result = this.db
      .insert(itemSubcategories)
      .values(row as any)
      .run();
    return mapBools({ id: Number(result.lastInsertRowid), ...row }, ['isActive']);
  }

  updateSubcategory(id: number, dto: any, userId: number): any {
    const sub = this.db.select().from(itemSubcategories).where(eq(itemSubcategories.id, id)).get();
    if (!sub) throw new NotFoundException('Subcategory not found');

    if (dto.categoryId !== undefined) {
      const cat = this.db
        .select()
        .from(itemCategories)
        .where(eq(itemCategories.id, dto.categoryId))
        .get();
      if (!cat) throw new BadRequestException(`Category ${dto.categoryId} not found`);
    }

    const updates: Record<string, any> = { ...updateAuditFields(userId) };
    if (dto.categoryId !== undefined) updates.categoryId = dto.categoryId;
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.sortOrder !== undefined) updates.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;

    this.db.update(itemSubcategories).set(updates).where(eq(itemSubcategories.id, id)).run();

    // Cascade the denormalized parent onto items referencing this subcategory
    // when the parent actually changed.
    if (dto.categoryId !== undefined && dto.categoryId !== sub.categoryId) {
      this.db
        .update(items)
        .set({ categoryId: dto.categoryId, ...updateAuditFields(userId) })
        .where(eq(items.subcategoryId, id))
        .run();
    }

    return mapBools(
      this.db.select().from(itemSubcategories).where(eq(itemSubcategories.id, id)).get()!,
      ['isActive'],
    );
  }

  listItems(categoryId?: number, subcategoryId?: number): any[] {
    let rows: any[];
    if (subcategoryId) {
      rows = this.db.select().from(items).where(eq(items.subcategoryId, subcategoryId)).all();
    } else if (categoryId) {
      rows = this.db.select().from(items).where(eq(items.categoryId, categoryId)).all();
    } else {
      rows = this.db.select().from(items).all();
    }
    return rows.map((r) => mapBools(r, ['isActive']));
  }

  getItem(id: number): any {
    const item = this.db.select().from(items).where(eq(items.id, id)).get();
    if (!item) throw new NotFoundException('Item not found');
    return mapBools(item, ['isActive']);
  }

  createItem(dto: any, userId: number): any {
    const now = Math.floor(Date.now() / 1000);
    // categoryId is derived from the subcategory's parent (never trusted
    // from the client) so items.category_id always matches the subcategory.
    const sub = this.requireSubcategory(dto.subcategoryId, 'create item');
    const row = {
      categoryId: sub.categoryId,
      subcategoryId: dto.subcategoryId,
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
    return mapBools({ id: Number(result.lastInsertRowid), ...row }, ['isActive']);
  }

  updateItem(id: number, dto: any, userId: number): any {
    const item = this.db.select().from(items).where(eq(items.id, id)).get();
    if (!item) throw new NotFoundException('Item not found');

    const updates: Record<string, any> = { ...updateAuditFields(userId) };
    if (dto.subcategoryId !== undefined) {
      // Derive the parent category from the new subcategory so the
      // denormalized category_id stays in sync.
      const sub = this.requireSubcategory(dto.subcategoryId, 'update item');
      updates.subcategoryId = dto.subcategoryId;
      updates.categoryId = sub.categoryId;
    }
    // categoryId without subcategoryId is ignored: category is always derived from subcategoryId.
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.nameAr !== undefined) updates.nameAr = dto.nameAr;
    if (dto.priceHalalas !== undefined) updates.priceHalalas = dto.priceHalalas;
    if (dto.vatRateBp !== undefined) updates.vatRateBp = dto.vatRateBp;
    if (dto.sortOrder !== undefined) updates.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;

    this.db.update(items).set(updates).where(eq(items.id, id)).run();
    return mapBools(this.db.select().from(items).where(eq(items.id, id)).get()!, ['isActive']);
  }
}
