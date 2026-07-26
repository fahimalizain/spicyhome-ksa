import { SpicyHomeClient } from '@spicyhome/client-ts';
import type { MeResponse, RequestCompleteInfo } from '@spicyhome/client-ts';
import * as Sentry from '@sentry/react';

const TOKEN_KEY = 'spicyhome_token';
const ME_KEY = 'spicyhome_me';

function getBaseUrl(): string {
  return import.meta.env.DEV ? `${window.location.origin}/api` : window.location.origin;
}

function addRequestBreadcrumb(info: RequestCompleteInfo): void {
  // Only create breadcrumbs for non-success responses to keep noise low.
  if (info.responseStatus < 400) return;

  Sentry.addBreadcrumb({
    category: 'http',
    message: `${info.method} ${info.url}`,
    level: info.responseStatus >= 500 ? 'error' : 'warning',
    data: {
      method: info.method,
      url: info.url,
      status_code: info.responseStatus,
      request_body: info.requestBody,
      response_body: info.responseBody,
    },
  });
}

export const client = new SpicyHomeClient({
  baseUrl: getBaseUrl(),
  getToken: () => localStorage.getItem(TOKEN_KEY),
  onUnauthorized: () => {
    clearToken();
    window.location.href = '/login';
  },
  onRequestComplete: addRequestBreadcrumb,
});

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  Sentry.setUser(null);
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
