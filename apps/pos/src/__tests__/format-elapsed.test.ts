import { describe, it, expect } from 'vitest';
import { formatElapsed } from '../lib/format-elapsed';

describe('formatElapsed', () => {
  it('formats zero as 0s', () => {
    expect(formatElapsed(0)).toBe('0s');
  });

  it('formats sub-minute values in seconds', () => {
    expect(formatElapsed(45)).toBe('45s');
  });

  it('formats exactly one minute as 1m', () => {
    expect(formatElapsed(60)).toBe('1m');
  });

  it('omits zero seconds for whole minutes', () => {
    expect(formatElapsed(120)).toBe('2m');
    expect(formatElapsed(3660)).toBe('1h 1m');
  });

  it('includes seconds after minutes', () => {
    expect(formatElapsed(65)).toBe('1m 5s');
  });

  it('formats exactly one hour as 1h', () => {
    expect(formatElapsed(3600)).toBe('1h');
  });

  it('omits zero minutes when hours and seconds present', () => {
    expect(formatElapsed(3605)).toBe('1h 5s');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatElapsed(3665)).toBe('1h 1m 5s');
    expect(formatElapsed(7325)).toBe('2h 2m 5s');
  });

  it('does not zero-pad', () => {
    expect(formatElapsed(5)).toBe('5s');
    expect(formatElapsed(65)).toBe('1m 5s');
  });

  it('clamps negative input to 0s', () => {
    expect(formatElapsed(-1)).toBe('0s');
    expect(formatElapsed(-3600)).toBe('0s');
  });
});
