import { useEffect, useRef } from 'react';
import type { CategoryResponse, SubcategoryResponse } from '@spicyhome/client-ts';

interface CategoryTreeFilterProps {
  categories: CategoryResponse[];
  subcategories: SubcategoryResponse[];
  /**
   * Selected category id — the selected category, or the parent of the
   * selected subcategory; null only when the filter is All.
   */
  categoryId: number | null;
  /** Selected subcategory id; takes precedence over `categoryId`. */
  subcategoryId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with (categoryId, subcategoryId); both null clears the filter. */
  onSelect: (categoryId: number | null, subcategoryId: number | null) => void;
}

/**
 * Trigger button + nested category/subcategory tree popover for filtering the
 * items list. Always-expanded list; closing happens on row select, Escape, or
 * mousedown outside (same pattern as the UserMenu in Layout).
 */
export function CategoryTreeFilter({
  categories,
  subcategories,
  categoryId,
  subcategoryId,
  open,
  onOpenChange,
  onSelect,
}: CategoryTreeFilterProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }

    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, onOpenChange]);

  /** Subcategories of a category, sorted by sortOrder then id. */
  function subcategoryOptions(parentId: number): SubcategoryResponse[] {
    return subcategories
      .filter((s) => s.categoryId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  let label = 'All';
  if (subcategoryId != null) {
    const parentName = categories.find((c) => c.id === categoryId)?.name;
    const childName = subcategories.find((s) => s.id === subcategoryId)?.name;
    label = `${parentName ?? `#${categoryId}`} / ${childName ?? `#${subcategoryId}`}`;
  } else if (categoryId != null) {
    label = categories.find((c) => c.id === categoryId)?.name ?? `#${categoryId}`;
  }

  const rowClasses =
    'touch-target !justify-start w-full px-4 py-2 text-sm hover:bg-gray-700 hover:text-white';

  return (
    <div ref={rootRef} className="relative shrink-0 min-w-0">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Filter by category: ${label}`}
        className="touch-target !justify-between gap-1 max-w-40 sm:max-w-48 md:max-w-56 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white"
      >
        <span className="truncate min-w-0">{label}</span>
        <span aria-hidden="true" className="text-xs text-gray-400">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-1 z-40 max-h-80 overflow-y-auto min-w-[12rem] rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect(null, null);
              onOpenChange(false);
            }}
            className={`${rowClasses} ${categoryId === null && subcategoryId === null ? 'text-brand-500' : 'text-gray-300'}`}
          >
            All
          </button>
          {sortedCategories.map((cat) => (
            <div key={cat.id}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelect(cat.id, null);
                  onOpenChange(false);
                }}
                className={`${rowClasses} ${categoryId === cat.id && subcategoryId === null ? 'text-brand-500' : 'text-gray-300'}`}
              >
                {cat.name}
              </button>
              {subcategoryOptions(cat.id).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelect(cat.id, sub.id);
                    onOpenChange(false);
                  }}
                  className={`${rowClasses} pl-8 ${subcategoryId === sub.id ? 'text-brand-500' : 'text-gray-300'}`}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
