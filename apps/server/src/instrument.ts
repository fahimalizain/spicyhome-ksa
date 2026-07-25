import { readAppVersion } from './common/app-version';

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

  Sentry.init(initOptions);
  sentryInitialized = true;
}

export function isSentryInitialized(): boolean {
  return sentryInitialized;
}
