import { SpicyHomeClient } from '@spicyhome/client-ts';
import type { MeResponse } from '@spicyhome/client-ts';

const TOKEN_KEY = 'spicyhome_token';
const ME_KEY = 'spicyhome_me';

function getBaseUrl(): string {
  return window.location.origin;
}

export const client = new SpicyHomeClient({
  baseUrl: getBaseUrl(),
  getToken: () => localStorage.getItem(TOKEN_KEY),
});

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ME_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setMe(me: MeResponse): void {
  localStorage.setItem(ME_KEY, JSON.stringify(me));
}

export function getMe(): MeResponse | null {
  const raw = localStorage.getItem(ME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MeResponse;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
