import { useState, useRef, useEffect, useCallback } from 'react';

export type ConfirmActionButtonProps = {
  /** Idle label, e.g. "Void Order" */
  textContent: string;
  /** Armed label, e.g. "Confirm Void Order" */
  confirmTextContent: string;
  /** Hold duration in ms before onConfirm. Default 1500 */
  confirmationHoldDuration?: number;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  /** Optional extra classes when armed (confirm phase) */
  confirmClassName?: string;
  /** After confirm fires / external busy */
  busy?: boolean;
  busyTextContent?: string;
};

type ButtonState = 'idle' | 'armed' | 'busy';

export function ConfirmActionButton({
  textContent,
  confirmTextContent,
  confirmationHoldDuration = 1500,
  onConfirm,
  disabled = false,
  className,
  confirmClassName,
  busy = false,
  busyTextContent,
}: ConfirmActionButtonProps) {
  const [btnState, setBtnState] = useState<ButtonState>(busy ? 'busy' : 'idle');
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  // Refs for synchronous access in event handlers (avoiding stale closures)
  const pendingArmRef = useRef(false);
  const isHoldingRef = useRef(false);
  const holdStartRef = useRef(0);
  const rafRef = useRef(0);

  // Keep ref in sync with state and vice versa
  const setIsHoldingBoth = useCallback((v: boolean) => {
    isHoldingRef.current = v;
    setIsHolding(v);
  }, []);

  // Sync busy prop
  useEffect(() => {
    if (busy) {
      setBtnState('busy');
    } else {
      setBtnState((prev) => (prev === 'busy' ? 'idle' : prev));
    }
  }, [busy]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const startHold = useCallback(() => {
    setIsHoldingBoth(true);
    holdStartRef.current = performance.now();
    setProgress(0);

    function tick() {
      if (!isHoldingRef.current) return;
      const elapsed = performance.now() - holdStartRef.current;
      const p = Math.min(elapsed / confirmationHoldDuration, 1);
      setProgress(p);
      if (p >= 1) {
        isHoldingRef.current = false;
        setIsHolding(false);
        setBtnState('idle');
        setProgress(0);
        onConfirm();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [confirmationHoldDuration, onConfirm, setIsHoldingBoth]);

  const cancelHold = useCallback(() => {
    setIsHoldingBoth(false);
    cancelAnimationFrame(rafRef.current);
    setProgress(0);
  }, [setIsHoldingBoth]);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || btnState === 'busy') return;

    if (btnState === 'idle') {
      pendingArmRef.current = true;
    } else if (btnState === 'armed') {
      startHold();
      // Prevent scroll while holding
      (e.target as HTMLElement).style.touchAction = 'none';
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture may not be available in all environments
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || btnState === 'busy') return;

    // Restore touch action
    (e.target as HTMLElement).style.touchAction = '';

    if (pendingArmRef.current) {
      pendingArmRef.current = false;
      setBtnState('armed');
      return;
    }

    if (isHoldingRef.current) {
      const elapsed = performance.now() - holdStartRef.current;
      cancelHold();

      if (elapsed < 300) {
        // Short tap while armed — disarm back to idle
        setBtnState('idle');
      }
      // else: hold cancelled but stayed armed; progress already reset
    }
  }

  function handlePointerLeave(e: React.PointerEvent<HTMLButtonElement>) {
    (e.target as HTMLElement).style.touchAction = '';
    pendingArmRef.current = false;
    if (isHoldingRef.current) {
      cancelHold();
    }
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLButtonElement>) {
    (e.target as HTMLElement).style.touchAction = '';
    pendingArmRef.current = false;
    if (isHoldingRef.current) {
      cancelHold();
    }
  }

  function handleBlur() {
    pendingArmRef.current = false;
    if (isHoldingRef.current) {
      cancelHold();
    }
  }

  const isActive = disabled || btnState === 'busy';
  const isArmed = btnState === 'armed';

  const label = (() => {
    if (btnState === 'busy' && busyTextContent) return busyTextContent;
    if (btnState === 'armed') return confirmTextContent;
    return textContent;
  })();

  const appliedClassName = isArmed ? confirmClassName || className : className;
  const buttonClassName =
    appliedClassName && appliedClassName.length > 0
      ? `${appliedClassName} relative overflow-hidden`
      : 'relative overflow-hidden';

  return (
    <button
      type="button"
      className={buttonClassName}
      disabled={isActive}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      onBlur={handleBlur}
      aria-label={label}
      aria-pressed={isArmed ? true : undefined}
    >
      {/* Progress bar on the button itself — fills full button area */}
      {isHolding && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 z-0 bg-red-500/50 pointer-events-none"
          style={{ width: `${progress * 100}%` }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}
