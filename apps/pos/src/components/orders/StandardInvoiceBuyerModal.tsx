import { useState } from 'react';
import { OskDock } from '../on-screen-keyboard/OskDock';
import {
  StandardInvoiceBuyerForm,
  validateStandardBuyer,
  type ZatcaBuyerDetails,
} from './StandardInvoiceBuyerForm';

type Props = {
  /** Initial/committed buyer details when the modal opens. */
  initialBuyer: ZatcaBuyerDetails;
  /**
   * Field errors to show when the modal opens — e.g. when the modal is
   * re-opened from a failed submit so the cashier sees what to fix.
   */
  initialErrors?: Partial<Record<keyof ZatcaBuyerDetails, string>>;
  disabled?: boolean;
  /**
   * True while the parent's save/clear PATCH is in flight — the Done button
   * shows "Saving..." and stays disabled (parent also passes `disabled`).
   */
  saving?: boolean;
  /** Called with the validated buyer on Done. */
  onSave: (buyer: ZatcaBuyerDetails) => void;
  /** Called on Cancel (the parent decides whether to uncheck). */
  onCancel: () => void;
};

/**
 * StandardInvoiceBuyerModal — modal-hosted ZATCA buyer details form.
 *
 * Mirrors the AddPaymentModal pattern: the card root carries
 * `data-osk-scope` and an <OskDock size="md" /> sits under the form, so the
 * full QWERTY keyboard docks inside the modal instead of covering the action
 * buttons. Editing happens on a local draft so Cancel never clobbers a
 * previously-saved valid buyer on the parent.
 */
export function StandardInvoiceBuyerModal({
  initialBuyer,
  initialErrors,
  disabled,
  saving,
  onSave,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<ZatcaBuyerDetails>(initialBuyer);
  const [errors, setErrors] = useState<Partial<Record<keyof ZatcaBuyerDetails, string>>>(
    initialErrors ?? {},
  );

  function handleChange(next: ZatcaBuyerDetails) {
    setDraft(next);
    // Clear field errors as the user edits (same behavior as the old inline form).
    setErrors({});
  }

  function handleDone() {
    const fieldErrors = validateStandardBuyer(draft);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return; // keep the modal open so the cashier can fix
    }
    onSave(draft);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div
        data-osk-scope
        className="bg-gray-900 rounded-xl p-4 w-[780px] max-w-[90vw] max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-bold text-white mb-1">Standard Invoice — Buyer Details</h2>
        <p className="text-xs text-gray-500 mb-3">
          Required for B2B standard invoices — enter buyer tax details.
        </p>

        <StandardInvoiceBuyerForm
          value={draft}
          onChange={handleChange}
          errors={errors}
          disabled={disabled}
        />

        {/* Inline keyboard dock: the full QWERTY OSK portals in here when a
            field is focused, so it grows the modal instead of covering the
            Cancel/Done row. Zero footprint otherwise. */}
        <OskDock size="md" className="mt-3" />

        {/* Cancel / Done */}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="flex-1 touch-target bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-sm text-gray-300 py-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDone}
            disabled={disabled}
            className="flex-1 touch-target bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold text-white py-3"
          >
            {saving ? 'Saving...' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
