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

## CI & Linting

All PRs must pass CI (`.github/workflows/ci.yml`) before merge.

- **`bazel test //...`** (6 non-Android targets) — run on every push/PR to master.
- **Android** (APK build + unit tests) runs in a separate job — requires
  `ANDROID_HOME` and `JAVA_HOME` passed via `--action_env` flags.
- **Lint**: ESLint (flat config) + Prettier check + `tsc --noEmit` across all
  TS packages. Run locally:
  ```sh
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
