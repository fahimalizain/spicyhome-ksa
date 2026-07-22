# AGENTS.md — SpicyHome POS

Codebase conventions and constraints for all contributors and AI agents.

## Build System

- **Bazel + Bzlmod**: all targets under `bazel build //...` and `bazel test //...`.
- **pnpm** manages JS dependencies; `pnpm-lock.yaml` is the source of truth for
  `npm_translate_lock` in MODULE.bazel.
- **Node 18**: server must stay Node 18 compatible (Windows 7 target).
  Host Node version must be >= 18. Node 18 toolchain is pinned in MODULE.bazel
  via `node.toolchain(node_version = "18.20.5")`.
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

- **Asia/Riyadh** (+03:00) for all business logic, reporting, and ZATCA.
- Server runs with `TZ=Asia/Riyadh`.
- Business dates computed in +03:00, stored as `YYYY-MM-DD` in `day_openings`.

## Database

- **SQLite** via `better-sqlite3` + Drizzle ORM.
- All timestamps are **integer Unix epochs**.
- All booleans are **integer 0/1** columns.
- **Audit fields** (`created_by`/`updated_by`, `created_at`/`updated_at`) on
  every table except `order_audit_log` and `settings`.
- `order_audit_log` is **immutable** — a SQLite trigger blocks UPDATE/DELETE.
- Order items **snapshot** item name, price, and VAT rate at order time.

## Frontend (SPA)

- **Chrome 109 cap** (last Chrome for Windows 7). No syntax/APIs newer than
  Chrome 109 without polyfills.
- **Tailwind v3 only** — v4 requires Chrome 111+.
- Touch-friendly, dark theme, large touch targets, landscape-first.

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
