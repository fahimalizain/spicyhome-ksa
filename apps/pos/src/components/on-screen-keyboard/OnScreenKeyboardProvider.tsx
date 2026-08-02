import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { SimpleKeyboard } from 'react-simple-keyboard';
import { getOskEnabled, setOskEnabled } from '../../lib/on-screen-keyboard-settings';
import { isEligibleOskTarget } from './isEligibleOskTarget';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { OskDockInternalContext, type OskDockEntry, type OskSize } from './OskDock';

type OskField = HTMLInputElement | HTMLTextAreaElement;

export type OnScreenKeyboardContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /** True when the keyboard is currently rendered (enabled + eligible field focused). */
  isVisible: boolean;
};

const OnScreenKeyboardContext = createContext<OnScreenKeyboardContextValue | null>(null);

export function useOnScreenKeyboard(): OnScreenKeyboardContextValue {
  const ctx = useContext(OnScreenKeyboardContext);
  if (!ctx) {
    throw new Error('useOnScreenKeyboard must be used within an OnScreenKeyboardProvider');
  }
  return ctx;
}

/**
 * Assign a value through the native prototype setter so React's controlled
 * input tracking observes it (the "native setter trick"). Direct `el.value`
 * assignment would be swallowed by React's value tracker.
 */
function setNativeValue(el: OskField, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
}

/**
 * Update the focused field in a way React controlled components observe:
 * native setter + bubbling `input` event, then restore the caret. React's
 * onChange handlers fire naturally and parent state stays the source of truth.
 *
 * Caret restore is best-effort: type="number" inputs often throw or no-op
 * on setSelectionRange (Chrome, and jsdom throws outright), so the caret
 * is only restored where the field supports it.
 */
function applyValueToField(
  el: OskField,
  value: string,
  caretStart: number,
  caretEnd = caretStart,
): void {
  setNativeValue(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  try {
    el.setSelectionRange(caretStart, caretEnd);
  } catch {
    // number inputs may not support selection
  }
}

export function OnScreenKeyboardProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => getOskEnabled());
  const [activeTarget, setActiveTarget] = useState<OskField | null>(null);

  // Mutable refs: keyboardRef receives the library instance after mount,
  // containerRef is attached to the keyboard DOM node.
  const keyboardRef = useRef<SimpleKeyboard | null>(
    null,
  ) as MutableRefObject<SimpleKeyboard | null>;
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTargetRef = useRef<OskField | null>(null);
  activeTargetRef.current = activeTarget;

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    setOskEnabled(next);
    if (!next) setActiveTarget(null);
  }, []);

  // Dock registry: Map preserves registration order (re-registering the same
  // id updates in place). A version bump forces activeDockHost to re-resolve
  // whenever docks register/unregister while a field is focused.
  const dockRegistryRef = useRef<Map<string, OskDockEntry>>(new Map());
  const [dockVersion, setDockVersion] = useState(0);

  const registerDock = useCallback((entry: OskDockEntry) => {
    dockRegistryRef.current.set(entry.id, entry);
    setDockVersion((v) => v + 1);
  }, []);

  const unregisterDock = useCallback((id: string) => {
    if (dockRegistryRef.current.delete(id)) {
      setDockVersion((v) => v + 1);
    }
  }, []);

  const dockContextValue = useMemo(
    () => ({ registerDock, unregisterDock }),
    [registerDock, unregisterDock],
  );

  const hide = useCallback(() => {
    const el = activeTargetRef.current;
    if (el) el.blur();
    setActiveTarget(null);
  }, []);

  // Track the focused eligible field while the feature is enabled.
  useEffect(() => {
    if (!enabled) return;

    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!isEligibleOskTarget(target)) return;
      setActiveTarget(target);
      // Inside a dock host the field already sits above the inline keyboard,
      // so no scroll is needed. The floating keyboard keeps the field
      // centered above it so it stays visible.
      const docked = [...dockRegistryRef.current.values()].some(
        (entry) => entry.host.isConnected && entry.scope.contains(target),
      );
      if (!docked && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    function onFocusOut(e: FocusEvent) {
      const rt = e.relatedTarget;
      // Focus moved inside the keyboard itself (e.g. its Close button) —
      // hide() clears the target explicitly when that is clicked.
      if (rt instanceof Node && containerRef.current?.contains(rt)) return;
      // Moving straight to another eligible field — focusin takes over.
      if (rt && isEligibleOskTarget(rt)) return;
      setActiveTarget(null);
    }

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [enabled]);

  // Runs before the library computes the next value on every key press:
  // mirror the field's live value and caret into the keyboard's internal
  // state so physical typing / React-driven changes never go stale.
  const handleBeforeInputUpdate = useCallback((instance: SimpleKeyboard) => {
    const el = activeTargetRef.current;
    if (!el || !el.isConnected) return;
    // type="number" inputs expose no usable caret: selectionStart may be
    // null or throw (jsdom throws on selection reads in some paths). Fall
    // back to the end of the value so edits append / backspace at the end.
    let start = el.value.length;
    let end = el.value.length;
    try {
      start = el.selectionStart ?? el.value.length;
      end = el.selectionEnd ?? el.value.length;
    } catch {
      // number inputs may not support selection
    }
    instance.setInput(el.value);
    instance.setCaretPosition(start, end);
  }, []);

  // The library already computed the next value (character insert, backspace,
  // space, ...) — apply it to the focused field.
  const handleChange = useCallback((input: string) => {
    const el = activeTargetRef.current;
    if (!el) return;
    if (!el.isConnected) {
      setActiveTarget(null);
      return;
    }
    const instance = keyboardRef.current;
    const caretStart = instance?.getCaretPosition() ?? el.value.length;
    const caretEnd = instance?.getCaretPositionEnd() ?? caretStart;
    applyValueToField(el, input, caretStart, caretEnd);
  }, []);

  // Key presses other than enter: the numpad CLR key clears the field and
  // re-syncs the library instance (simple-keyboard treats {clear} as a no-op
  // for the input value itself — the provider owns the clearing).
  const handleKeyPress = useCallback((button: string) => {
    const el = activeTargetRef.current;
    if (!el) return;
    if (!el.isConnected) {
      setActiveTarget(null);
      return;
    }
    if (button === '{clear}') {
      applyValueToField(el, '', 0);
      const instance = keyboardRef.current;
      instance?.setInput('');
      instance?.setCaretPosition(0);
      return;
    }
    if (button !== '{enter}' && button !== '{numpadenter}') return;

    if (el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const next = `${el.value.slice(0, start)}\n${el.value.slice(end)}`;
      applyValueToField(el, next, start + 1);
      const instance = keyboardRef.current;
      instance?.setInput(next);
      instance?.setCaretPosition(start + 1);
      return;
    }
    // Single-line inputs: pressing enter dismisses the keyboard. Blur the
    // field (natural form behaviour) and clear the target explicitly so the
    // keyboard unmounts even if the blur's focusout is not observed.
    el.blur();
    setActiveTarget(null);
  }, []);

  const isVisible = enabled && activeTarget !== null;

  const contextValue = useMemo(
    () => ({ enabled, setEnabled, isVisible }),
    [enabled, setEnabled, isVisible],
  );

  // Resolve the dock the keyboard portals into for the focused field,
  // together with the key size that dock requests. A dock matches when its
  // scope contains the target and its host is still connected. Nested
  // scopes: the innermost matching scope wins (the field can only
  // meaningfully claim one dock). Disjoint scopes: the most recently
  // registered match wins (iteration order of the registry). Floating (no
  // match) keeps the default 'md' size.
  const activeDock = useMemo<{ host: HTMLElement; size: OskSize } | null>(() => {
    const target = activeTarget;
    if (!target) return null;
    let match: OskDockEntry | null = null;
    for (const entry of dockRegistryRef.current.values()) {
      if (!entry.host.isConnected) continue;
      if (!entry.scope.contains(target)) continue;
      if (match === null) {
        match = entry;
      } else if (match.scope.contains(entry.scope)) {
        match = entry; // entry's scope is nested inside match's scope
      } else if (!entry.scope.contains(match.scope)) {
        match = entry; // disjoint scopes — most recent registration wins
      }
    }
    return match ? { host: match.host, size: match.size } : null;
  }, [activeTarget, dockVersion]);

  const activeDockHost = activeDock?.host ?? null;
  const activeDockSize: OskSize = activeDock?.size ?? 'md';

  const keyboardNode =
    enabled && activeTarget ? (
      <OnScreenKeyboard
        target={activeTarget}
        placement={activeDockHost ? 'docked' : 'floating'}
        size={activeDockSize}
        onKeyPress={handleKeyPress}
        onChange={handleChange}
        onBeforeInputUpdate={handleBeforeInputUpdate}
        onClose={hide}
        keyboardRef={keyboardRef}
        containerRef={containerRef}
      />
    ) : null;

  return (
    <OnScreenKeyboardContext.Provider value={contextValue}>
      <OskDockInternalContext.Provider value={dockContextValue}>
        {children}
        {activeDockHost ? createPortal(keyboardNode, activeDockHost) : keyboardNode}
      </OskDockInternalContext.Provider>
    </OnScreenKeyboardContext.Provider>
  );
}
