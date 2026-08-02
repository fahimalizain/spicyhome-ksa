/**
 * On-screen keyboard preference persistence.
 *
 * The keyboard is opt-in: off by default, toggled from the Layout user menu.
 * The value is stored as '1' / '0' in localStorage so an unset or corrupted
 * value safely defaults to disabled. All access is wrapped in try/catch so
 * storage being unavailable (private mode, quota) degrades gracefully.
 */

const STORAGE_KEY = 'spicyhome_osk_enabled';

export function getOskEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOskEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Storage unavailable — the preference simply won't persist this session.
  }
}
