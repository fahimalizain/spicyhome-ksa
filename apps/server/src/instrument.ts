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

  // Start with the NestJS integration (auto-instruments NestJS apps)
  const integrations: unknown[] = [Sentry.nestIntegration()];

  const initOptions: Record<string, unknown> = {
    dsn: SENTRY_DSN,
    environment,
    release,
    tracesSampleRate,
    integrations,
    // Capture all exceptions — do NOT filter out HttpExceptions
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
    // Errors and traces will still work.
    delete initOptions.profilesSampleRate;
  }

  Sentry.init(initOptions);
  sentryInitialized = true;
}

export function isSentryInitialized(): boolean {
  return sentryInitialized;
}
