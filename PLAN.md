# SpicyHome POS — Plan

POS system for SpicyHome Restaurant (KSA). Bazel monorepo with three apps:
NestJS backend (server on Windows 7 Pro), touch-friendly POS SPA, and a native
Android tablet app. SQLite + Drizzle ORM, network thermal printing (ESC/POS),
ZATCA Phase 2 e-invoicing. Everything in English.

## Monorepo layout (Bazelisk + Bzlmod)

```
spicyhome-ksa/
├── MODULE.bazel              # Bzlmod: rules_js, aspect_rules_ts, rules_kotlin, rules_android
├── .bazelrc / .bazelversion
├── package.json + pnpm-workspace.yaml   # JS deps via pnpm, linked into Bazel
├── apps/
│   ├── server/     # NestJS backend (Node 18)
│   ├── pos/        # React + Vite SPA (touch-friendly POS + admin UI)
│   └── android/    # Kotlin + Jetpack Compose tablet app
└── packages/
    ├── shared/     # Shared TS types/DTOs (order, item, category, printer)
    ├── db/         # Drizzle schema + migrations (SQLite via better-sqlite3)
    ├── api-spec/   # OpenAPI spec generated from the NestJS app
    ├── client-ts/  # Generated TypeScript API client (consumed by apps/pos)
    └── client-kt/  # Generated Kotlin API client (consumed by apps/android)
```

## 1. Bazel workspace

- `.bazelversion` pinned, Bzlmod in `MODULE.bazel`
- `rules_js` + `aspect_rules_ts` for server & SPA (pnpm lockfile as source of truth)
- `rules_kotlin` + `rules_android` for the tablet app (requires Android SDK on the
  build machine; build APK via `bazel build //apps/android:app`)
- Targets: `bazel run //apps/server:dev`, `bazel run //apps/pos:dev`,
  `bazel build //apps/android:spicyhome.apk`

## 2. Server — `apps/server` (NestJS, Node 18, better-sqlite3 + Drizzle)

Full schema: see [DB_PLAN.md](./DB_PLAN.md).

- **Modules**: Auth, Menu (Items, Categories, modifiers,
  prices incl. 15% VAT), Orders (dine-in/takeaway, table mapping, order
  lifecycle), Printers (register printers: name, IP, role kitchen/receipt),
  Invoicing/ZATCA, Business Day (day open/close), Reports, Settings
- **Timezone**: Asia/Riyadh enforced everywhere — server runs with
  `TZ=Asia/Riyadh` (Node 18 full-icu, independent of the Win7 system clock's
  tz data), business dates computed in +03:00, ZATCA timestamps emitted with
  the `+03:00` offset. Deployment doc notes NTP sync for the Win7 box.
- **Reports** (module: `reports`): X-report (open day snapshot), Z-report
  (frozen on the `day_openings` row at close), daily sales over a range,
  per-user sales, per-category sales, VAT summary. Printable via the receipt
  printer.
- **Business day**: `DayService` guards order creation — no orders unless a
  day is open; closing computes and freezes totals on `day_openings`.
- **Auth**: simple username + 4–6 digit PIN login (bcrypt-hashed PINs). A JWT
  (short-lived) is issued on login and required by all endpoints and the
  WebSocket gateway. Permissions come from `user_roles` boolean columns,
  enforced by a NestJS guard per endpoint.
- **Audit fields**: every DB entity carries `created_by` / `updated_by`
  (user id) plus `created_at` / `updated_at`; populated automatically by a
  Drizzle-level helper / NestJS interceptor from the authenticated user.
- **Order audit log**: an immutable, append-only `order_audit_log` table —
  every action on an order (created, item added/removed, sent to kitchen,
  paid, printed, voided, refunded) is recorded with user id, timestamp, and a
  JSON payload of the change. Rows are never updated or deleted; each row
  stores a hash of the previous row for tamper evidence.
- **Printing**: ESC/POS over TCP:9100 (`escpos` + `escpos-network`) — a NestJS
  `PrinterService` routes order items to kitchen printers and receipts to the
  receipt printer. All print commands are issued by the server.
- **ZATCA Phase 2 (Fatoora)**: `ZatcaModule` — CSID onboarding (OTP → compliance
  CSID → production CSID), UBL 2.1 simplified invoice XML generation, ECDSA
  (secp256k1) signing, invoice hash chaining, TLV QR on receipts; built on
  `node-zatca`, with ZATCA's fatoora SDK CLI invoked as a subprocess where needed
- **API**: REST for CRUD + WebSocket gateway for live order updates to
  tablets/POS
- **OpenAPI**: `@nestjs/swagger` decorators on all controllers/DTOs; a
  `bazel run //apps/server:openapi` target boots the app and writes
  `openapi.json` to `packages/api-spec`
- **Windows 7 delivery**: bundle app + portable Node 18 (`node.exe` alongside
  dist, platform check bypassed), started via `start-server.bat` / NSSM service;
  SQLite file stored in a `data/` dir

## 3. Generated API clients (from the NestJS OpenAPI spec)

- `packages/api-spec` — `openapi.json` produced from the running NestJS
  definition; a Bazel target regenerates it and fails CI if the committed spec
  drifts from the decorators
- `packages/client-ts` — TypeScript client generated from `openapi.json`
  (openapi-generator `typescript-fetch`), consumed by the SPA via a
  workspace/Bazel dependency
- `packages/client-kt` — Kotlin client generated from `openapi.json`
  (openapi-generator `kotlin`), consumed by the Android app via rules_kotlin
- Both generated as Bazel build targets (`//packages/client-ts:client`,
  `//packages/client-kt:client`) so the SPA and Android app always build against
  the current server API

## 4. POS SPA — `apps/pos` (React + Vite + TS + Tailwind v3)

- **Target browser: Chrome 109** (last version supported on Windows 7).
  Tailwind **v3** only — v4 output requires Chrome 111+ (`@property`,
  `color-mix()`, cascade layers). Vite `build.target` set accordingly; no
  syntax/APIs newer than Chrome 109 without polyfills.
- Large touch targets, landscape-first layout, dark theme
- Screens: Login (PIN pad), Order screen (category tabs, item grid, cart),
  Order queue, Admin (Items, Categories, Printers config), ZATCA device status
- All server calls go through `packages/client-ts`; live order updates via
  WebSocket
- Served as static assets by NestJS in production so only one port is needed

## 5. Android app — `apps/android` (Kotlin + Compose)

- Server discovery (manual IP/QR config), PIN login
- Order-taking UI mirroring the SPA; server calls via `packages/client-kt`,
  live status via WebSocket
- Built to APK with Bazel

## Build order

1. [x] Bazel workspace + pnpm scaffolding, shared types package
2. [x] Drizzle schema (users, menu, orders, order_audit_log with audit fields) +
       NestJS skeleton (auth, menu, orders) with dev run target
3. [x] OpenAPI spec generation target + TS/Kotlin client generation wired in Bazel
4. [x] POS SPA (order flow first, admin screens second)
5. [x] Printer module + ESC/POS
6. [x] ZATCA Phase 2 module
7. [x] Android app
8. [x] Windows 7 packaging script (`packaging/build-package.sh` → `dist/spicyhome-pos-win7.zip`)
9. [x] CI (GitHub Actions: `.github/workflows/ci.yml`) + lint config (ESLint flat config, Prettier, tsc --noEmit)

Every step above includes its tests before the step is considered done
(see Testing section).

## Remaining TODOs

- **Playwright e2e**: end-to-end tests for core flows (login → create order →
  send → pay). Run against Chromium 109 for Win7 parity.
- **Real-printer testing**: ESC/POS printing tested with mock TCP transport only.
  Test against actual thermal printers on the target hardware.
- **ZATCA sandbox certification**: Production CSID onboarding and compliance
  testing against ZATCA's fatoora sandbox environment.
- **Modifiers**: Item modifiers (size, extras, toppings) — schema is ready but
  the UI and API endpoints are not yet implemented.
- **Payments table**: Currently payments are tracked via order status
  (`paid_at`). A dedicated `payments` table (with payment method, amount,
  reference) is planned for v1.
- **Windows 7 smoke test**: Test the packaged zip on real Windows 7 hardware
  with Chrome 109.

## Testing (mandatory)

Tests are **super mandatory for everything** — no module ships without them.

- **Server (NestJS)**: Jest. Unit tests for every service/guard/interceptor;
  integration tests per module with a real SQLite file (drizzle migrations
  applied to a temp DB). ZATCA signing, VAT/halalas rounding, audit-log hash
  chaining and order state transitions get 100% coverage — these are
  money-critical paths.
- **Packages**: `packages/db` schema/migration tests; `packages/shared` type
  helper tests; generated clients get smoke tests against a mock server.
- **POS SPA**: Vitest + React Testing Library for components and hooks;
  Playwright e2e for the core flows (login → create order → send → pay →
  print stub).
- **Android**: JUnit unit tests for view models/repositories; instrumented
  UI tests for the order flow (run locally, not in CI).
- **Bazel**: every test is a `*_test` target; `bazel test //...` must pass.
  CI runs `bazel test //...` on every commit.
- **Rule of thumb**: a PR that adds/changes logic without tests does not merge.

## CI (GitHub Actions)

Implemented in `.github/workflows/ci.yml`:

- **`test`** — `bazel test` for 6 non-Android targets (server, pos, 4 packages).
  Uses `TZ=Asia/Riyadh`. Cache: `~/.cache/bazel` + pnpm store.
- **`android`** — `bazel test //apps/android:unit_tests` with `--action_env`
  flags for ANDROID_HOME + JAVA_HOME. Separate cache key. Uses Gradle wrapper.
  `setup-java@v4` with temurin 21.
- **`lint`** — ESLint (`pnpm lint`), Prettier check (`pnpm format`),
  `tsc --noEmit` across all TS packages (`pnpm typecheck`).
- **Concurrency**: cancel-in-progress for same ref.

Not yet implemented:

- **Playwright e2e** — will run against Chromium 109 (Win7 parity).
- **ktlint** — Kotlin linting for Android sources.

All jobs required to pass before merge.

## Notes / risks

- Node 18 is untested on Windows 7 — smoke-test early and keep dependencies
  Win7-safe (better-sqlite3 prebuilt binary, no native modules requiring newer
  Win APIs)
- POS SPA must render on Chrome 109 (last Win7 Chrome): Tailwind v3 pinned,
  conservative Vite build target, Playwright e2e runs against Chromium 109
- Android builds need the Android SDK locally; everything else builds from a
  clean checkout with just Bazelisk
- ZATCA compliance requires their fatoora SDK (Java CLI) at onboarding time —
  treated as a tool dependency, not a runtime service
