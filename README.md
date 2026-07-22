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

Unzip on target Windows PC, run `start-server.bat`, open http://localhost:3000.
Default login: admin / 1234. Change PIN immediately.

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
