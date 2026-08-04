import type { ItemResponse } from '@spicyhome/client-ts';

export interface FilterMenuItemsOptions {
  /**
   * When `subcategoryId` is set it takes precedence (items are filtered by
   * subcategory only). Otherwise `categoryId` filters by parent category.
   * Both null → all items.
   */
  categoryId: number | null;
  subcategoryId: number | null;
  query: string;
}

/**
 * Returns true if the query (case-insensitive substring) matches
 * `item.name` or `item.nameAr`.
 */
function matchesQuery(item: ItemResponse, query: string): boolean {
  const q = query.trim();
  if (q.length === 0) return true;
  const qLower = q.toLowerCase();
  if (item.name.toLowerCase().includes(qLower)) return true;
  const ar = item.nameAr;
  if (ar != null && ar !== 'null' && ar.toLowerCase().includes(qLower)) return true;
  return false;
}

/**
 * Filters a list of active items by optional subcategory / category and
 * text query. Items are expected to already be active-only before calling
 * this function.
 */
export function filterMenuItems(
  items: ItemResponse[],
  options: FilterMenuItemsOptions,
): ItemResponse[] {
  const { categoryId, subcategoryId, query } = options;

  return items.filter((item) => {
    if (subcategoryId !== null && item.subcategoryId !== subcategoryId) return false;
    if (subcategoryId === null && categoryId !== null && item.categoryId !== categoryId) {
      return false;
    }
    return matchesQuery(item, query);
  });
}
