# AGENTS.md — SpicyHome POS

Codebase conventions and constraints for all contributors and AI agents.

## Build System

- **Bazel + Bzlmod**: all targets under `bazel build //...` and `bazel test //...`.
- **pnpm** manages JS dependencies; `pnpm-lock.yaml` is the source of truth for
  `npm_translate_lock` in MODULE.bazel.
- **Node 18**: server must stay Node 18 compatible (Windows 7 target).
  Host Node version must be >= 18. Node 18 toolchain is pinned in MODULE.bazel
  via `node.toolchain(node_version = "18.20.4")`.
- To add/update npm deps: edit `package.json`, run `pnpm install`, commit the
  updated `pnpm-lock.yaml`.

## Testing

- **Tests are mandatory** for every module. `bazel test //...` must pass.
- Jest (`jest_test` via `aspect_rules_jest`) for all TS packages.
- Migration/schema tests must run against a real SQLite file (`:memory:` or temp).
- Money/VAT helpers must have thorough tests — these are money-critical paths.

## Money / VAT

- **All monetary values are integer halalas** (SAR × 100). Never use floats for
  money calculations.
- **VAT-inclusive** pricing (KSA restaurant norm). VAT rate stored in basis
  points (e.g. 1500 = 15%).
- **Rounding**: round-half-up (JavaScript `Math.round` default). All values
  are positive, so ties round up (e.g. 0.5 → 1).
- `decomposeVat()` decomposes a VAT-inclusive price into excl. price + VAT
  amount. Round-trip error ≤ 1 halala.

## Timezone

- **Asia/Riyadh** (+03:00) for all business logic, reporting, and ZATCA
  wall-clock issue times.
- Server runs with `TZ=Asia/Riyadh`.
- Business dates computed in +03:00, stored as `YYYY-MM-DD` in `day_openings`.

### Service day / Business day (ADR 0008)

One day concept everywhere: JWT expiry, day open/close, order creation,
`daily_order_seq`, and the orders list filter all use the same service-day
window and label. (Calendar-day helpers such as `todayInRiyadh` are retired
in favor of the service-day helpers.)

- **Service day** window: `[D 05:00, (D+1) 05:00)` Asia/Riyadh (half-open).
  The label `D` (`YYYY-MM-DD`) is the **start** date of the window.
  Times before 05:00 belong to the **previous** service day.
- **Business day** (`day_openings`): the cash open/close session for that
  service-day label. On open, `business_date = getServiceDayString(now)`.
  `createOrder` requires an open day whose `business_date` matches the
  current service day — a stale open day after 05:00 rejects new orders
  (409) until staff close and reopen. **No auto-close** at 05:00; existing
  `open` orders stay editable and payable after 05:00.
- **Orders list `?date=YYYY-MM-DD`**: a service-day window on
  `orders.created_at` via `getServiceDayBoundsUnix` (bounds
  `[D 05:00, (D+1) 05:00)` Asia/Riyadh); the client default "today" is
  `getServiceDayString(now)`.
- **`daily_order_seq`**: resets on the service-day label.
- **JWT `exp`**: access tokens expire at the **next** 05:00 Asia/Riyadh
  service-day boundary. On login, `exp` is set to the Unix seconds of the
  upcoming 05:00. At exactly 05:00:00 the boundary is tomorrow 05:00.
- **ZATCA `IssueDate`/`IssueTime`**: wall-clock Asia/Riyadh at sign time —
  **not** the service-day label. After midnight the ops bag (service-day
  labeled) and the tax document clock may disagree; intentional and accepted.
- Helpers in `packages/shared/src/service-day.ts`:
  `getServiceDayString(nowMs)`, `getNextServiceDayBoundaryUnix(nowMs)`,
  `getServiceDayBoundsUnix(dateStr)`. They use an explicit UTC+3 offset and
  do **not** depend on `process.env.TZ`.
- Android Kotlin twin:
  `apps/android/app/src/main/java/com/spicyhome/pos/util/ServiceDay.kt`
  (may be added in a later slice).

## Database

- **SQLite** via `better-sqlite3` + Drizzle ORM.
- All timestamps are **integer Unix epochs**.
- All booleans are **integer 0/1** columns.
- **Audit fields** (`created_by`/`updated_by`, `created_at`/`updated_at`) on
  every table except `order_events` and `settings`.
- `order_events` is **immutable** — a SQLite trigger blocks UPDATE/DELETE. It is the
  single append-only ledger for all order events: item mutations, kitchen prints,
  status transitions, and reprints.
- Order items **snapshot** item name, price, and VAT rate at order time.
- **Schema & migrations**: load **`db-migrate`** skill for any schema work.
  Key commands:
  ```sh
  pnpm --filter @spicyhome/db -- db:generate --name <snake_case>
  pnpm --filter @spicyhome/db -- db:migrate
  ```

## Device Responsibilities

- **POS SPA (Windows 7)**: Full control — create orders, manage items, make
  payments, issue refunds, void orders, reprint receipts, open/close
  business days, manage menu/tables/printers/users/settings. Kitchen prints
  happen automatically as items are added or quantities increased.
- **Android Tablet**: Order item management only — create orders, add/update/remove
  items. **No payments, no refunds, no void, no reprints, no
  administrative functions.** The Android app must not expose payment, refund,
  or admin endpoints in its UI.

## Frontend (SPA)

- **Chrome 109 cap** (last Chrome for Windows 7). No syntax/APIs newer than
  Chrome 109 without polyfills.
- **Tailwind v3 only** — v4 requires Chrome 111+.
- Touch-friendly, dark theme, large touch targets, landscape-first.

## Parallel worktrees

- Worktree **creation** is external (user's worktree manager). Agents only
  **bootstrap** an existing checkout: skill **bootstrap-worktree** or
  `bash scripts/worktree/bootstrap.sh`.
- Per-checkout `.env.worktree` (gitignored): `PORT`, `VITE_PORT`, `SPICYHOME_DB`.
- Main worktree keeps `3742` / `6124` / `data/spicyhome.db`. Linked worktrees
  get a stable hash offset and `data/spicyhome-<slug>.db`.
- Host bootstrap needs **Node 24** (`.nvmrc`); then `pnpm install`.
- VS Code: **Debug Server + POS** compound reads `envFile` `.env.worktree`.
- **Sentry inheritance**: linked worktrees inherit Sentry DSNs (not auth tokens)
  from the main worktree's `.env.worktree`. All local worktrees use
  `development` as the Sentry environment (not the worktree slug).
  `apps/android/local.properties` is auto-synced from `SENTRY_ANDROID_DSN`.

## Commits

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, etc.
- No commit hooks force this at the git level (add ESLint/lefthook in CI).

## Language

- All code, comments, docs, and commit messages in **English**.
- No non-English identifiers or comments.

## Windows 7 Delivery

- Bundle with portable Node 18. `start-server.bat` / NSSM service.
- SQLite data in `data/` directory. `data/` is gitignored.
- Test on real Windows 7 hardware early.

## CI & Linting

All PRs must pass CI (`.github/workflows/ci.yml`) before merge.

- **Tests**: `pnpm test` runs `bazel test //...` (all 7 targets: server, pos,
  shared, db, client-ts, client-kt, android unit_tests). Same command as
  pre-push. CI splits non-Android and Android into two jobs; both must pass.
  Android needs `ANDROID_HOME` / `JAVA_HOME`; `pnpm ensure-android-env`
  (pre-push) fails fast if either is missing or invalid.
- **Lint**: ESLint (flat config) + Prettier check + `tsc --noEmit` across all
  TS packages. Run locally:
  ```sh
  pnpm test          # bazel test //... (full suite, matches pre-push)
  pnpm lint          # ESLint
  pnpm format        # Prettier check
  pnpm format:fix    # Prettier write
  pnpm typecheck     # tsc --noEmit in all packages
  pnpm check         # lint + format + typecheck
  ```
- **Playwright e2e**: planned, not yet implemented (see PLAN.md).
- Concurrency is cancel-in-progress for same ref.
- Bazel disk cache at `~/.cache/bazel`, pnpm store cache — cached per-runner
  via `actions/cache`.

## Versioning & Releases

- **Date-based versioning**: releases use `YYYYMM.DD.N` where `YYYYMM.DD` is the
  release date in Asia/Riyadh and `.N` is the same-day increment
  (starting at `.0`). Examples: `202607.23.0`, `202607.23.1`.
- **`VERSION`** at the repository root is the single source of truth.
- `scripts/bump-version.sh` updates `VERSION`, `MODULE.bazel`, and all workspace
  `package.json` files to a new version. Run `scripts/bump-version.sh date` for
  an auto bump or `scripts/bump-version.sh 202607.23.1` for an explicit version.
  Use `--dry --today YYYYMMDD` to preview without writing files.
- **Releases** are created manually via the `Release SpicyHome POS` GitHub
  Actions workflow (`.github/workflows/release.yml`). It bumps the version,
  runs tests, builds the Windows 7 package and the Android APK, commits and tags
  the version bump, and creates a GitHub release with both
  `spicyhome-pos-win7-vYYYYMM.DD.N.zip` and
  `spicyhome-pos-android-vYYYYMM.DD.N.apk`.

## Packaging

```sh
pnpm package:win7   # runs packaging/build-package.sh
```

Produces `dist/spicyhome-pos-win7.zip` — portable Node.js v18.20.4 (win-x64) +
compiled server JS + SPA dist + startup scripts. The generated server
`package.json` uses the version from the `VERSION` file.

## Android distribution signing

Production Android APKs are signed with a stable distribution keystore so
side-load upgrades install in place. The release workflow requires the
`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` /
`ANDROID_KEY_PASSWORD` GitHub secrets and fails without them. Keystore, versionCode
formula, migration: `docs/android/apk-signing.md`. Never commit keystores or
passwords; generate with `scripts/android/generate-distribution-keystore.sh`.
