# ADR 0001 — Sentry Observability

Date: 2026-07-25
Status: Accepted

## Context

SpicyHome POS needs error monitoring and performance tracing across its three
deployment targets: the NestJS server, the React SPA (Windows 7 Chrome 109), and
the Android tablet app. We evaluated Sentry against other options (Datadog,
OpenTelemetry, New Relic) and chose Sentry for its mature SDK ecosystem across
all three platforms and its generous free tier.

## Decision

We integrate Sentry SDKs into all three apps with **full APM** (errors, traces,
and Node profiling on the server). Integration is opt-in per deployment — no
error monitoring unless a DSN is configured.

### Org Layout

Three conceptual projects, each with its own DSN:

| Project          | DSN env var                | Release format                |
| ---------------- | -------------------------- | ----------------------------- |
| Server (NestJS)  | `SENTRY_DSN`               | `spicyhome-server@{VERSION}`  |
| POS SPA (React)  | `VITE_SENTRY_DSN`          | `spicyhome-pos@{VERSION}`     |
| Android (Kotlin) | `SENTRY_DSN` (BuildConfig) | `spicyhome-android@{VERSION}` |

### Secrets

- DSNs are injected via environment variables (server/SPA) or
  `local.properties` / project properties (Android).
- **GitHub Secrets** used in the release workflow (`.github/workflows/release.yml`):
  - `secrets.SENTRY_POS_DSN` — injected as `VITE_SENTRY_DSN` at SPA build time
  - `secrets.SENTRY_ANDROID_DSN` — injected as `SENTRY_DSN` for Android BuildConfig
  - `secrets.SENTRY_AUTH_TOKEN` — CI-only for source map uploads; never shipped to
    end-user machines
  - `vars.SENTRY_ORG` — Sentry organization slug for source map uploads
- The server DSN (`SENTRY_DSN`) is set at runtime on the deployed machine and
  is not a GitHub secret.
- All DSNs are gitignored — never committed.

### Telemetry

- **Errors**: Captured unconditionally when DSN is present.
- **Traces**: `tracesSampleRate = 1.0`, env-overridable via
  `SENTRY_TRACES_SAMPLE_RATE` / `VITE_SENTRY_TRACES_SAMPLE_RATE`.
- **Profiling** (server only): `profilesSampleRate = 1.0`, graceful fallback if
  `@sentry/profiling-node` native module is unavailable (e.g. after
  `npm install --ignore-scripts`).

### Enablement Rule

**DSN present → init Sentry; else no-op.**

Apps MUST work correctly with zero Sentry configuration. No crashes, startup
delays, or functional changes when DSN is absent.

### User Context

After login, all three apps set `Sentry.setUser({ id, username })`. On logout
or auth failure, user context is cleared. This links errors to specific staff
members.

### Server Exception Capture

A custom `SentryExceptionFilter` captures **all** exceptions — including
`HttpException` with 4xx status codes — because for a POS system, knowing about
every failed request (401, 403, 404, 409, etc.) is critical for operations. The
default Sentry NestJS filter skips many `HttpException` instances, so we
explicitly override it.

HTTP response status codes and bodies are preserved correctly.

### WebSocket Gateway

NestJS `APP_FILTER` does not apply to WebSocket gateways. We add
`@UseFilters(SentryExceptionFilter)` explicitly to `RealtimeGateway` so that
WebSocket handler errors are also captured.

### Health Endpoint

`GET /health` returns unauthenticated liveness probe:

```json
{ "status": "ok", "version": "202607.24.4" }
```

Excluded from Swagger/OpenAPI to avoid drift test noise.

### Source Map Upload

SPA source maps are uploaded in CI only when `SENTRY_AUTH_TOKEN` is set, via
`@sentry/vite-plugin`. The upload is soft-fail — if the token is missing (e.g.
before Sentry secrets are configured), the release is not blocked.

### Profiling on Windows 7

`@sentry/profiling-node` is loaded with a try/catch. If the native module fails
to `require()`, profiling is silently disabled. Errors and traces still work.

### SPA Crash UI

`Sentry.ErrorBoundary` with a dark full-screen fallback:

- **Retry** button calls `resetError()` to remount below the boundary
- **Reload** button calls `location.reload()`
- Event ID shown for user to reference in support tickets

### Android Version

`versionName` in `app/build.gradle.kts` is wired to the root `VERSION` file
(was previously hardcoded `0.0.1`). The Sentry release is
`spicyhome-android@{versionName}`.

### Android Secrets

Sentry DSN and environment are read from `local.properties` (gitignored) or
environment variables, then baked into `BuildConfig` at compile time.

## Consequences

### Positive

- Full error visibility across all three platforms
- Zero-config offline operation without Sentry
- Release tracking via root VERSION file
- User-linked error attribution
- No performance regression when DSN absent

### Negative

- ~50 KB added to SPA bundle (gzipped)
- ~2 MB added to Android APK (Sentry native libs)
- Server package size increases by Sentry npm deps
- Additional CI secret management burden

### Neutral / Mitigations

- SPA bundle impact is acceptable for an Electron-free POS on LAN
- Android APK size increase is negligible for a dedicated tablet device
- CI secrets are documented in the release workflow; soft-fail prevents
  blocking releases before secrets exist

## Rejected Alternatives

### Session Replay

**Rejected** due to:

- Chrome 109 does not support `rrweb` used by Sentry Replay (requires
  `MutationObserver` features added in Chrome 127+).
- Privacy concerns with recording POS order data and customer information.

### PII Scrubbing

**Not implemented** at this stage. The POS is operated by restaurant staff on
dedicated devices in a KSA restaurant setting. No customer PII enters the
system (orders are anonymous). Staff usernames/IDs are acceptable in error
contexts. Scrubbing infrastructure will be added later if needed for
regulatory or privacy compliance.

### AppSignal / Datadog / New Relic

**Rejected** — Sentry has first-class NestJS, React, and Android SDKs with
minimal configuration overhead. The free tier (5K events/month per project)
is sufficient for a single-restaurant deployment.
