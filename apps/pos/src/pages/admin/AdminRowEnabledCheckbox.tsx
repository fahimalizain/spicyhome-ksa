/** Extra classes on an admin list row while its enable toggle is in flight. */
export const ADMIN_ROW_BUSY_CLASS = 'opacity-50 pointer-events-none';

export type AdminRowEnabledCheckboxProps = {
  checked: boolean;
  disabled?: boolean;
  /** Accessible name, e.g. "Disable Zinger Burger" / "Enable Pepperoni". */
  ariaLabel: string;
  /** Optional tooltip, used for locked rows in later slices (cash / partner). */
  title?: string;
  onToggle: () => void;
};

/**
 * Reusable list-row enable/disable checkbox that sits at the LEFT of an admin
 * row, immediately before the title. The wrapper swallows the click so the
 * parent row's onClick (open edit) does not fire.
 */
export function AdminRowEnabledCheckbox({
  checked,
  disabled,
  ariaLabel,
  title,
  onToggle,
}: AdminRowEnabledCheckboxProps) {
  return (
    <div className="flex items-center shrink-0" title={title} onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={onToggle}
        className="w-4 h-4 accent-brand-600"
      />
    </div>
  );
}
