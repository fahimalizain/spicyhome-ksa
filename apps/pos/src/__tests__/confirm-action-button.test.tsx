import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ConfirmActionButton } from '../components/ConfirmActionButton';

describe('ConfirmActionButton', () => {
  let fakeNow: number;

  beforeEach(() => {
    fakeNow = 0;

    // Only fake timers and Date — NOT performance or requestAnimationFrame
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

    // Mock performance.now to return our controlled counter
    vi.spyOn(performance, 'now').mockImplementation(() => fakeNow);

    // Mock rAF to use setTimeout (which is faked), each tick advances fakeNow by 16ms
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => {
        fakeNow += 16;
        cb(fakeNow);
      }, 16) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) =>
      clearTimeout(id as unknown as NodeJS.Timeout),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals?.();
  });

  // Helper: click (pointerDown + pointerUp) on a button.
  // RTL's fireEvent wraps each call in act(), flushing React state updates.
  function clickBtn(el: HTMLElement) {
    fireEvent.pointerDown(el, { pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
  }

  // Helper: press down on a button (starts hold if armed).
  function pressDown(el: HTMLElement) {
    fireEvent.pointerDown(el, { pointerId: 1 });
  }

  // Helper: release from hold.
  function release(el: HTMLElement) {
    fireEvent.pointerUp(el, { pointerId: 1 });
  }

  // Advance fake timers and flush resulting React updates.
  async function advanceTimers(ms: number) {
    await act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  function renderButton(overrides: Record<string, unknown> = {}) {
    const onConfirm = vi.fn();
    const result = render(
      <ConfirmActionButton
        textContent="Void Order"
        confirmTextContent="Confirm Void Order"
        confirmationHoldDuration={2000}
        onConfirm={onConfirm}
        {...overrides}
      />,
    );
    return { ...result, onConfirm };
  }

  function getButton(name: string) {
    return screen.getByRole('button', { name });
  }

  // ── Test 1: Renders textContent initially ──
  it('renders textContent initially', () => {
    renderButton();
    const btn = getButton('Void Order');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  // ── Test 2: Click → shows confirmTextContent (armed) ──
  it('click arms the button, showing confirmTextContent', () => {
    renderButton();
    const btn = getButton('Void Order');

    clickBtn(btn);

    // State updates are flushed by act() inside fireEvent
    expect(getButton('Confirm Void Order')).toBeInTheDocument();
  });

  // ── Test 3: Short click while armed → disarm back to idle ──
  it('short click while armed disarms back to idle', () => {
    renderButton();
    const btn = getButton('Void Order');

    // First click: arm
    clickBtn(btn);
    const armedBtn = getButton('Confirm Void Order');
    expect(armedBtn).toBeInTheDocument();

    // Short click while armed: disarm
    clickBtn(armedBtn);

    expect(getButton('Void Order')).toBeInTheDocument();
  });

  // ── Test 4: pointerdown + hold full duration → onConfirm called once; returns to idle ──
  it('hold for full duration calls onConfirm and returns to idle', async () => {
    const { onConfirm } = renderButton();
    const btn = getButton('Void Order');

    // Arm
    clickBtn(btn);
    const armedBtn = getButton('Confirm Void Order');

    // Start hold
    pressDown(armedBtn);

    // Advance time by full hold duration (plus margin)
    await advanceTimers(2050);

    // onConfirm should have been called exactly once
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Button should return to idle
    expect(getButton('Void Order')).toBeInTheDocument();
  });

  // ── Test 5: pointerdown + partial hold + pointerup → onConfirm NOT called; still armed ──
  it('partial hold does NOT call onConfirm, stays armed, progress resets', async () => {
    const { onConfirm } = renderButton();
    const btn = getButton('Void Order');

    // Arm
    clickBtn(btn);
    const armedBtn = getButton('Confirm Void Order');

    // Start hold
    pressDown(armedBtn);

    // Advance 50% of hold duration
    await advanceTimers(1000);

    // Release before completion
    release(armedBtn);

    // onConfirm should NOT have been called
    expect(onConfirm).not.toHaveBeenCalled();

    // Button should still be armed (hold was cancelled but we're past the 300ms disarm threshold)
    expect(getButton('Confirm Void Order')).toBeInTheDocument();
  });

  // ── Test 6: disabled → no arm on click ──
  it('disabled button does not arm on click', () => {
    renderButton({ disabled: true });
    const btn = getButton('Void Order');
    expect(btn).toBeDisabled();

    clickBtn(btn);

    // Should still show idle label (not armed)
    expect(getButton('Void Order')).toBeInTheDocument();
  });

  // ── Test 7: busy → shows busy text, no interaction ──
  it('busy shows busy text and is disabled', () => {
    renderButton({ busy: true, busyTextContent: 'Voiding...' });
    const btn = getButton('Voiding...');
    expect(btn).toBeDisabled();
    expect(btn).toBeInTheDocument();
  });

  // ── Test 8: busy → idle transition works ──
  it('transitions from busy back to idle when busy prop changes', () => {
    const { rerender } = render(
      <ConfirmActionButton
        textContent="Void Order"
        confirmTextContent="Confirm Void Order"
        onConfirm={vi.fn()}
        busy={true}
        busyTextContent="Voiding..."
      />,
    );

    expect(getButton('Voiding...')).toBeDisabled();

    // Remove busy
    rerender(
      <ConfirmActionButton
        textContent="Void Order"
        confirmTextContent="Confirm Void Order"
        onConfirm={vi.fn()}
        busy={false}
      />,
    );

    const btn = getButton('Void Order');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  // ── Test 9: pointerLeave during hold cancels hold, stays armed ──
  it('pointerLeave during hold cancels hold and stays armed', async () => {
    const { onConfirm } = renderButton();
    const btn = getButton('Void Order');

    // Arm
    clickBtn(btn);
    const armedBtn = getButton('Confirm Void Order');

    // Start hold
    pressDown(armedBtn);

    // Small amount of progress
    await advanceTimers(500);

    // Pointer leave
    fireEvent.pointerLeave(armedBtn);

    // Advance rest of time — should NOT trigger onConfirm
    await advanceTimers(2000);

    expect(onConfirm).not.toHaveBeenCalled();

    // Still armed
    expect(getButton('Confirm Void Order')).toBeInTheDocument();
  });

  // ── Test 10: pointerCancel during hold cancels hold, stays armed ──
  it('pointerCancel during hold cancels hold and stays armed', async () => {
    const { onConfirm } = renderButton();
    const btn = getButton('Void Order');

    // Arm
    clickBtn(btn);
    const armedBtn = getButton('Confirm Void Order');

    // Start hold
    pressDown(armedBtn);

    // Small amount of progress
    await advanceTimers(500);

    // Pointer cancel
    fireEvent.pointerCancel(armedBtn);

    // Advance rest of time
    await advanceTimers(2000);

    expect(onConfirm).not.toHaveBeenCalled();

    // Still armed
    expect(getButton('Confirm Void Order')).toBeInTheDocument();
  });

  // ── Test 11: uses confirmClassName when armed ──
  it('applies confirmClassName when armed', () => {
    render(
      <ConfirmActionButton
        textContent="Void Order"
        confirmTextContent="Confirm Void Order"
        onConfirm={vi.fn()}
        className="idle-class"
        confirmClassName="armed-class"
      />,
    );
    const btn = getButton('Void Order');
    expect(btn.className).toContain('idle-class');

    // Arm
    clickBtn(btn);

    const armedBtn = getButton('Confirm Void Order');
    expect(armedBtn.className).toContain('armed-class');
  });
});
