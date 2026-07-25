import * as Sentry from '@sentry/react';
import React from 'react';
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

function getRelease(): string | undefined {
  const baked = import.meta.env.VITE_SENTRY_RELEASE as string | undefined;
  if (baked) return baked;
  // Fallback: read from the VERSION env injected at build time
  const version = import.meta.env.VITE_APP_VERSION as string | undefined;
  if (version) return `spicyhome-pos@${version}`;
  return undefined;
}

if (SENTRY_DSN) {
  const tracesSampleRate = parseFloat(
    (import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string) || '1.0',
  );

  const environment =
    (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) ||
    (import.meta.env.DEV ? 'development' : 'production');

  // Max detail — cost is not a concern for this deployment (same intent as Android).
  Sentry.init({
    dsn: SENTRY_DSN,
    environment,
    release: getRelease(),
    sendDefaultPii: true,
    maxBreadcrumbs: 200,
    attachStacktrace: true,
    sampleRate: 1.0,
    tracesSampleRate,
    // Raise maxValueLength so bodies and payloads aren't truncated aggressively.
    maxValueLength: 8192,
    integrations: [
      // React Router v6 instrumentation for transaction names
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      // Browser tracing — pageload, navigation, and fetch/XHR performance spans
      Sentry.browserTracingIntegration(),
      // Fetch/XHR breadcrumbs (method, URL, status) — bodies are captured via
      // the onRequestComplete hook in api.ts (SpicyHomeClient config)
      Sentry.httpClientIntegration(),
      // Capture console.error/warn as Sentry events/breadcrumbs
      Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
      // Browser API errors (e.g. unhandled promise rejections, script errors)
      Sentry.browserApiErrorsIntegration(),
    ],
    // No Session Replay — Chrome 109 does not support rrweb (requires
    // MutationObserver additions from Chrome 127+). Android has Replay
    // because WebView on Android 10+ supports it.
    //
    // No replayIntegration() here intentionally.
  });
}
