import type { ItemResponse } from '@spicyhome/client-ts';

export interface FilterMenuItemsOptions {
  categoryId: number | null;
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
 * Filters a list of active items by optional category and text query.
 * Items are expected to already be active-only before calling this function.
 */
export function filterMenuItems(
  items: ItemResponse[],
  options: FilterMenuItemsOptions,
): ItemResponse[] {
  const { categoryId, query } = options;

  return items.filter((item) => {
    if (categoryId !== null && item.categoryId !== categoryId) return false;
    return matchesQuery(item, query);
  });
}
