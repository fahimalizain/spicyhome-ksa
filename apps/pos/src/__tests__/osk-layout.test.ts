import { describe, it, expect } from 'vitest';
import { wantsOskNumpad, oskLayoutFor } from '../components/on-screen-keyboard/oskLayout';

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

describe('wantsOskNumpad', () => {
  it('is true for type="number"', () => {
    expect(wantsOskNumpad(input({ type: 'number' }))).toBe(true);
  });

  it('is true for money text fields with inputMode decimal', () => {
    expect(wantsOskNumpad(input({ type: 'text', inputmode: 'decimal' }))).toBe(true);
  });

  it('is true for numeric text fields (inputMode numeric)', () => {
    expect(wantsOskNumpad(input({ type: 'text', inputmode: 'numeric' }))).toBe(true);
  });

  it('is true for inputs explicitly marked data-osk-layout="numpad"', () => {
    expect(wantsOskNumpad(input({ type: 'text', 'data-osk-layout': 'numpad' }))).toBe(true);
  });

  it('is false for plain text inputs (missing type defaults to text)', () => {
    expect(wantsOskNumpad(input({ type: 'text' }))).toBe(false);
    expect(wantsOskNumpad(input())).toBe(false);
  });

  it('is false for textareas', () => {
    expect(wantsOskNumpad(textarea())).toBe(false);
    expect(wantsOskNumpad(textarea({ inputmode: 'decimal' }))).toBe(false);
  });

  it('matches inputmode case-insensitively', () => {
    expect(wantsOskNumpad(input({ type: 'text', inputmode: 'DECIMAL' }))).toBe(true);
  });
});

describe('oskLayoutFor', () => {
  it('type="number" gets the integer numpad (no decimal key)', () => {
    expect(oskLayoutFor(input({ type: 'number' }))).toBe('numpad-int');
  });

  it('inputMode="numeric" text fields get the integer numpad (no decimal key)', () => {
    expect(oskLayoutFor(input({ type: 'text', inputmode: 'numeric' }))).toBe('numpad-int');
    expect(oskLayoutFor(input({ type: 'text', inputmode: 'NUMERIC' }))).toBe('numpad-int');
  });

  it('decimal text fields get the full numpad (with decimal key)', () => {
    expect(oskLayoutFor(input({ type: 'text', inputmode: 'decimal' }))).toBe('numpad');
  });

  it('data-osk-layout="numpad" text fields get the full numpad', () => {
    expect(oskLayoutFor(input({ type: 'text', 'data-osk-layout': 'numpad' }))).toBe('numpad');
  });

  it('everything else gets the default QWERTY layout', () => {
    expect(oskLayoutFor(input({ type: 'text' }))).toBe('default');
    expect(oskLayoutFor(input({ type: 'password' }))).toBe('default');
    expect(oskLayoutFor(input({ type: 'email' }))).toBe('default');
    expect(oskLayoutFor(textarea())).toBe('default');
  });
});
