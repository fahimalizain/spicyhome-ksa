import { readAppVersion } from './common/app-version';

// Node 18 on Windows 7: libuv's uv_os_gethostname uses GetHostNameW
// (a Windows 8+ API). On Windows 7 it returns ENOSYS, and Sentry's
// NodeClient calls os.hostname() at init — which throws synchronously
// and crashes the server. Polyfill os.hostname() with a safe fallback
// (COMPUTERNAME is always set on Windows) before Sentry is loaded.
// This module is imported first in main.ts, so the patch applies
// process-wide before any other caller of os.hostname().
//
// We use require('os') instead of import * as os because the TS
// __importStar wrapper creates a getter-only non-configurable proxy;
// Object.defineProperty on it throws. require('os') returns the real
// module singleton, whose hostname is a configurable data property.
// This also fixes Sentry's NodeClient, which calls require('os')
// directly — not the import wrapper.
const os = require('os') as typeof import('os');

let hostnameWorks = true;
try {
  os.hostname();
} catch {
  hostnameWorks = false;
}
export function resolveFallbackHostname(): string {
  return process.env.COMPUTERNAME || process.env.HOSTNAME || 'spicyhome-server';
}

if (!hostnameWorks) {
  const fallbackHostname = resolveFallbackHostname();
  try {
    // On the real os module (require('os')), hostname is a configurable
    // data property on Node 18. Object.defineProperty can override it.
    // This also fixes Sentry's NodeClient, which calls require('os')
    // directly.
    Object.defineProperty(os, 'hostname', {
      value: () => fallbackHostname,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Property is non-configurable — cannot override. Sentry.init
    // (below) is wrapped in try/catch and will catch the ENOSYS
    // error, so the server boots without error monitoring.
  }
}

const SENTRY_DSN = process.env.SENTRY_DSN;
const VERSION = readAppVersion();

let sentryInitialized = false;

if (SENTRY_DSN) {
  const Sentry = require('@sentry/nestjs');

  const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '1.0');
  const profilesSampleRate = parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '1.0');

  const environment =
    process.env.SENTRY_ENVIRONMENT ||
    process.env.WORKTREE_SLUG ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  const release = `spicyhome-server@${VERSION}`;

  // Max detail — cost is not a concern (same intent as Android).
  const integrations: unknown[] = [
    // NestJS instrumentation (auto-instruments controllers, providers, etc.)
    Sentry.nestIntegration(),
    // Express instrumentation — adds request-scoped isolation and HTTP semantics
    Sentry.expressIntegration(),
    // Node HTTP module instrumentation — captures outgoing HTTP calls
    Sentry.httpIntegration(),
    // Extra error data (attaches additional error properties to events)
    Sentry.extraErrorDataIntegration(),
    // Capture console.error as Sentry events (console.warn → breadcrumbs)
    Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
  ];

  const initOptions: Record<string, unknown> = {
    dsn: SENTRY_DSN,
    environment,
    release,
    sendDefaultPii: true,
    maxBreadcrumbs: 200,
    attachStacktrace: true,
    sampleRate: 1.0,
    tracesSampleRate,
    // Raise maxValueLength so request/response bodies aren't clipped too soon.
    maxValueLength: 8192,
    // Node 18 supports includeLocalVariables — adds source-level context to stack traces.
    // Safe on Node 18 which is our minimum server runtime.
    includeLocalVariables: true,
    integrations,
    // Capture all exceptions — do NOT filter out HttpExceptions.
    // The default Sentry filter skips many 4xx responses.
    // We use a custom global filter instead (SentryExceptionFilter).
  };

  // Try to load profiling; fallback gracefully if native module is missing
  try {
    const { nodeProfilingIntegration } = require('@sentry/profiling-node');
    integrations.push(nodeProfilingIntegration());
    initOptions.profilesSampleRate = profilesSampleRate;
  } catch {
    // Profiling not available (npm install --ignore-scripts may omit native module).
    // Errors, traces, and local variables will still work.
    delete initOptions.profilesSampleRate;
  }

  try {
    Sentry.init(initOptions);
    sentryInitialized = true;
  } catch (err) {
    // Never let Sentry init crash the server. The os.hostname() polyfill
    // above handles the known Win7 ENOSYS case; this guard covers any
    // other init-time failure so observability stays best-effort.
    console.error('[Sentry] init failed — running without error monitoring:', err);
  }
}

export function isSentryInitialized(): boolean {
  return sentryInitialized;
}
