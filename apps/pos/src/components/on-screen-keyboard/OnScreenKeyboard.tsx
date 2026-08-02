import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import Keyboard, { type SimpleKeyboard } from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import { oskLayoutFor, type OskLayoutName } from './oskLayout';
import type { OskSize } from './OskDock';
import './on-screen-keyboard.css';

/** data-testid used by tests to detect whether the keyboard is rendered. */
export const OSK_TEST_ID = 'on-screen-keyboard';

/**
 * data-testid of the key-area wrapper. The header (Close button) lives
 * OUTSIDE this wrapper, which is the only region that prevents default on
 * press start — see the JSX below.
 */
export const OSK_KEYS_TEST_ID = 'on-screen-keyboard-keys';

type LayoutName = OskLayoutName | 'shift' | 'num';

/** How the shift layout was entered: not at all, one-shot, or sticky caps. */
type ShiftMode = 'none' | 'once' | 'lock';

/** English QWERTY with a shift layout and a numbers/symbols layout. */
const LAYOUTS: Record<LayoutName, string[]> = {
  default: [
    '` 1 2 3 4 5 6 7 8 9 0 - = {bksp}',
    'q w e r t y u i o p [ ] \\',
    "{lock} a s d f g h j k l ; ' {enter}",
    '{shift} z x c v b n m , . / {shift}',
    '{num} {space}',
  ],
  shift: [
    '~ ! @ # $ % ^ & * ( ) _ + {bksp}',
    'Q W E R T Y U I O P { } |',
    '{lock} A S D F G H J K L : " {enter}',
    '{shift} Z X C V B N M < > ? {shift}',
    '{num} {space}',
  ],
  num: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    '@ # $ % ^ & * ( ) - + =',
    '{abc} _ [ ] { } \\ | : ; {enter}',
    '{shift} , . / ? ! \' " {space} {shift}',
  ],
  // Phone-style numpad for numpad-eligible fields (inputMode=decimal/numeric,
  // data-osk-layout="numpad"). Deliberately separate from the 'num' symbols
  // layout (reached via ?123 from QWERTY): numpad fields get ONLY this
  // layout — no shift/abc/num switches leave the numpad.
  numpad: ['1 2 3', '4 5 6', '7 8 9', '{clear} 0 .', '{bksp} {enter}'],
  // Integer-only numpad for type="number" fields. Browsers reject
  // intermediate strings like "46." on number inputs (a programmatic set
  // silently becomes ""), so decimals cannot be typed there via the OSK at
  // all — the decimal key is omitted to prevent that silent-clear.
  'numpad-int': ['1 2 3', '4 5 6', '7 8 9', '{clear} 0 {bksp}', '{enter}'],
};

/** Labels for layout keys; merged over simple-keyboard's built-in display map. */
const DISPLAY: Record<string, string> = {
  '{bksp}': '⌫',
  '{enter}': 'enter',
  '{space}': 'space',
  '{num}': '?123',
  '{abc}': 'ABC',
  '{clear}': 'CLR',
};

/** Header height/font per key size (md is the historical default). */
const HEADER_CLASSES: Record<OskSize, string> = {
  sm: 'h-8 text-xs',
  md: 'h-10 text-sm',
  lg: 'h-11 text-sm',
};

type Props = {
  /** The field the keyboard is currently attached to. */
  target: HTMLInputElement | HTMLTextAreaElement;
  /**
   * 'floating' (default): fixed to the viewport bottom. 'docked': rendered
   * inline inside an <OskDock /> host within a modal/card, so it does not
   * overlap centered overlays.
   */
  placement?: 'floating' | 'docked';
  /** Key size (button height/font). Default: 'md'. */
  size?: OskSize;
  /** Key presses other than layout keys ({enter} etc.). */
  onKeyPress: (button: string) => void;
  /** Called with each keyboard-computed input value. */
  onChange: (input: string) => void;
  /** Called before the library computes the next value (keeps it in sync). */
  onBeforeInputUpdate: (instance: SimpleKeyboard) => void;
  /** Dismiss the keyboard (Close button). */
  onClose: () => void;
  /** Mutable so the library instance can be stored here after mount. */
  keyboardRef: MutableRefObject<SimpleKeyboard | null>;
  containerRef: RefObject<HTMLDivElement>;
};

export function OnScreenKeyboard({
  target,
  placement = 'floating',
  size = 'md',
  onKeyPress,
  onChange,
  onBeforeInputUpdate,
  onClose,
  keyboardRef,
  containerRef,
}: Props) {
  const [layoutName, setLayoutName] = useState<LayoutName>('default');
  // Tracks whether the shift layout is sticky caps lock or a one-shot shift
  // that returns to lowercase after the next character key.
  const shiftModeRef = useRef<ShiftMode>('none');

  // Reset whenever a new field gains focus: letters layout for text-like
  // fields, numpad for numpad-eligible fields (integer-only numpad for
  // type="number").
  useEffect(() => {
    setLayoutName(oskLayoutFor(target));
    shiftModeRef.current = 'none';
  }, [target]);

  // After the library instance exists, mirror the focused field's value and
  // caret into the keyboard's internal state (first mount is covered by
  // onInit on the <Keyboard> below).
  useEffect(() => {
    const instance = keyboardRef.current;
    if (instance) onBeforeInputUpdate(instance);
  }, [target, onBeforeInputUpdate, keyboardRef]);

  const handleKeyPress = useCallback(
    (button: string) => {
      // Numpad-only mode for numpad fields: the numpad layouts have no
      // layout-switch keys, but ignore them defensively so a stray press can
      // never leave the numpad while a numpad field is focused.
      if (oskLayoutFor(target) !== 'default') {
        if (
          button === '{shift}' ||
          button === '{lock}' ||
          button === '{num}' ||
          button === '{abc}'
        ) {
          return;
        }
      }
      if (button === '{shift}') {
        // One-shot shift: pressing shift again cancels it before any
        // character is typed; from caps lock it downgrades to one-shot.
        if (shiftModeRef.current === 'once') {
          setLayoutName('default');
          shiftModeRef.current = 'none';
        } else {
          setLayoutName('shift');
          shiftModeRef.current = 'once';
        }
        return;
      }
      if (button === '{lock}') {
        // Sticky caps lock: stays on until the lock key is pressed again.
        if (shiftModeRef.current === 'lock') {
          setLayoutName('default');
          shiftModeRef.current = 'none';
        } else {
          setLayoutName('shift');
          shiftModeRef.current = 'lock';
        }
        return;
      }
      if (button === '{num}' || button === '{abc}') {
        setLayoutName((current) => (current === 'num' ? 'default' : 'num'));
        return;
      }
      // A real character key (including space) consumes a pending one-shot
      // shift, so the next key is lowercase again. Edit keys ({bksp} {enter}
      // {numpadenter}) do NOT consume it — pressing shift then backspace
      // must keep the shift armed for the next character.
      const isEditKey = button === '{bksp}' || button === '{enter}' || button === '{numpadenter}';

      if (shiftModeRef.current === 'once' && !isEditKey) {
        setLayoutName('default');
        shiftModeRef.current = 'none';
      }
      onKeyPress(button);
    },
    [onKeyPress, target],
  );

  const handleInit = useCallback(
    (instance: SimpleKeyboard) => {
      keyboardRef.current = instance;
      onBeforeInputUpdate(instance);
    },
    [keyboardRef, onBeforeInputUpdate],
  );

  const handleKeyboardRef = useCallback(
    (instance: SimpleKeyboard) => {
      keyboardRef.current = instance;
    },
    [keyboardRef],
  );

  // Respect the field's maxlength attribute (the native value setter bypasses
  // the browser's maxlength enforcement, so the keyboard enforces it itself).
  const maxLength = target.maxLength > 0 ? target.maxLength : undefined;

  const rootClassName =
    placement === 'docked'
      ? `relative w-full z-auto select-none pos-osk-size-${size}`
      : `fixed bottom-0 left-0 right-0 z-[100] select-none pos-osk-size-${size}`;

  return (
    <div
      ref={containerRef}
      data-testid={OSK_TEST_ID}
      data-osk-size={size}
      aria-label="On-screen keyboard"
      className={rootClassName}
    >
      <header
        className={`flex items-center justify-between bg-gray-800 border-b border-gray-700 px-4 ${HEADER_CLASSES[size]} shrink-0`}
      >
        <span className="text-gray-300">Keyboard</span>
        <button
          type="button"
          onClick={onClose}
          className="touch-target text-gray-300 hover:text-white"
        >
          Close
        </button>
      </header>
      {/*
        Only the key area prevents default on press start, so key presses do
        not steal focus from the field. The header (Close button) lives
        OUTSIDE this wrapper: preventDefault on touchstart there would
        suppress the subsequent click on touch browsers and make Close
        unreliable.
      */}
      <div
        data-testid={OSK_KEYS_TEST_ID}
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
      >
        <Keyboard
          layout={LAYOUTS}
          layoutName={layoutName}
          display={DISPLAY}
          mergeDisplay
          theme="hg-theme-default pos-osk-theme"
          onChange={onChange}
          onKeyPress={handleKeyPress}
          beforeInputUpdate={onBeforeInputUpdate}
          onInit={handleInit}
          keyboardRef={handleKeyboardRef}
          maxLength={maxLength}
          preventMouseDownDefault
          autoUseTouchEvents
          newLineOnEnter={false}
          tabCharOnTab={false}
          enableLayoutCandidates={false}
          useButtonTag
        />
      </div>
    </div>
  );
}
