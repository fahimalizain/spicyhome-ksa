import { describe, it, expect, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  OnScreenKeyboardProvider,
  useOnScreenKeyboard,
} from '../components/on-screen-keyboard/OnScreenKeyboardProvider';
import { OskDock, type OskSize } from '../components/on-screen-keyboard/OskDock';
import { OSK_TEST_ID } from '../components/on-screen-keyboard/OnScreenKeyboard';

/** Toggle wired to the context — mirrors the Layout user menu control. */
function Toggle() {
  const { enabled, setEnabled } = useOnScreenKeyboard();
  return (
    <button type="button" onClick={() => setEnabled(!enabled)}>
      toggle-osk
    </button>
  );
}

function keyboard() {
  return screen.queryByTestId(OSK_TEST_ID);
}

function enable() {
  fireEvent.click(screen.getByText('toggle-osk'));
}

function focusField(testId: string) {
  fireEvent.focusIn(screen.getByTestId(testId));
}

/**
 * Click a virtual key by its displayed label (touch, like the existing
 * on-screen-keyboard tests — jsdom reports touch support).
 */
function pressKey(label: string) {
  const span = screen.getByText(label);
  const button = span.closest('.hg-button');
  if (!button) throw new Error(`no .hg-button for label "${label}"`);
  fireEvent.touchStart(button);
}

beforeEach(() => {
  localStorage.clear();
});

describe('OskDock', () => {
  it('floating by default: without any dock, the keyboard renders fixed at the viewport bottom', () => {
    render(
      <OnScreenKeyboardProvider>
        <Toggle />
        <input data-testid="field" type="text" />
      </OnScreenKeyboardProvider>,
    );
    enable();
    focusField('field');

    const kb = keyboard();
    expect(kb).toBeInTheDocument();
    expect(kb?.closest('[data-testid="osk-dock"]')).toBeNull();
    expect(kb).toHaveClass('fixed');
  });

  it('docks the keyboard inside the matching dock host when the focused field is in scope', () => {
    render(
      <OnScreenKeyboardProvider>
        <Toggle />
        <div data-osk-scope data-testid="modal">
          <input data-testid="modal-field" type="number" />
          <OskDock />
        </div>
        <input data-testid="outside-field" type="text" />
      </OnScreenKeyboardProvider>,
    );
    enable();

    // Field inside the scope: keyboard portals into the dock host.
    focusField('modal-field');
    const dock = within(screen.getByTestId('modal')).getByTestId('osk-dock');
    const kb = keyboard();
    expect(kb).toBeInTheDocument();
    expect(dock.contains(kb)).toBe(true);
    expect(kb).toHaveClass('relative'); // docked placement, not fixed

    // Field outside every scope: keyboard falls back to floating.
    focusField('outside-field');
    const kb2 = keyboard();
    expect(kb2).toBeInTheDocument();
    expect(kb2?.closest('[data-testid="osk-dock"]')).toBeNull();
    expect(kb2).toHaveClass('fixed');
  });

  it('falls back to floating when the dock unmounts while a field in its scope is focused', () => {
    function DockHarness() {
      const [showDock, setShowDock] = useState(true);
      return (
        <OnScreenKeyboardProvider>
          <Toggle />
          <div data-osk-scope data-testid="modal">
            <input data-testid="modal-field" type="number" />
            {showDock && <OskDock />}
          </div>
          <button type="button" onClick={() => setShowDock(false)}>
            remove-dock
          </button>
        </OnScreenKeyboardProvider>
      );
    }
    render(<DockHarness />);
    enable();
    focusField('modal-field');

    const dock = within(screen.getByTestId('modal')).getByTestId('osk-dock');
    expect(dock.contains(keyboard()!)).toBe(true);

    fireEvent.click(screen.getByText('remove-dock'));

    // No crash, no docked keyboard: it falls back to floating and the
    // focused field keeps working.
    const kb = keyboard();
    expect(kb).toBeInTheDocument();
    expect(kb?.closest('[data-testid="osk-dock"]')).toBeNull();
    pressKey('5');
    expect(screen.getByTestId('modal-field')).toHaveValue(5);
  });

  it('nested scopes: the innermost dock hosts the keyboard regardless of registration order', () => {
    render(
      <OnScreenKeyboardProvider>
        <Toggle />
        <div data-osk-scope data-testid="outer-scope">
          <div data-osk-scope data-testid="inner-scope">
            <input data-testid="inner-field" type="text" />
            <OskDock />
          </div>
          <OskDock />
        </div>
      </OnScreenKeyboardProvider>,
    );
    enable();
    focusField('inner-field');

    const innerDock = within(screen.getByTestId('inner-scope')).getByTestId('osk-dock');
    const outerDock = within(screen.getByTestId('outer-scope'))
      .getAllByTestId('osk-dock')
      .find((d) => d !== innerDock)!;
    const kb = keyboard();
    expect(innerDock.contains(kb)).toBe(true);
    expect(outerDock.contains(kb)).toBe(false);
  });

  it('dock host is a zero-footprint empty div while the keyboard is elsewhere', () => {
    render(
      <OnScreenKeyboardProvider>
        <Toggle />
        <div data-osk-scope>
          <input data-testid="modal-field" type="number" />
          <OskDock />
        </div>
      </OnScreenKeyboardProvider>,
    );

    const dock = screen.getByTestId('osk-dock');
    expect(dock).toBeInTheDocument();
    expect(dock.children.length).toBe(0);

    // OSK enabled but nothing focused: still empty.
    enable();
    expect(dock.children.length).toBe(0);
  });

  it('default dock size is md: keyboard carries pos-osk-size-md / data-osk-size="md"', () => {
    render(
      <OnScreenKeyboardProvider>
        <Toggle />
        <div data-osk-scope>
          <input data-testid="modal-field" type="text" />
          <OskDock />
        </div>
      </OnScreenKeyboardProvider>,
    );
    enable();
    focusField('modal-field');

    const kb = keyboard();
    expect(kb).toBeInTheDocument();
    expect(kb).toHaveClass('pos-osk-size-md');
    expect(kb).toHaveAttribute('data-osk-size', 'md');
  });

  it('dock size sm: keyboard carries pos-osk-size-sm / data-osk-size="sm"', () => {
    render(
      <OnScreenKeyboardProvider>
        <Toggle />
        <div data-osk-scope>
          <input data-testid="modal-field" type="text" />
          <OskDock size="sm" />
        </div>
      </OnScreenKeyboardProvider>,
    );
    enable();
    focusField('modal-field');

    const kb = keyboard();
    expect(kb).toBeInTheDocument();
    expect(kb).toHaveClass('pos-osk-size-sm');
    expect(kb).toHaveAttribute('data-osk-size', 'sm');
  });

  it('dock size lg: keyboard carries pos-osk-size-lg / data-osk-size="lg"', () => {
    render(
      <OnScreenKeyboardProvider>
        <Toggle />
        <div data-osk-scope>
          <input data-testid="modal-field" type="text" />
          <OskDock size="lg" />
        </div>
      </OnScreenKeyboardProvider>,
    );
    enable();
    focusField('modal-field');

    const kb = keyboard();
    expect(kb).toBeInTheDocument();
    expect(kb).toHaveClass('pos-osk-size-lg');
    expect(kb).toHaveAttribute('data-osk-size', 'lg');
  });

  it('floating keyboard (no dock) keeps the default md size', () => {
    render(
      <OnScreenKeyboardProvider>
        <Toggle />
        <input data-testid="field" type="text" />
      </OnScreenKeyboardProvider>,
    );
    enable();
    focusField('field');

    const kb = keyboard();
    expect(kb).toBeInTheDocument();
    expect(kb).toHaveClass('pos-osk-size-md');
    expect(kb).toHaveAttribute('data-osk-size', 'md');
  });

  it('re-registers when the dock size prop changes, resizing the keyboard in place', () => {
    function SizeHarness() {
      const [size, setSize] = useState<OskSize>('sm');
      return (
        <OnScreenKeyboardProvider>
          <Toggle />
          <div data-osk-scope>
            <input data-testid="modal-field" type="text" />
            <OskDock size={size} />
          </div>
          <button type="button" onClick={() => setSize('lg')}>
            grow-dock
          </button>
        </OnScreenKeyboardProvider>
      );
    }
    render(<SizeHarness />);
    enable();
    focusField('modal-field');

    expect(keyboard()).toHaveAttribute('data-osk-size', 'sm');

    fireEvent.click(screen.getByText('grow-dock'));

    const kb = keyboard();
    expect(kb).toBeInTheDocument();
    expect(kb).toHaveAttribute('data-osk-size', 'lg');
    expect(kb).toHaveClass('pos-osk-size-lg');
  });
});
