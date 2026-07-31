# SpicyHome POS

POS system for SpicyHome Restaurant (KSA). Bazel monorepo with three apps:
NestJS backend, React SPA, and Android tablet app.

## Quick Start

```sh
# Install dependencies
pnpm install

# Run all tests (non-Android)
bazel test //apps/server:test //apps/pos:test //packages/...

# Run Android tests (requires ANDROID_HOME and JAVA_HOME)
bazel test //apps/android:unit_tests --action_env=ANDROID_HOME=... --action_env=JAVA_HOME=...

# Lint & format
pnpm check
```

## Dev Servers

```sh
bazel run //apps/server:dev    # NestJS API on :3000
bazel run //apps/pos:dev       # React SPA on :5173
```

## Repo Layout

```
spicyhome-ksa/
├── apps/
│   ├── server/     # NestJS backend (Node 18, SQLite, ZATCA e-invoicing)
│   ├── pos/        # React + Vite SPA (touch-friendly POS + admin)
│   └── android/    # Kotlin + Jetpack Compose tablet app
├── packages/
│   ├── shared/     # Shared TS types/DTOs (money, VAT helpers)
│   ├── db/         # Drizzle schema + migrations (better-sqlite3)
│   ├── api-spec/   # OpenAPI spec generated from NestJS
│   ├── client-ts/  # Generated TS API client
│   └── client-kt/  # Generated Kotlin API client
├── packaging/      # Windows 7 deployment scripts
└── dist/           # Build artifacts (package zip)
```

## Packaging (Windows 7)

```sh
pnpm package:win7
# → dist/spicyhome-pos-win7.zip
```

The package supports two deployment layouts:

- **Flat** (unzip and run): extract anywhere, run `start-server.bat`, open
  `http://localhost:3742`. Default logins: admin / 771133 (POS/back-office),
  cashier / 1 (Android tablet). Change the admin PIN immediately.
- **Side-by-side** (production): run `install.bat -InstallDir D:\SpicyHomePOS`.
  Creates `releases\{version}\`, a `current\` junction, an NSSM Windows service,
  and `data\` outside the release tree for persistence across updates. Use
  `update.bat` and `rollback.bat` to manage releases.

See [packaging/README.txt](packaging/README.txt) for full setup instructions,
including the Chrome kiosk desktop shortcut for a dedicated POS terminal.
See [ADR 0003](docs/adr/0003-win7-deploy-update-service.md) for design rationale.

## Observability (Sentry)

SpicyHome POS integrates Sentry for error monitoring, distributed tracing, and
performance profiling across all three platforms: server, SPA, and Android.
Sentry is **opt-in** — if no DSN is configured, the apps run normally without
any telemetry.

### Architecture

| Platform         | SDK                                         | DSN Env Var                           | Init                                           |
| ---------------- | ------------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| Server (NestJS)  | `@sentry/nestjs` + `@sentry/profiling-node` | `SENTRY_DSN`                          | `src/instrument.ts` imported first in main     |
| POS SPA (React)  | `@sentry/react`                             | `VITE_SENTRY_DSN`                     | `src/instrument.ts` imported first in main.tsx |
| Android (Kotlin) | `io.sentry:sentry-android`                  | `local.properties` / env `SENTRY_DSN` | `SpicyHomeApp.onCreate()`                      |

### Configuration

#### Local / Runtime

Copy `.env.example` to `.env.worktree` (gitignored) and fill in real values:

```sh
cp .env.example .env.worktree
# Edit .env.worktree with your Sentry DSNs and other settings
```

Set these environment variables (or uncomment in `.env.worktree`):

```sh
# Server
export SENTRY_DSN="https://..."
export SENTRY_ENVIRONMENT="production"  # or development
export SENTRY_TRACES_SAMPLE_RATE="1.0"
export SENTRY_PROFILES_SAMPLE_RATE="1.0"

# SPA (prefixed with VITE_)
export VITE_SENTRY_DSN="https://..."
export VITE_SENTRY_ENVIRONMENT="production"
```

For Android, the bootstrap script auto-syncs `apps/android/local.properties` from
`SENTRY_ANDROID_DSN` in `.env.worktree` (`bash scripts/worktree/env.sh --force` to
regenerate). Never put the server DSN into Android's config — use the dedicated
Android DSN key:

```properties
SENTRY_DSN=https://...
SENTRY_ENVIRONMENT=production
```

#### CI / GitHub Secrets

The release workflow (`release.yml`) maps the following GitHub secrets to the
build-time environment variables above:

| GitHub Secret                | Maps To             | Purpose                                                                                            |
| ---------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| `secrets.SENTRY_POS_DSN`     | `VITE_SENTRY_DSN`   | SPA Sentry DSN at build time                                                                       |
| `secrets.SENTRY_ANDROID_DSN` | `SENTRY_DSN`        | Android BuildConfig DSN                                                                            |
| `secrets.SENTRY_SERVER_DSN`  | `SENTRY_DSN`        | Baked into `start-server.ps1` (debug path) and `server.env` (NSSM production path) at package time |
| `secrets.SENTRY_AUTH_TOKEN`  | `SENTRY_AUTH_TOKEN` | Source map upload auth token                                                                       |
| `vars.SENTRY_ORG`            | `SENTRY_ORG`        | Sentry org slug for source maps                                                                    |

Release builds bake `SENTRY_SERVER_DSN` into `start-server.ps1` (debug path) **and**
`dist/spicyhome-pos-win7/server.env` (NSSM production path) as defaults.
`spicyhome.ps1` reads `server.env` from the active release, expands `{installDir}`
and `{port}` placeholders, and passes all keys as NSSM `AppEnvironmentExtra`.
If `SENTRY_DSN` (or any other Sentry env var)
is already set at runtime — via NSSM service environment, user-set variables, or
a shell script — the existing value wins. Running `pnpm package:win7` locally
with `SENTRY_DSN` or `SENTRY_SERVER_DSN` set also bakes those values into the
generated script and server.env.

### Free Tier

Sentry's Developer plan includes 5,000 events/month per project — sufficient
for a single-restaurant deployment. Connect three projects (spicyhome-server,
spicyhome-pos, spicyhome-android) under one Sentry organization.

### Source Maps

Source maps can be uploaded to Sentry via the dedicated workflow
(`.github/workflows/sentry-release.yml`), independent of the full product
release. Run it manually from the Actions tab with `workflow_dispatch`.

The workflow also runs **automatically** after a successful product release
(if not a dry run) via `workflow_call`. Source map upload is a **soft-fail**
during the product release — a missing Sentry auth token or Sentry API failure
will not block the product release. Use the dedicated `workflow_dispatch` to
retry if needed.

The workflow:

- Builds the POS SPA (Vite) and server JS (Bazel) with source maps
- Creates Sentry releases for server, POS, and Android
- Uploads server source maps via `sentry-cli`
- SPA source maps are uploaded by `@sentry/vite-plugin` during the Vite build
- Supports `dry_run` mode to validate credentials without mutating Sentry

Source maps are never shipped to end-user machines.

### Health Endpoint

`GET /health` returns `{ "status": "ok", "version": "..." }` (unauthenticated).

### Docs

- [ADR 0001 — Sentry Observability](./docs/adr/0001-sentry-observability.md)

## Key Design

- **Money**: All values in integer halalas (SAR × 100). VAT-inclusive pricing at
  15% (1500 basis points). Round-half-up.
- **Timezone**: Asia/Riyadh (+03:00). Business dates computed in +03:00.
- **Database**: SQLite via better-sqlite3 + Drizzle ORM. Timestamps as Unix epochs.
  Audit fields on every table.
- **Frontend**: Chrome 109+ target, Tailwind v3, dark theme, landscape-first.
- **ZATCA Phase 2**: e-invoicing with ECDSA signing, UBL 2.1 XML, TLV QR codes.

## CI

GitHub Actions: `bazel test //...` (non-Android) + Android job + lint/typecheck.
See `.github/workflows/ci.yml`.

## Docs

- [AGENTS.md](./AGENTS.md) — conventions and constraints
- [PLAN.md](./PLAN.md) — project plan and architecture
- [DB_PLAN.md](./DB_PLAN.md) — database schema details
