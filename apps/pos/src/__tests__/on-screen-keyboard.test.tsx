import { describe, it, expect, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  OnScreenKeyboardProvider,
  useOnScreenKeyboard,
} from '../components/on-screen-keyboard/OnScreenKeyboardProvider';
import { OSK_TEST_ID, OSK_KEYS_TEST_ID } from '../components/on-screen-keyboard/OnScreenKeyboard';

const STORAGE_KEY = 'spicyhome_osk_enabled';

/** Toggle wired to the context — mirrors the Layout user menu control. */
function Toggle() {
  const { enabled, setEnabled } = useOnScreenKeyboard();
  return (
    <button type="button" onClick={() => setEnabled(!enabled)}>
      toggle-osk
    </button>
  );
}

/** A React-controlled text input, like the POS forms. */
function ControlledField() {
  const [value, setValue] = useState('');
  return (
    <input
      data-testid="controlled-field"
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

/** A React-controlled number input, like the integer admin fields. */
function ControlledNumberField() {
  const [value, setValue] = useState('');
  return (
    <input
      data-testid="controlled-number-field"
      type="number"
      step="0.01"
      min="0"
      inputMode="decimal"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

/** A React-controlled money text input, like the payment amount fields. */
function ControlledDecimalField() {
  const [value, setValue] = useState('');
  return (
    <input
      data-testid="controlled-decimal-field"
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

function Harness() {
  return (
    <OnScreenKeyboardProvider>
      <Toggle />
      <ControlledField />
      <ControlledNumberField />
      <ControlledDecimalField />
      <input data-testid="plain-field" type="text" />
      <input data-testid="number-field" type="number" />
      <input data-testid="password-field" type="password" />
      <textarea data-testid="textarea-field" />
      <input data-testid="disabled-field" type="text" disabled />
      <input data-testid="readonly-field" type="text" readOnly />
      <input data-testid="opted-out-field" type="text" data-osk="false" />
      <input data-testid="maxlength-field" type="text" maxLength={3} />
    </OnScreenKeyboardProvider>
  );
}

function renderHarness() {
  render(<Harness />);
}

/** Enable the keyboard through the context toggle. */
function enable() {
  fireEvent.click(screen.getByText('toggle-osk'));
}

function focusField(testId: string) {
  fireEvent.focusIn(screen.getByTestId(testId));
}

function keyboard() {
  return screen.queryByTestId(OSK_TEST_ID);
}

/**
 * Click a virtual key by its displayed label.
 *
 * Without autoUseTouchEvents simple-keyboard falls back to mouse/click
 * handlers (jsdom has no PointerEvent), so keys are triggered via click.
 */
function pressKey(label: string) {
  const span = screen.getByText(label);
  const button = span.closest('.hg-button');
  if (!button) throw new Error(`no .hg-button for label "${label}"`);
  fireEvent.click(button);
}

/**
 * Press a function key (shift/caps/...) by its `hg-button-<name>` class from
 * simple-keyboard. Safer than matching by display text: the default layout
 * contains two {shift} keys with the same label.
 */
function pressKeyByClass(buttonClass: string) {
  const button = document.querySelector(`.${buttonClass}`);
  if (!button) throw new Error(`no .${buttonClass} button found`);
  fireEvent.click(button);
}

beforeEach(() => {
  localStorage.clear();
});

describe('OnScreenKeyboardProvider', () => {
  it('does not show the keyboard when disabled, even on an eligible field', () => {
    renderHarness();
    focusField('plain-field');
    expect(keyboard()).not.toBeInTheDocument();
  });

  it('shows the keyboard when enabled and an eligible text input is focused', () => {
    renderHarness();
    enable();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
    focusField('plain-field');
    expect(keyboard()).toBeInTheDocument();
  });

  it('shows the keyboard for password fields and textareas', () => {
    renderHarness();
    enable();
    focusField('password-field');
    expect(keyboard()).toBeInTheDocument();
    focusField('textarea-field');
    expect(keyboard()).toBeInTheDocument();
  });

  it('shows the numpad keyboard for number inputs', () => {
    renderHarness();
    enable();
    focusField('number-field');
    expect(keyboard()).toBeInTheDocument();
  });

  it('number fields get the integer numpad: digits, no decimal key, no layout switches', () => {
    renderHarness();
    enable();
    focusField('number-field');

    // Numpad digits and CLR are present.
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('CLR')).toBeInTheDocument();
    expect(screen.getByText('⌫')).toBeInTheDocument();
    expect(screen.getByText('enter')).toBeInTheDocument();

    // No decimal key: type="number" inputs silently drop intermediate
    // strings like "46." (programmatic sets become ""), so decimals cannot
    // be typed there — hiding the key prevents the silent-clear.
    expect(screen.queryByText('.')).not.toBeInTheDocument();

    // No QWERTY letters, no ?123 / shift / caps switches: the numpad is
    // the only layout number fields can use.
    expect(screen.queryByText('q')).not.toBeInTheDocument();
    expect(screen.queryByText('?123')).not.toBeInTheDocument();
    expect(screen.queryByText('ABC')).not.toBeInTheDocument();
    expect(document.querySelector('.hg-button-shift')).toBeNull();
    expect(document.querySelector('.hg-button-lock')).toBeNull();
  });

  it('decimal text fields get the numpad WITH the decimal key, and the trailing dot survives', () => {
    renderHarness();
    enable();
    focusField('controlled-decimal-field');

    // Numpad layout, with the decimal key, no QWERTY letters.
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('.')).toBeInTheDocument();
    expect(screen.queryByText('q')).not.toBeInTheDocument();
    expect(document.querySelector('.hg-button-shift')).toBeNull();

    // "12." must survive: text inputs accept intermediate strings that
    // type="number" would silently drop ("46." → "").
    pressKey('1');
    pressKey('2');
    pressKey('.');
    expect(screen.getByTestId('controlled-decimal-field')).toHaveValue('12.');

    pressKey('5');
    expect(screen.getByTestId('controlled-decimal-field')).toHaveValue('12.5');
  });

  it('types digits into a controlled type="number" input via the numpad', () => {
    renderHarness();
    enable();
    focusField('controlled-number-field');

    pressKey('4');
    pressKey('6');
    pressKey('4');
    pressKey('0');
    // jest-dom compares type="number" values numerically.
    expect(screen.getByTestId('controlled-number-field')).toHaveValue(4640);

    // Backspace works on the numpad too.
    pressKey('⌫');
    expect(screen.getByTestId('controlled-number-field')).toHaveValue(464);
  });

  it('CLR empties the number field', () => {
    renderHarness();
    enable();
    focusField('controlled-number-field');

    pressKey('1');
    pressKey('2');
    expect(screen.getByTestId('controlled-number-field')).toHaveValue(12);

    pressKey('CLR');
    // jest-dom reports an empty number input as null.
    expect(screen.getByTestId('controlled-number-field')).toHaveValue(null);

    // Typing continues after a clear.
    pressKey('7');
    expect(screen.getByTestId('controlled-number-field')).toHaveValue(7);
  });

  it('enter dismisses the keyboard from a number field (single-line)', () => {
    renderHarness();
    enable();
    focusField('controlled-number-field');
    pressKey('1');
    pressKey('enter');

    expect(keyboard()).not.toBeInTheDocument();
    expect(screen.getByTestId('controlled-number-field')).toHaveValue(1);
  });

  it('switching from a number field to a text field restores the QWERTY layout', () => {
    renderHarness();
    enable();
    focusField('number-field');
    expect(screen.queryByText('q')).not.toBeInTheDocument();

    focusField('controlled-field');
    pressKey('q');
    expect(screen.getByTestId('controlled-field')).toHaveValue('q');
    expect(screen.queryByText('CLR')).not.toBeInTheDocument();
  });

  it('does not show the keyboard for disabled, read-only, or opted-out fields', () => {
    renderHarness();
    enable();
    focusField('disabled-field');
    expect(keyboard()).not.toBeInTheDocument();
    focusField('readonly-field');
    expect(keyboard()).not.toBeInTheDocument();
    focusField('opted-out-field');
    expect(keyboard()).not.toBeInTheDocument();
  });

  it('hides the keyboard when the feature is toggled off and persists the choice', () => {
    renderHarness();
    enable();
    focusField('plain-field');
    expect(keyboard()).toBeInTheDocument();

    fireEvent.click(screen.getByText('toggle-osk'));
    expect(keyboard()).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('0');
  });

  it('types into a React-controlled input via virtual key presses', () => {
    renderHarness();
    enable();
    focusField('controlled-field');

    pressKey('q');
    expect(screen.getByTestId('controlled-field')).toHaveValue('q');

    pressKey('u');
    expect(screen.getByTestId('controlled-field')).toHaveValue('qu');
  });

  it('backspace removes characters', () => {
    renderHarness();
    enable();
    focusField('controlled-field');

    pressKey('q');
    pressKey('u');
    expect(screen.getByTestId('controlled-field')).toHaveValue('qu');

    pressKey('⌫');
    expect(screen.getByTestId('controlled-field')).toHaveValue('q');

    pressKey('⌫');
    expect(screen.getByTestId('controlled-field')).toHaveValue('');
  });

  it('respects the maxlength attribute of the focused field', () => {
    renderHarness();
    enable();
    focusField('maxlength-field');

    pressKey('a');
    pressKey('b');
    pressKey('c');
    pressKey('d');
    expect(screen.getByTestId('maxlength-field')).toHaveValue('abc');
  });

  it('switches focus between fields without remounting or misdirecting input', () => {
    renderHarness();
    enable();
    focusField('plain-field');
    expect(keyboard()).toBeInTheDocument();

    focusField('controlled-field');
    expect(keyboard()).toBeInTheDocument();
    pressKey('x');
    expect(screen.getByTestId('controlled-field')).toHaveValue('x');
    expect(screen.getByTestId('plain-field')).toHaveValue('');
  });

  it('enter inserts a newline in a textarea', () => {
    renderHarness();
    enable();
    focusField('textarea-field');

    pressKey('h');
    pressKey('i');
    pressKey('enter');
    expect(screen.getByTestId('textarea-field')).toHaveValue('hi\n');
    expect(keyboard()).toBeInTheDocument();
  });

  it('enter dismisses the keyboard for single-line inputs', () => {
    renderHarness();
    enable();
    focusField('controlled-field');
    pressKey('q');
    pressKey('enter');

    expect(keyboard()).not.toBeInTheDocument();
    expect(screen.getByTestId('controlled-field')).toHaveValue('q');
  });

  it('the Close button hides the keyboard until the next focus', () => {
    renderHarness();
    enable();
    focusField('plain-field');
    expect(keyboard()).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close'));
    expect(keyboard()).not.toBeInTheDocument();

    // Re-focusing an eligible field brings the keyboard back.
    focusField('plain-field');
    expect(keyboard()).toBeInTheDocument();
  });

  it('Close works after a touch: the header sits outside the preventDefault key area', () => {
    renderHarness();
    enable();
    focusField('plain-field');
    expect(keyboard()).toBeInTheDocument();

    // The Close button must NOT live inside the key wrapper whose
    // touchstart/mousedown preventDefault would swallow the click on real
    // touch browsers.
    const closeButton = screen.getByText('Close');
    expect(closeButton.closest(`[data-testid="${OSK_KEYS_TEST_ID}"]`)).toBeNull();

    // Simulate the touch flow: touchStart on the header, then the click.
    fireEvent.touchStart(closeButton);
    fireEvent.click(closeButton);
    expect(keyboard()).not.toBeInTheDocument();
  });

  it('shift is one-shot: one uppercase letter, then back to lowercase', () => {
    renderHarness();
    enable();
    focusField('controlled-field');

    pressKeyByClass('hg-button-shift');
    pressKey('A');
    expect(screen.getByTestId('controlled-field')).toHaveValue('A');

    // The shift layout was consumed by the first character.
    pressKey('b');
    expect(screen.getByTestId('controlled-field')).toHaveValue('Ab');
    expect(screen.queryByText('A')).not.toBeInTheDocument();
  });

  it('backspace does not consume a pending one-shot shift', () => {
    renderHarness();
    enable();
    focusField('controlled-field');

    pressKeyByClass('hg-button-shift');
    pressKey('⌫'); // should NOT drop shift
    // Now press A — on shift layout the button label is "A"
    pressKey('A');
    expect(screen.getByTestId('controlled-field')).toHaveValue('A');

    // One-shot consumed, next is lowercase.
    pressKey('b');
    expect(screen.getByTestId('controlled-field')).toHaveValue('Ab');
  });

  it('pressing shift again cancels the pending one-shot shift', () => {
    renderHarness();
    enable();
    focusField('controlled-field');

    pressKeyByClass('hg-button-shift');
    pressKeyByClass('hg-button-shift');
    pressKey('a');
    expect(screen.getByTestId('controlled-field')).toHaveValue('a');
  });

  it('caps lock is sticky until the lock key is pressed again', () => {
    renderHarness();
    enable();
    focusField('controlled-field');

    pressKeyByClass('hg-button-lock');
    pressKey('A');
    pressKey('B');
    expect(screen.getByTestId('controlled-field')).toHaveValue('AB');

    // Letters stay uppercase under caps lock...
    pressKey('C');
    expect(screen.getByTestId('controlled-field')).toHaveValue('ABC');

    // ...until lock is pressed again.
    pressKeyByClass('hg-button-lock');
    pressKey('d');
    expect(screen.getByTestId('controlled-field')).toHaveValue('ABCd');
  });
});
