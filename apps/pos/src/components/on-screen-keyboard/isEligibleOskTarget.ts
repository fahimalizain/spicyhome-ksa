/**
 * Predicate for fields the global on-screen keyboard attaches to.
 *
 * Eligible: <input> elements of type text/search/password/email/tel/url
 * (a missing type attribute defaults to "text" in the DOM), type="number"
 * (the keyboard switches to a dedicated numpad layout for those), and
 * <textarea> elements — unless the element is disabled, read-only, or
 * opted out via data-osk="false" on the element itself or any ancestor.
 *
 * Deliberately excluded: other structured inputs (date, checkbox, hidden,
 * ...) and non-input elements. Payment entry no longer ships its own
 * embedded numpad — amount/tendered are money text inputs
 * (inputMode=decimal) driven by the global numpad.
 */

const ELIGIBLE_INPUT_TYPES = new Set([
  'text',
  'search',
  'password',
  'email',
  'tel',
  'url',
  'number',
]);

export function isEligibleOskTarget(
  el: EventTarget | null,
): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[data-osk="false"]')) return false;

  if (el instanceof HTMLTextAreaElement) {
    return !el.disabled && !el.readOnly;
  }
  if (!(el instanceof HTMLInputElement)) return false;
  if (!ELIGIBLE_INPUT_TYPES.has((el.type || 'text').toLowerCase())) return false;

  return !el.disabled && !el.readOnly;
}
