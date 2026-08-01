import { describe, it, expect, beforeEach } from 'vitest';
import { getOskEnabled, setOskEnabled } from '../lib/on-screen-keyboard-settings';

const STORAGE_KEY = 'spicyhome_osk_enabled';

describe('on-screen keyboard settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to disabled when the key is missing', () => {
    expect(getOskEnabled()).toBe(false);
  });

  it('round-trips true and false', () => {
    setOskEnabled(true);
    expect(getOskEnabled()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');

    setOskEnabled(false);
    expect(getOskEnabled()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('0');
  });

  it('returns false for an invalid stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'banana');
    expect(getOskEnabled()).toBe(false);

    localStorage.setItem(STORAGE_KEY, '');
    expect(getOskEnabled()).toBe(false);

    localStorage.setItem(STORAGE_KEY, 'true');
    expect(getOskEnabled()).toBe(false);
  });
});
