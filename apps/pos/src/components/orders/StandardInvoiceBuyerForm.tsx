/**
 * StandardInvoiceBuyerForm — buyer details form for ZATCA standard (tax) invoices.
 *
 * Renders 8 fields as native <input> elements with dark-theme styling
 * matching the POS admin forms. The global on-screen keyboard (when enabled
 * from the Layout user menu) attaches to these fields automatically; the
 * native device keyboard always remains available too.
 *
 * Uses the shared `ZatcaBuyerDetails` Zod schema from `@spicyhome/shared`
 * for validation (shared between BE and FE).
 */

import {
  type ZatcaBuyerDetails,
  parseZatcaBuyerDetails,
  formatZatcaBuyerDetailsErrors,
} from '@spicyhome/shared';

export type { ZatcaBuyerDetails } from '@spicyhome/shared';

type Props = {
  value: ZatcaBuyerDetails;
  onChange: (next: ZatcaBuyerDetails) => void;
  disabled?: boolean;
  errors?: Partial<Record<keyof ZatcaBuyerDetails, string>>;
};

/** Create an empty buyer object with SA country default. */
export function emptyStandardInvoiceBuyer(): ZatcaBuyerDetails {
  return {
    name: '',
    vatNumber: '',
    street: '',
    buildingNumber: '',
    citySubdivision: '',
    city: '',
    postalCode: '',
    country: 'SA',
  };
}

/**
 * Client-side validation for the standard buyer form.
 * Uses the shared Zod schema from @spicyhome/shared for consistency
 * with server-side validation.
 */
export function validateStandardBuyer(
  b: ZatcaBuyerDetails,
): Partial<Record<keyof ZatcaBuyerDetails, string>> {
  const result = parseZatcaBuyerDetails(b);
  if (result.success) return {};
  return formatZatcaBuyerDetailsErrors(result.error) as Partial<
    Record<keyof ZatcaBuyerDetails, string>
  >;
}

const INPUT_CLASS =
  'w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white';

const LABEL_CLASS = 'block text-xs text-gray-500 mb-1';

function fieldError(errors: Props['errors'], key: keyof ZatcaBuyerDetails): string {
  return errors?.[key] || '';
}

/**
 * Update a single field in the buyer object.
 */
function updateField(
  prev: ZatcaBuyerDetails,
  key: keyof ZatcaBuyerDetails,
  value: string,
  onChange: (next: ZatcaBuyerDetails) => void,
): void {
  onChange({ ...prev, [key]: value });
}

export function StandardInvoiceBuyerForm({ value, onChange, disabled, errors }: Props) {
  return (
    <div className="space-y-2">
      {/* Name + VAT in a 2-col grid */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLASS}>Buyer Name</label>
          <input
            className={INPUT_CLASS}
            value={value.name}
            onChange={(e) => updateField(value, 'name', e.target.value, onChange)}
            disabled={disabled}
            placeholder="Company / Legal Name"
          />
          {fieldError(errors, 'name') && (
            <p className="text-xs text-red-400 mt-0.5">{fieldError(errors, 'name')}</p>
          )}
        </div>
        <div>
          <label className={LABEL_CLASS}>VAT Number (15 digits)</label>
          <input
            className={INPUT_CLASS}
            value={value.vatNumber}
            onChange={(e) => updateField(value, 'vatNumber', e.target.value, onChange)}
            disabled={disabled}
            placeholder="300123456789012"
            maxLength={15}
            inputMode="numeric"
          />
          {fieldError(errors, 'vatNumber') && (
            <p className="text-xs text-red-400 mt-0.5">{fieldError(errors, 'vatNumber')}</p>
          )}
        </div>
      </div>

      {/* Street + Building in a 2-col grid */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLASS}>Street</label>
          <input
            className={INPUT_CLASS}
            value={value.street}
            onChange={(e) => updateField(value, 'street', e.target.value, onChange)}
            disabled={disabled}
            placeholder="King Fahd Road"
          />
          {fieldError(errors, 'street') && (
            <p className="text-xs text-red-400 mt-0.5">{fieldError(errors, 'street')}</p>
          )}
        </div>
        <div>
          <label className={LABEL_CLASS}>Building Number</label>
          <input
            className={INPUT_CLASS}
            value={value.buildingNumber}
            onChange={(e) => updateField(value, 'buildingNumber', e.target.value, onChange)}
            disabled={disabled}
            placeholder="7845"
          />
          {fieldError(errors, 'buildingNumber') && (
            <p className="text-xs text-red-400 mt-0.5">{fieldError(errors, 'buildingNumber')}</p>
          )}
        </div>
      </div>

      {/* District + City in a 2-col grid */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLASS}>District</label>
          <input
            className={INPUT_CLASS}
            value={value.citySubdivision}
            onChange={(e) => updateField(value, 'citySubdivision', e.target.value, onChange)}
            disabled={disabled}
            placeholder="Al-Olaya"
          />
          {fieldError(errors, 'citySubdivision') && (
            <p className="text-xs text-red-400 mt-0.5">{fieldError(errors, 'citySubdivision')}</p>
          )}
        </div>
        <div>
          <label className={LABEL_CLASS}>City</label>
          <input
            className={INPUT_CLASS}
            value={value.city}
            onChange={(e) => updateField(value, 'city', e.target.value, onChange)}
            disabled={disabled}
            placeholder="Riyadh"
          />
          {fieldError(errors, 'city') && (
            <p className="text-xs text-red-400 mt-0.5">{fieldError(errors, 'city')}</p>
          )}
        </div>
      </div>

      {/* Postal Code + Country in a 2-col grid */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLASS}>Postal Code</label>
          <input
            className={INPUT_CLASS}
            value={value.postalCode}
            onChange={(e) => updateField(value, 'postalCode', e.target.value, onChange)}
            disabled={disabled}
            placeholder="12271"
          />
          {fieldError(errors, 'postalCode') && (
            <p className="text-xs text-red-400 mt-0.5">{fieldError(errors, 'postalCode')}</p>
          )}
        </div>
        <div>
          <label className={LABEL_CLASS}>Country (ISO)</label>
          <input
            className={INPUT_CLASS}
            value={value.country}
            onChange={(e) => updateField(value, 'country', e.target.value, onChange)}
            disabled={disabled}
            placeholder="SA"
            maxLength={2}
          />
          {fieldError(errors, 'country') && (
            <p className="text-xs text-red-400 mt-0.5">{fieldError(errors, 'country')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
