import { describe, it, expect } from 'vitest';
import { isEligibleOskTarget } from '../components/on-screen-keyboard/isEligibleOskTarget';

function input(attrs: Record<string, string> = {}): HTMLInputElement {
  const el = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function textarea(attrs: Record<string, string> = {}): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe('isEligibleOskTarget', () => {
  it('accepts text-like input types and textarea', () => {
    expect(isEligibleOskTarget(input({ type: 'text' }))).toBe(true);
    expect(isEligibleOskTarget(input({ type: 'search' }))).toBe(true);
    expect(isEligibleOskTarget(input({ type: 'password' }))).toBe(true);
    expect(isEligibleOskTarget(input({ type: 'email' }))).toBe(true);
    expect(isEligibleOskTarget(input({ type: 'tel' }))).toBe(true);
    expect(isEligibleOskTarget(input({ type: 'url' }))).toBe(true);
    expect(isEligibleOskTarget(textarea())).toBe(true);
  });

  it('treats a missing type attribute as text', () => {
    expect(isEligibleOskTarget(input())).toBe(true);
  });

  it('accepts number inputs (numpad layout)', () => {
    expect(isEligibleOskTarget(input({ type: 'number' }))).toBe(true);
  });

  it('rejects other structured inputs', () => {
    expect(isEligibleOskTarget(input({ type: 'date' }))).toBe(false);
    expect(isEligibleOskTarget(input({ type: 'checkbox' }))).toBe(false);
    expect(isEligibleOskTarget(input({ type: 'hidden' }))).toBe(false);
  });

  it('rejects disabled inputs and textareas', () => {
    const el = input({ type: 'text' });
    el.disabled = true;
    expect(isEligibleOskTarget(el)).toBe(false);

    const ta = textarea();
    ta.disabled = true;
    expect(isEligibleOskTarget(ta)).toBe(false);
  });

  it('rejects read-only inputs and textareas', () => {
    const el = input({ type: 'text' });
    el.readOnly = true;
    expect(isEligibleOskTarget(el)).toBe(false);

    const ta = textarea();
    ta.readOnly = true;
    expect(isEligibleOskTarget(ta)).toBe(false);
  });

  it('rejects elements opted out with data-osk="false"', () => {
    expect(isEligibleOskTarget(input({ type: 'text', 'data-osk': 'false' }))).toBe(false);
    expect(isEligibleOskTarget(textarea({ 'data-osk': 'false' }))).toBe(false);
  });

  it('rejects elements inside an ancestor with data-osk="false"', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-osk', 'false');
    const el = input({ type: 'text' });
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);
    try {
      expect(isEligibleOskTarget(el)).toBe(false);
    } finally {
      wrapper.remove();
    }
  });

  it('rejects non-input elements and null', () => {
    expect(isEligibleOskTarget(null)).toBe(false);
    expect(isEligibleOskTarget(document.createElement('div'))).toBe(false);
    expect(isEligibleOskTarget(document.createElement('button'))).toBe(false);
  });
});
