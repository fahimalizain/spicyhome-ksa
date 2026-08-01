import { describe, it, expect } from 'vitest';
import { filterMenuItems } from '../lib/filterMenuItems';
import type { ItemResponse } from '@spicyhome/client-ts';

function makeItem(overrides: Partial<ItemResponse> = {}): ItemResponse {
  return {
    id: 1,
    categoryId: 1,
    subcategoryId: 1,
    name: 'Burger',
    priceHalalas: 2300,
    vatRateBp: 1500,
    sortOrder: 0,
    isActive: true,
    nameAr: null,
    createdAt: 1000,
    updatedAt: 1000,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

describe('filterMenuItems', () => {
  const items: ItemResponse[] = [
    makeItem({
      id: 1,
      categoryId: 1,
      subcategoryId: 1,
      name: 'Butter Chicken',
      nameAr: 'دجاج بالزبدة',
      priceHalalas: 3450,
    }),
    makeItem({
      id: 2,
      categoryId: 1,
      subcategoryId: 2,
      name: 'Chicken Biryani',
      nameAr: 'برياني دجاج',
      priceHalalas: 2875,
    }),
    makeItem({
      id: 3,
      categoryId: 2,
      subcategoryId: 3,
      name: 'Falafel Wrap',
      nameAr: 'لفافة فلافل',
      priceHalalas: 1150,
    }),
    makeItem({
      id: 4,
      categoryId: 2,
      subcategoryId: 3,
      name: 'Hummus',
      nameAr: 'حمص',
      priceHalalas: 920,
    }),
    makeItem({
      id: 5,
      categoryId: 2,
      subcategoryId: 4,
      name: 'Hot Wings',
      nameAr: null,
      priceHalalas: 1725,
    }),
  ];

  it('returns all items when no filters applied', () => {
    const result = filterMenuItems(items, { subcategoryId: null, categoryId: null, query: '' });
    expect(result).toHaveLength(5);
  });

  it('filters by category only (no query)', () => {
    const result = filterMenuItems(items, { subcategoryId: null, categoryId: 2, query: '' });
    expect(result).toEqual([items[2], items[3], items[4]]);
  });

  it('filters by subcategory only (takes precedence over category)', () => {
    const result = filterMenuItems(items, { subcategoryId: 3, categoryId: 2, query: '' });
    expect(result).toEqual([items[2], items[3]]);
  });

  it('subcategory filter ignores the category filter when they conflict', () => {
    // categoryId 1 with subcategory 3 (which lives under category 2) →
    // the subcategory wins and returns items from category 2.
    const result = filterMenuItems(items, { subcategoryId: 3, categoryId: 1, query: '' });
    expect(result).toEqual([items[2], items[3]]);
  });

  it('subcategory filter returns empty when nothing matches', () => {
    const result = filterMenuItems(items, { subcategoryId: 999, categoryId: null, query: '' });
    expect(result).toHaveLength(0);
  });

  it('subcategory AND search compose', () => {
    const result = filterMenuItems(items, { subcategoryId: 3, categoryId: null, query: 'hum' });
    expect(result).toEqual([items[3]]);
  });

  it('substring match on English name', () => {
    const result = filterMenuItems(items, {
      subcategoryId: null,
      categoryId: null,
      query: 'chick',
    });
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.name)).toEqual(['Butter Chicken', 'Chicken Biryani']);
  });

  it('match on nameAr substring', () => {
    const result = filterMenuItems(items, { subcategoryId: null, categoryId: null, query: 'دجاج' });
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.name)).toEqual(['Butter Chicken', 'Chicken Biryani']);
  });

  it('case-insensitive match', () => {
    const result = filterMenuItems(items, {
      subcategoryId: null,
      categoryId: null,
      query: 'CHICKEN',
    });
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.name)).toEqual(['Butter Chicken', 'Chicken Biryani']);
  });

  it('match on lowercased query', () => {
    const result = filterMenuItems(items, {
      subcategoryId: null,
      categoryId: null,
      query: 'chicken',
    });
    expect(result).toHaveLength(2);
  });

  it('category AND search compose', () => {
    const result = filterMenuItems(items, { subcategoryId: null, categoryId: 1, query: 'chick' });
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.name)).toEqual(['Butter Chicken', 'Chicken Biryani']);
  });

  it('category + non-matching search returns empty', () => {
    const result = filterMenuItems(items, { subcategoryId: null, categoryId: 1, query: 'hummus' });
    expect(result).toHaveLength(0);
  });

  it('whitespace-only query returns full category list', () => {
    const result = filterMenuItems(items, { subcategoryId: null, categoryId: 2, query: '   ' });
    expect(result).toHaveLength(3);
  });

  it('no matches returns empty array', () => {
    const result = filterMenuItems(items, {
      subcategoryId: null,
      categoryId: null,
      query: 'xyzzy',
    });
    expect(result).toHaveLength(0);
  });

  it('empty query restores category-filtered list', () => {
    const result = filterMenuItems(items, { subcategoryId: null, categoryId: 2, query: '' });
    expect(result).toHaveLength(3);
  });

  it('null nameAr does not throw', () => {
    const result = filterMenuItems(items, {
      subcategoryId: null,
      categoryId: null,
      query: 'wings',
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Hot Wings');
    expect(result[0].nameAr).toBeNull();
  });

  it('clearing search restores full list', () => {
    const result = filterMenuItems(items, { subcategoryId: null, categoryId: null, query: '' });
    expect(result).toHaveLength(5);
  });

  it('exact nameAr match', () => {
    const result = filterMenuItems(items, { subcategoryId: null, categoryId: null, query: 'حمص' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Hummus');
  });
});
