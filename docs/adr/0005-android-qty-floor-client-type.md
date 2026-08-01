# ADR 0005 — Android Qty Floor & Client Type

Date: 2026-08-01
Status: Accepted

## Context

After Send to Kitchen (bulk `PUT .../orders/:orderId/items/sync`), the kitchen
has paper for the server lines. Qty-down prints nothing (by design) — reducing a
kitchen-known quantity from the floor is unsafe because the kitchen will cook
what was printed, not what the tablet later stages locally.

The device split is explicit in this product: the Android tablet is for order
item management only; the cashier (POS SPA) handles reductions of already-sent
quantity, payments, refunds, and voids. The tablet therefore needs a qty floor
per cart line once that line exists on the server, and the server must enforce
the same rule for Android sessions so a stale or malicious tablet payload cannot
decrease or remove server lines.

To enforce this server-side we need a reliable device identity on every
authenticated request. Today the JWT carries only `sub`, `username`, `roleId`,
`exp` — there is no way to distinguish an Android session from a POS session.
The product has no production users yet, so making `clientType` a **required**
login field is a safe, breaking change.

Reference issue: https://github.com/fahimalizain/spicyhome-ksa/issues/112

## Decision

### Floor rule (Android UI + server when `clientType === 'android'`)

| Line state                        |            −             | remove | + / notes |
| --------------------------------- | :----------------------: | :----: | :-------: |
| New local (`orderItemId == null`) |           Yes            |  Yes   |    Yes    |
| Synced, `localQty > serverQty`    | Yes, down to `serverQty` |   No   |    Yes    |
| Synced, `localQty <= serverQty`   |            No            |   No   |    Yes    |

- The floor is the **current server/DB line qty** (the last successful
  snapshot), **NOT** `printedQty`. `printedQty` is an audit-derived figure
  inside `order_events`; the DB line qty is the authoritative server state that
  the next sync compares against.
- Unsent local increases on a synced line may be rolled back down to the server
  qty (never below).
- Remove of any line with `orderItemId != null` is blocked on Android.
- POS keeps full decrease/remove power for cart mutations — unchanged.

### Auth / clientType

- `LoginDto.clientType` is **required**: enum `'android' | 'pos'`
  (`IsIn` / `IsEnum` validation; missing value → 400).
- JWT payload gains `clientType` alongside `sub`, `username`, `roleId`, `exp`.
- No default and no omit — both clients always send it (no production users
  yet, so there is no legacy token population to worry about).
- When `clientType === 'android'` and `users.android_login === 0` → **401** with
  the same generic message as bad credentials (`Invalid credentials`) to avoid
  user enumeration.
- POS login ignores `android_login` (POS users are not filtered by it).

### Server enforcement

- Only on `PUT /orders/:orderId/items/sync` (the bulk cart sync used by both
  Send to Kitchen and Android cart staging).
- If JWT `clientType === 'android'`: before applying any mutation, reject the
  **entire** sync (400, no partial apply) when either:
  - any existing DB line is missing from the payload (i.e. a remove), or
  - any payload line carrying an `orderItemId` has `qty < db.qty`.
- Message: `Kitchen items can only be reduced at the cashier.`
- If `clientType === 'pos'` (or missing on weird legacy tokens — login always
  sets it): no floor.
- Comparison happens against the **current DB qty inside the transaction**
  (after the concurrency check, before deletes/updates), so the floor reflects
  the exact state the mutation would modify.
- Android may set qty **equal** to the server qty (no-op or notes-only change).

### Android UX

- Disable the − control when `localQty <= serverFloorQty` (no snackbar-on-tap;
  the control is simply greyed out / not clickable).
- Disable/hide delete when `orderItemId != null`.
- Notes remain editable on locked lines (when the user has update permission).
- Optional static caption explaining the floor is **not required** for v1
  (skipped unless trivial).

### Out of scope

- POS cart behavior change.
- Kitchen void chits (voiding what the kitchen printed).
- New permissions (the `update_order` permission still gates sync).
- App attestation / device integrity (a forged POS token could still bypass the
  floor — accepted for v1).

## Consequences

- **Login API breaking change** (new required field) — all server tests, POS
  login, Android login, OpenAPI spec, and generated clients (client-ts,
  client-kt) must be updated in the same change.
- **JWT shape change** — the AuthGuard already attaches the full verified
  payload to `request.user`, so `clientType` is available to controllers without
  extra lookups.
- Docs in `docs/order-lifecycle.md` need a device-split note: the Android
  tablet may add items, increase qty, and edit notes, but may **not** decrease
  qty or remove lines that already exist on the server (cashier-only); new
  never-synced local lines remain fully editable until Send to Kitchen.
