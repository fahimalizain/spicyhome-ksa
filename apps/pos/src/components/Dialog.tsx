import { useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import { OskDock } from './on-screen-keyboard/OskDock';

export type DialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /** Extra classes on the CARD (not the overlay). Default width is w-[480px]. */
  className?: string;
  /** Default 'md'. */
  oskSize?: 'sm' | 'md' | 'lg';
};

/**
 * Shared modal dialog primitive for admin CRUD pages (slice 1 of 6).
 *
 * The parent renders <Dialog /> only while open — there is no `open` prop.
 * Structure mirrors the existing POS modals (OrderVoidModal / AddPaymentModal):
 * a `div` overlay (native <dialog> is supported on Chrome 109 but none of the
 * existing modals use it), with the card root carrying `data-osk-scope` and an
 * <OskDock /> between the body and the footer so the on-screen keyboard docks
 * inside the dialog instead of covering Save/Cancel.
 *
 * Close paths: Escape on window, or a click on the overlay. The card
 * stopPropagation()s clicks so it never closes from inside. There is no
 * header X button; the caller owns the footer slot (Save/Cancel live there).
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  className,
  oskSize = 'md',
}: DialogProps) {
  const titleId = useId();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        data-osk-scope
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={`bg-gray-900 rounded-xl max-w-[90vw] max-h-[90vh] flex flex-col ${className ?? 'w-[480px]'}`}
      >
        <h2 id={titleId} className="text-lg font-bold text-white shrink-0 px-4 pt-4">
          {title}
        </h2>

        {/* The ONLY scroll region — the footer stays pinned below. */}
        <div data-testid="dialog-body" className="flex-1 overflow-y-auto min-h-0 px-4 pt-3">
          {children}
        </div>

        {/* Inline keyboard dock: the OSK portals in here while a field inside
            the dialog is focused, so it grows the dialog instead of covering
            the Save/Cancel row. Zero footprint otherwise. */}
        <OskDock size={oskSize} />

        <div data-testid="dialog-footer" className="shrink-0 px-4 pt-3 pb-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
