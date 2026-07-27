# ADR 0002 — Payment Methods

Date: 2026-07-27
Status: Accepted

## Context

SpicyHome POS currently has no concept of payment methods. `POST /orders/:id/pay`
sets the order to `paid` and always kicks the cash drawer. There is no way to
record that a customer paid by card, mada, or split between multiple tenders. The
business day Z-report treats 100% of sales as cash, which produces an incorrect
expected-cash figure whenever card payments are accepted. This is a common
restaurant requirement tracked as **GitHub Issue #34**.

We need first-class payment methods: an admin-configurable catalog, split-tender
support at pay time, an immutable payment ledger, and per-method aggregation in
reports. The feature is POS-only — Android devices continue to have no payment
capability per the existing device-responsibilities rule.

Because this is a fresh product before any real-world deployment (migration era
#1), we do not need backward compatibility for historical paid orders. Orders
paid before this feature ships will have no `order_payments` rows, and that is
acceptable.

## Decision

> **Money convention**: all monetary values are integer halalas (SAR × 100),
> VAT-inclusive. Never use floats for money calculations. Rounding is
> round-half-up (JavaScript `Math.round` default).

### Domain naming

| Layer    | Name               |
| -------- | ------------------ |
| Domain   | Payment Method     |
| Table    | `payment_methods`  |
| Table    | `order_payments`   |
| API path | `/payment-methods` |
| UI label | Payment Methods    |

### Schema: `payment_methods` (catalog)

```sql
CREATE TABLE payment_methods (
  id         TEXT PRIMARY KEY,           -- slug (kebab-case), immutable
  title      TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1, -- 0/1, soft-disable only
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,           -- Unix epoch
  updated_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id)
);
```

#### Slug rules

- **Primary key is `TEXT`**, not an integer. The slug is the canonical identity.
- Slug is generated from title on create: lowercase, non-alphanumeric →
  hyphen, collapse multiple hyphens, trim leading/trailing hyphens.
- Empty slug after transformation → rejected (400).
- Duplicate slug → rejected (409).
- **Slug is immutable after insert.** Update endpoint must reject attempts to
  change `id`.

#### Title & locking

- Title is editable via PATCH `/payment-methods/:id`, except for the `cash`
  payment method (see below).
- `cash` is fully locked: title cannot be renamed, `enabled` cannot be set
  to 0. **Fully locked means `title` + `enabled` only** — `sort_order` remains
  adjustable so Cash can be ordered freely in the pay modal. API must reject
  any attempt to disable or rename cash.

#### Soft-disable only

- `enabled = 0` means the method does not appear in the pay modal and cannot
  be selected for new payments.
- There is **no DELETE endpoint**. Methods are only soft-disabled. This
  preserves referential integrity for historical `order_payments` rows.

#### Cash semantics ("is this cash?")

- **No `is_cash` boolean column.** The business rule "this is a cash payment"
  is derived from `payment_methods.id === 'cash'`. There is exactly one cash
  method, it is locked, and its slug never changes. All cash logic in the
  codebase uses `method.id === 'cash'` as the test.

#### Seed data

On migration, insert three payment methods (all enabled by default):

| id     | title | enabled | sort_order |
| ------ | ----- | ------- | ---------- |
| `cash` | Cash  | 1       | 0          |
| `card` | Card  | 1       | 1          |
| `mada` | mada  | 1       | 2          |

### Schema: `order_payments` (immutable ledger lines)

```sql
CREATE TABLE order_payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES orders(id),
  method_id       TEXT NOT NULL REFERENCES payment_methods(id),
  method_title    TEXT NOT NULL,          -- snapshot at pay time
  amount_halalas  INTEGER NOT NULL,      -- applied portion of order total (VAT-inclusive)
  tendered_halalas INTEGER,              -- only for cash; what customer handed over
  change_halalas  INTEGER,               -- only for cash; auto = tendered - amount
  created_at      INTEGER NOT NULL,
  created_by      INTEGER REFERENCES users(id),

  UNIQUE(order_id, method_id)            -- at most one row per method per order
);
```

#### Design rules

- **Integer PK `id`** (autoincrement), consistent with `order_items`,
  `order_refunds`, and other transactional tables.
- `method_title` snapshots the `payment_methods.title` at pay time so that
  historical records are stable even if the method is later renamed.
- `amount_halalas` is the **applied** portion of the order total for this
  method. It is VAT-inclusive integer halalas (per the money convention).
- `tendered_halalas` and `change_halalas` are **only for cash**. For non-cash
  methods they are `NULL`. `change_halalas` is always server-computed:
  `tendered_halalas - amount_halalas`.
- **No `updated_at` / `updated_by`** — this table is insert-only immutable.
  (Fits the same pattern as `order_events`: an append-only ledger.)
- **No `reference` column** in v1 (e.g. card terminal reference / RRN).
- `UNIQUE(order_id, method_id)` enforces at most one payment line per method
  per order. Split across two card payments is not a supported workflow.

### Pay API changes

`POST /orders/:id/pay` gains a **required** `payments` non-empty array in the
request body. The existing no-body call (single tender, implicit cash) is **not**
supported after this feature — the pay endpoint always requires explicit
payment lines. An empty `payments` array or missing `payments` key must be
rejected (400).

#### Request body

```json
{
  "payments": [
    { "methodId": "card", "amountHalalas": 5000 },
    { "methodId": "cash", "amountHalalas": 3250, "tenderedHalalas": 10000 }
  ]
}
```

#### Validation (all in a single DB transaction)

1. **Order must be `open`.** Any other status → 400.

2. **Each `methodId` must exist in `payment_methods` and be enabled.**
   Unknown method → 400. Disabled method → 400.

3. **Each `amountHalalas` must be a positive integer** (> 0). Zero-amount
   entries are rejected (they are effectively no-ops and should be omitted by
   the client).

4. **Sum of all `amountHalalas` must equal `order.totalHalalas` exactly.**
   Over-pay or under-pay → 400. The Pay button enables only when outstanding
   is zero, so this is a server-side safety check.

5. **At most one entry per `methodId`.** Duplicate → 400.

6. **Non-cash methods (`methodId !== 'cash'`):**
   - `tenderedHalalas` must be absent/`null`.
   - `changeHalalas` must not be sent (server-computed).

7. **Cash method (`methodId === 'cash'`):**
   - If `tenderedHalalas` is present, it must be ≥ `amountHalalas`.
   - `changeHalalas` = `tenderedHalalas - amountHalalas` (server-computed and
     verified). Client may send it for verification; server computes and
     compares.
   - If `tenderedHalalas` is omitted, treat as `tendered = amount`,
     `change = 0` (exact cash).

#### Transaction boundary

The following operations happen in **one SQLite transaction**:

1. Validate all payment lines.
2. Insert `order_payments` rows.
3. Update `orders.status` to `paid`.
4. Write `order_events` entry of type `paid` with extended payload:

```json
{
  "fromStatus": "open",
  "toStatus": "paid",
  "payments": [
    { "methodId": "card", "methodTitle": "Card", "amountHalalas": 5000 },
    {
      "methodId": "cash",
      "methodTitle": "Cash",
      "amountHalalas": 3250,
      "tenderedHalalas": 10000,
      "changeHalalas": 6750
    }
  ]
}
```

5. Write `receipt_print_enqueued` event with `kickDrawer` set to `true`
   only if a cash payment line exists with `amountHalalas > 0`.

After the transaction commits: print receipt asynchronously (existing
`runReceiptPrint` pattern). Emit `order.paid` WebSocket event.

#### Cash drawer kick

- `kickDrawer: true` **only** if any payment line has `methodId === 'cash'`
  AND `amountHalalas > 0`.
- Previously, every pay always kicked the drawer. Now: card-only payment →
  no drawer kick.

#### Permission

- Endpoint permission remains `pay_order` (no new permission).

### Catalog CRUD API

Base path: `/payment-methods`

| Method   | Path                       | Auth              | Description                       |
| -------- | -------------------------- | ----------------- | --------------------------------- |
| `GET`    | `/payment-methods`         | `manage_settings` | List all (inc. disabled)          |
| `GET`    | `/payment-methods/enabled` | authenticated     | List enabled only (for pay modal) |
| `POST`   | `/payment-methods`         | `manage_settings` | Create (title → slug)             |
| `PATCH`  | `/payment-methods/:id`     | `manage_settings` | Update title, enabled, sort_order |
| `DELETE` | —                          | —                 | Not offered (soft-disable only)   |

> **Auth note for `/payment-methods/enabled`**: This endpoint requires a valid
> JWT (global auth guard) but has no `@RequiresPermission` decorator — the same
> pattern used by other POS list endpoints. Cashiers with `pay_order` need it to
> render the pay modal. Android must not call these endpoints for payment UX even
> if authenticated (device-responsibilities rule: tablets have no payment
> capability).

#### Permission rationale

Payment method management is an administrative configuration task. It reuses
the existing `manage_settings` permission rather than introducing a new
role column. This is consistent with the theme that "settings" encompasses
business configuration (printers, tables, payment methods).

The `/enabled` sub-route deliberately has no `@RequiresPermission` decorator
— it only requires a valid JWT (global auth guard). This allows cashiers
with `pay_order` (who do not have `manage_settings`) to fetch the enabled
method list for the pay modal. Android clients must not call any payment
methods endpoints for payment UX per the device-responsibilities rule.

#### Create rules

- Body: `{ "title": "SADAD" }`
- Server generates slug as described above.
- Returns the created `payment_methods` row.
- Rejects duplicates (409) or empty slugs (400).

#### Update rules

- Allowed fields: `title`, `enabled`, `sort_order`.
- `id` (slug) is immutable — reject any attempt to change it.
- For `id === 'cash'`: reject changes to `title` and `enabled`
  (403 Forbidden with message explaining the lock). `sort_order` is
  changeable.

#### List response

Both list endpoints return payment methods ordered by `sort_order ASC`,
then `title ASC`.

### POS UX

#### Admin page: Payment Methods management

- Located under `/admin` (alongside other settings pages).
- Table/list of all payment methods with columns: title, slug, enabled
  toggle, sort order, edit button.
- Cash row shows lock icons on title/enabled cells; toggle is disabled.
- "Add Payment Method" button opens a create form (title input → slug
  preview → save).
- Edit opens an inline form or modal; save calls PATCH.

#### Order page: Pay modal

Current flow: Pay button immediately pays the order.

New flow: Pay button opens a **modal** (not immediate pay). Within the modal:

1. **Order summary**: total halalas displayed prominently.

2. **Outstanding indicator**: `outstanding = order.totalHalalas - sum of
entered payment amounts`. Pay button is disabled while outstanding > 0.

3. **Payment method list**: rendered from `GET /payment-methods/enabled`.
   Large touch-friendly buttons (Chrome 109 safe, dark theme), one per
   enabled method.

4. **Tap-to-fill**: tapping a payment method auto-fills the **remaining
   outstanding** into that method's amount field. This is the fast path for
   single-tender payments.

5. **Numpad**: on-screen touch numpad for editing the selected method's
   amount. The selected method is highlighted. Editing an amount rebalances
   outstanding.

6. **Cash row**: has an additional "Tendered" field below the amount. When
   the user enters a tendered value greater than the applied amount, the
   "Change due" field auto-populates with the difference. The applied amount
   is capped at outstanding.

7. **Pay button**: enabled only when outstanding === 0. Submits `POST
/orders/:id/pay` with non-zero payment lines only (zero-amount methods
   are stripped before sending).

### Reports & day close

#### Where `paymentTotals` lives today

`paymentTotals` is currently hardcoded in **`ReportsService`**
(`apps/server/src/modules/reports/reports.service.ts`) inside
`XReport.paymentTotals: { cash: number }` — it treats 100% of sales as cash.
This is the primary location that must be updated. The Z-report builder
(`z-report-builder.ts`) computes expected cash as `openingCashHalalas +
totalSalesHalalas`; this must change to `openingCashHalalas + SUM(cash
payment amounts)`.

`BusinessDayService` surfaces cash figures on day-open/day-close responses
only if those responses carry a `paymentTotals` field — it is not the sole
owner of the computation.

#### Z-report / close day

`BusinessDayService.closeDay()` today sums `orders.totalHalalas` for all
paid orders. For the `paymentTotals` breakdown, both `closeDay()` and
`getCurrentDay()` (X-report) must aggregate `order_payments` joined to paid
orders for the business day:

```sql
SELECT op.method_id, SUM(op.amount_halalas) as total
FROM order_payments op
JOIN orders o ON o.id = op.order_id
WHERE o.day_opening_id = ? AND o.status = 'paid'
GROUP BY op.method_id
```

- **GROUP BY `method_id` only** — do not include `method_title`. If a method
  is renamed between payments, grouping by `(method_id, method_title)` would
  split the total across different snapshots of the title, producing
  duplicate rows for the same method. Use the current catalog title for
  display; the snapshot title remains available on individual
  `order_payments` rows for audit.
- The result is a dynamic map / array of `{ methodId, methodTitle, totalHalalas }`.
- The response shape for `closeDay` and `getCurrentDay` is extended to include
  a `paymentTotals` array (not a hardcoded `cash` key).

#### Expected cash

- `expectedCash = openingCashHalalas + SUM(amount_halalas WHERE method_id = 'cash')`.
- **Refunds are not subtracted in v1** (refund methods are out of scope; see
  Open follow-ups). Document this as a known bias: expected cash overstates
  the true cash-in-drawer when refunds have been issued in cash.

#### X-report (live)

- `ReportsService.getCurrentDay()` (X-report) adds a `paymentTotals`
  breakdown using the same aggregation query.

### Seed migration

A new migration creates both tables and seeds the three default payment
methods. It runs unconditionally as part of the next migration version.

### Android

No changes to the Android app. The tablet cannot call the pay endpoint, and
the payment methods CRUD endpoints are gated by `manage_settings` (which
Android never uses). The generated `client-kt` may gain type definitions for
payment method DTOs, but the Android UI must not expose any payment method
management or tender screens.

## Implementation plan

### Phase 1 — Schema & seed (DB package)

1. Add `payment_methods` and `order_payments` table definitions to
   `packages/db/src/schema.ts` with Drizzle `sqliteTable` definitions.
2. Write migration SQL: `CREATE TABLE payment_methods (...)`,
   `CREATE TABLE order_payments (...)`, seed `INSERT` for cash/card/mada.
3. Add Drizzle relation types if needed for query ergonomics.
4. Update `packages/db/src/schema.test.ts`: add tests for new tables,
   FK constraints, and seed data correctness.
5. Update `packages/db/src/seed.ts`: idempotent seed of default payment
   methods (cash, card, mada) following the same pattern as other catalog
   seed entries.

### Phase 2 — Server: catalog CRUD

6. Create `PaymentMethodsModule`, `PaymentMethodsService`,
   `PaymentMethodsController` under `apps/server/src/modules/payment-methods/`.
7. Implement slug generation, cash lock validation, soft-disable logic.
8. Add `RequiresPermission('manage_settings')` guard.
9. Write unit + e2e tests (CRUD with cash lock enforcement, slug
   immutability, duplicate rejection).

### Phase 3 — Server: pay endpoint

10. Extend `POST /orders/:id/pay` body validation (DTO with `payments`
    array).
11. Implement validation pipeline: method existence/enabled, amount sum,
    cash-specific tendered/change rules.
12. Refactor `OrdersService.payOrder()` to accept payment lines and write
    to `order_payments`.
13. Update `order_events` paid payload to include payment breakdown.
14. Conditionally set `kickDrawer` based on cash presence.
15. Update unit + e2e tests for pay with split tender, card-only, cash-only.

### Phase 4 — API spec & generated clients

16. Regenerate OpenAPI spec from server controllers
    (`packages/api-spec`).
17. Regenerate `packages/client-ts` (TypeScript HTTP client).
18. Regenerate `packages/client-kt` (Kotlin HTTP client, types only —
    Android does not call payment-methods or pay endpoints).

### Phase 5 — Server: reports & day close

19. Update `ReportsService` (primary owner of `paymentTotals`) to compute
    per-method totals from `order_payments` instead of hardcoding
    `{ cash: totalSalesHalalas }`.
20. Update `BusinessDayService.closeDay()` and `getCurrentDay()` to return
    `paymentTotals` aggregated from `order_payments`.
21. Update the Z-report builder (`z-report-builder.ts`) to compute
    `expectedCash = openingCashHalalas + SUM(cash payment amounts)` instead
    of `openingCashHalalas + totalSalesHalalas`.
22. Update relevant tests.

### Phase 6 — POS SPA (admin)

23. Add `/admin/payment-methods` page: list, create, edit, toggle.
24. Wire to `GET` / `POST` / `PATCH` `/payment-methods`.

### Phase 7 — POS SPA (pay modal)

25. Replace immediate-pay button with pay modal component.
26. Implement payment method list, tap-to-fill, numpad, cash tendered/change
    fields, outstanding tracking.
27. Wire submit to the new pay request body format.
28. Zero-amount methods stripped before submit.
29. Write POS unit tests for pay modal: outstanding calculation,
    tap-to-fill auto-fills remaining balance, Pay button disabled until
    outstanding === 0, cash tendered/change auto-computation, zero-amount
    methods stripped before submit.

### Phase 8 — Docs

30. Update `docs/order-lifecycle.md`: pay endpoint payload, payment tables,
    new `order_events` paid payload shape, drawer kick condition.
31. Update `PLAN.md` / `DB_PLAN.md`: new tables, new module, report changes.

### Acceptance criteria (condensed from Issue #34)

- [ ] Cash, Card, and mada payment methods seeded on migration.
- [ ] Admin can create, rename, reorder, and disable payment methods.
- [ ] Cash is locked (cannot be disabled or renamed); sort_order is adjustable.
- [ ] `POST /orders/:id/pay` requires explicit `payments` array; single implicit
      cash tender is no longer supported.
- [ ] Validation rejects: missing/empty `payments`, unknown/disabled methods,
      non-positive amounts, sum ≠ order total, duplicate method, non-cash
      tendered, cash tendered < amount.
- [ ] Pay modal shows enabled methods, outstanding indicator, tap-to-fill, and
      numpad; Pay button is disabled while outstanding > 0.
- [ ] `kickDrawer` is `true` only when a cash payment line has `amountHalalas > 0`.
- [ ] Cash drawer does not open on card-only payments.
- [ ] Z-report expected cash = opening + cash payments (not total sales).
- [ ] X-report and close-day responses include per-method `paymentTotals` array.
- [ ] Android has no payment method UI or pay capability (types in `client-kt`
      are generated but unused).
- [ ] All `bazel test //...` targets pass.

### File touch points (from Issue #34)

| File / path                                                    | Change                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/db/src/schema.ts`                                    | Add `payment_methods`, `order_payments`                              |
| `packages/db/src/schema.test.ts`                               | Tests for new tables, FK constraints, seed data                      |
| `packages/db/src/seed.ts`                                      | Idempotent seed of cash/card/mada                                    |
| `packages/db/drizzle/*.sql`                                    | New migration                                                        |
| `apps/server/src/modules/payment-methods/`                     | New module: service, controller, DTOs, tests                         |
| `apps/server/src/modules/orders/orders.service.ts`             | Extend `payOrder()`                                                  |
| `apps/server/src/modules/orders/dto/`                          | New pay DTO with required `payments[]`                               |
| `apps/server/src/modules/reports/reports.service.ts`           | Primary: `paymentTotals` per-method aggregation (was hardcoded cash) |
| `apps/server/src/modules/reports/z-report-builder.ts`          | Expected cash from cash payments, not total sales                    |
| `apps/server/src/modules/business-day/business-day.service.ts` | Surface `paymentTotals` on day open/close responses                  |
| `packages/api-spec/`                                           | Regenerated OpenAPI spec                                             |
| `packages/shared/src/`                                         | New DTOs / types for payment methods                                 |
| `packages/client-ts/`                                          | Regenerated                                                          |
| `packages/client-kt/`                                          | Regenerated (types only)                                             |
| `apps/pos/src/pages/admin/`                                    | New Payment Methods admin page                                       |
| `apps/pos/src/components/orders/`                              | Pay modal, numpad, payment method list                               |
| `apps/pos/src/__tests__/`                                      | Pay modal unit tests (outstanding, tap-to-fill, Pay disabled)        |
| `docs/order-lifecycle.md`                                      | Update pay flow, payment tables, event payload                       |

## Consequences

### Positive

- **Real cash accounting.** Expected cash in Z-reports reflects actual cash
  payments, not total sales. Restaurant operators can reconcile the cash
  drawer accurately.
- **Flexible payment catalog.** Administrators can add new payment methods
  (e.g. SADAD, STC Pay, Apple Pay) without code changes.
- **Split-tender UX.** Customers paying with card + cash is a common KSA
  restaurant scenario; the pay modal handles it cleanly.
- **Immutable payment ledger.** `order_payments` is append-only and
  snapshots method titles, providing a reliable audit trail even if methods
  are later renamed or disabled.
- **Backward-compatible day close.** The day-opening table already has the
  columns needed; only the computation changes.
- **Drawer kick accuracy.** The cash drawer only opens when cash is actually
  involved. Card-only payments leave the drawer closed.
- **No new permission.** Reuses `manage_settings`, keeping the permission
  model simple.

### Negative

- **Schema change is permanent.** Two new tables with FK constraints.
  Migration is one-way (no rollback for fresh product, which is acceptable).
- **Pay endpoint breaking change.** The existing `POST /orders/:id/pay` with
  no body is removed. This is fine because we are in migration era #1 with
  no existing deployments.
- **Historical paid orders have no payment rows.** Reports for closed days
  before this feature will show zero payment totals. Acceptable — this is a
  fresh product.
- **POS SPA gains complexity.** The pay modal with numpad and payment
  selection is more complex UI than the current one-tap pay. Must stay
  Chrome 109 compatible and touch-friendly.
- **Expected cash bias.** When cash refunds exist, expected cash overstates
  the true drawer amount because refunds are not subtracted. This is a
  known limitation documented for v1.

### Neutral / Mitigations

- The pay modal can be tested thoroughly in isolation (numpad, amount
  validation, edge cases).
- The `order_events` `paid` payload extension is additive — existing
  verification logic (hash chain, event_idx) is unchanged.
- The `client-kt` regeneration adds types but no runtime behavior changes on
  Android.

## Rejected alternatives

### Hardcoded enum only (no catalog table)

**Rejected.** Restaurants need to configure their own payment methods (e.g.
regional processors, loyalty points, vouchers). A hardcoded enum would
require code changes for every new method. The catalog table gives operators
self-service control.

### Integer PK for `payment_methods`

**Rejected.** A text slug as PK (`id TEXT`) makes the domain more readable:
`methodId: "cash"` is self-documenting in JSON payloads and database rows.
It also eliminates a join for the "is this cash?" test — the code just
compares `id === 'cash'`. Integer IDs would require either a lookup or a
separate `is_cash` flag, which we explicitly rejected.

### `is_cash` boolean flag

**Rejected.** Adds redundancy and risk of inconsistency (what if `is_cash =
1` on a method whose slug is not `cash`?). The convention `id === 'cash'`
is simpler, has a single source of truth, and the cash method is locked so
it cannot be confused.

### Hard delete of payment methods

**Rejected.** Deleting a payment method would orphan historical
`order_payments` rows and break FK constraints. Soft-disable preserves
referential integrity and audit history.

### Backfill historical paid orders with synthetic payment rows

**Rejected.** This is a fresh product (migration era #1). There are no
production deployments with historical data. Backfill code adds complexity
with zero business value.

### Refund payment methods in v1

**Rejected.** Refund tender selection (e.g. refunding to card vs. cash) is a
separate problem with its own UX and accounting implications. It is deferred
to a follow-up issue. The current refund flow (select items, issue refund,
print receipt) is unchanged.

### Store `amount_halalas` = tendered, with change computed by subtraction

**Rejected.** The domain concept is "applied amount" — how much of the order
total this method covered. Tendered/change is a cash-only concept unrelated
to card payments. Storing tendered as the primary amount for all methods
would conflate two different ideas.

### Always kick the cash drawer on pay

**Rejected.** Card-only payments should not open the cash drawer. This
reduces wear on the drawer solenoid and prevents unnecessary drawer access.

### New `manage_payment_methods` permission

**Rejected.** Payment method configuration is administrative settings work,
similar to managing printers and tables. Adding a new permission column
would be disproportionate for a configuration CRUD that the same admin
persona would use.

### Android tablet payment support

**Rejected.** The device-responsibilities rule is clear: Android tablets are
for order item management only. All payment, refund, void, and admin
operations happen on the POS SPA. This ADR does not change that rule.

## Out of scope

### Explicitly deferred (v2+)

| Item                       | Rationale                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Refund tender/method       | Refunds currently have no payment method linkage. Selecting "refund to card" vs. "refund to cash" is future work.                |
| Reference / RRN column     | Card terminal reference numbers (RRN, approval code) are not captured in v1.                                                     |
| Partial pay leaving open   | The v1 pay endpoint transitions to `paid` immediately. Partial payment (e.g. deposit) while order stays `open` is not supported. |
| Tips / gratuity            | Tip line in payment modal and tip settlement in reports is deferred.                                                             |
| Terminal integration       | Direct integration with bank card terminals (e.g. Lane/3000, POS terminals) is future work.                                      |
| Payment method icons       | Icons for payment methods in the pay modal are deferred (v1 uses text-only buttons).                                             |
| Expected cash with refunds | Subtracting cash refunds from expected cash. v1 has a known bias (overstated expected cash).                                     |

## Open follow-ups

1. **Refund payment methods** — When a cash refund is issued, update
   expected cash. When a card refund is issued, record the reversal method.
   This needs a schema extension (likely a `payment_method_id` FK on
   `order_refunds` or a separate `refund_payments` table).

2. **Reference / RRN** — Add a `reference` TEXT column to `order_payments`
   for storing terminal transaction IDs, approval codes, or acquirer
   references.

3. **Terminal integration** — When a bank terminal is connected, the pay
   flow may need to wait for terminal approval before writing
   `order_payments`. This may require an intermediate "pending" state for
   payment lines.

4. **Partial payment** — Supporting deposits or split-bill scenarios where
   the order stays `open` after a partial payment. This would require a
   concept of "open balance" distinct from order status.

5. **Tip line** — A `tip_halalas` column on `order_payments` for card tips,
   with tip settlement in the Z-report.

6. **Payment method reporting across date ranges** — The `listDays` API may
   benefit from a `paymentTotals` summary per day.
