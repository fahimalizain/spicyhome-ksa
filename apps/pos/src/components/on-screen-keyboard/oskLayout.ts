/**
 * Numpad layout selection for the global on-screen keyboard.
 *
 * The keyboard shows a phone-style numpad for more than just type="number":
 * money and decimal text fields (inputMode="decimal"/"numeric") get it too —
 * see wantsOskNumpad below.
 */

/** The keyboard layouts OnScreenKeyboard can start in per field type. */
export type OskLayoutName = 'default' | 'numpad' | 'numpad-int';

/**
 * True when the focused field should use a phone-style numpad instead of the
 * QWERTY layout:
 * - type="number" inputs (integer ports, sort orders, ...)
 * - money / decimal text fields: inputMode "decimal" or "numeric"
 * - anything explicitly marked data-osk-layout="numpad"
 *
 * Textareas always keep the QWERTY layout.
 */
export function wantsOskNumpad(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLTextAreaElement) return false;
  if (el.type === 'number') return true;
  const mode = (el.getAttribute('inputmode') || el.inputMode || '').toLowerCase();
  if (mode === 'decimal' || mode === 'numeric') return true;
  if (el.getAttribute('data-osk-layout') === 'numpad') return true;
  return false;
}

/**
 * The layout to show for a focused field.
 *
 * - type="number" → 'numpad-int' (integer numpad WITHOUT a decimal key).
 *   Browsers reject intermediate strings like "46." on number inputs: a
 *   programmatic set of "46." silently becomes "", so decimals cannot be
 *   typed into type="number" via the OSK at all. Hiding the "." key
 *   prevents that silent-clear instead of exposing it.
 * - inputMode="numeric" → 'numpad-int' too. Numeric means digits only
 *   (VAT numbers, quantities), so no decimal key.
 * - inputMode="decimal" and data-osk-layout="numpad" fields → 'numpad'
 *   WITH the decimal key. These are plain text inputs, which accept the
 *   trailing dot while typing.
 * - Everything else → 'default' (QWERTY).
 */
export function oskLayoutFor(el: HTMLInputElement | HTMLTextAreaElement): OskLayoutName {
  if (!(el instanceof HTMLInputElement)) return 'default';
  if (el.type === 'number') return 'numpad-int';
  const mode = (el.getAttribute('inputmode') || el.inputMode || '').toLowerCase();
  if (mode === 'numeric') return 'numpad-int';
  if (mode === 'decimal') return 'numpad';
  if (el.getAttribute('data-osk-layout') === 'numpad') return 'numpad';
  return 'default';
}
