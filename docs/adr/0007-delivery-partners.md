# ADR 0007 — Delivery Partners (Catalog, Order Linking, On-Account Settlement)

Date: 2026-08-01
Status: Accepted

## Context

SpicyHome's customers increasingly take orders through delivery apps —
HungerStation and Keeta in particular. Two operational realities follow:

1. **The apps sell at a higher menu price** than the POS catalog (the apps
   take a commission, so restaurants inflate app menu prices). Staff today
   manually adjust line prices at order time, or the order is simply taken at
   the wrong price.
2. **Settlement is on account.** The restaurant does not receive cash or card
   at the till for a delivery-app order; the app settles in a batch (usually
   daily). Payment methods were designed for tender at the till (ADR 0002) and
   do not express "this order is settled on account with HungerStation".

The POS therefore needs a way to: hold a **catalog of delivery partners**;
**link an order to a partner** (plus the app's order number for
reconciliation); **override line prices** per delivery order (app menu prices,
floored at the POS catalog price); and **pay the order through a partner-owned
payment method** so the Z-report buckets on-account sales correctly — all
without skipping the normal payment validation.

This ADR locks the v1 design. It is POS-only: per the device-responsibilities
rule, the Android tablet remains order-item management only and is untouched
by this feature.

## Decision

> **Money convention**: all monetary values are integer halalas (SAR × 100),
> VAT-inclusive. Never use floats for money calculations. Rounding is
> round-half-up (JavaScript `Math.round` default). VAT rates are stored in
> basis points (e.g. 1500 = 15%).

### Domain model

**A delivery partner is NOT a third order type.** `orders.type` stays
`'dine_in' | 'takeaway'` (ADR 0004 enum unchanged). A delivery-app order is a
`takeaway` order that additionally carries a partner reference:

| Layer    | Name               |
| -------- | ------------------ |
| Domain   | Delivery Partner   |
| Table    | `delivery_partners`|
| API path | `/delivery-partners` |
| UI label | Delivery Partners  |

- New nullable column `orders.delivery_partner_id` → FK to
  `delivery_partners.id`.
- New nullable column `orders.delivery_external_ref` (TEXT) — the app's order
  number for reconciliation (e.g. HungerStation order ID).
- **A partner is only valid when `type === 'takeaway'`.** A walk-in customer
  collecting an order, or the internal delivery boy, is simply `takeaway`
  with `delivery_partner_id = NULL`.
- **POS-only by product decision, not by enforcement**: the server accepts
  partner fields from any authenticated client with `update_order`; the
  Android app has no UI for it and is unchanged (same pattern as ADR 0004).

### Schema: `delivery_partners` (catalog)

```sql
CREATE TABLE delivery_partners (
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

Schema changes on `orders`:

```sql
ALTER TABLE orders ADD COLUMN delivery_partner_id TEXT
  REFERENCES delivery_partners(id);
ALTER TABLE orders ADD COLUMN delivery_external_ref TEXT;

CREATE INDEX idx_orders_delivery_partner ON orders (delivery_partner_id);
```

#### Slug rules

Identical to payment methods (ADR 0002):

- **Primary key is `TEXT`**, the canonical identity. Slug generated from title
  on create: lowercase, non-alphanumeric → hyphen, collapse multiple hyphens,
  trim leading/trailing hyphens.
- Empty slug after transformation → 400. Duplicate slug → 409.
- **Slug is immutable after insert** — PATCH rejects attempts to change `id`.

#### Soft-disable only

- `enabled = 0` hides the partner from order creation UI and prevents new
  orders from selecting it.
- **No DELETE endpoint.** Partners are only soft-disabled. This preserves
  referential integrity for historical `orders.delivery_partner_id` rows and
  the auto-created payment method (which itself has no DELETE, ADR 0002).

### Payment method 1:1 coupling

Each delivery partner owns exactly one `payment_methods` row. This is what
makes on-account settlement flow through the existing pay machinery
(ADR 0002/0006) — and, critically, bucket into existing payment reports.

#### Auto-creation

`POST /delivery-partners` **atomically creates** the partner row **and** a
`payment_methods` row:

| `payment_methods` column       | Value                                     |
| ------------------------------ | ----------------------------------------- |
| `id`                           | **Same slug** as the partner `id`         |
| `title`                        | Same as partner `title`                   |
| `zatca_payment_means_code`     | `'30'` (Credit / On Account)              |
| `enabled`                      | Mirrors partner `enabled` (1 on create)   |
| `sort_order`                   | `0` (adjustable independently, see below) |

```sql
INSERT INTO payment_methods
  (id, title, zatca_payment_means_code, enabled, sort_order,
   created_at, updated_at, created_by, updated_by)
VALUES
  (:slug, :title, '30', 1, 0, :now, :now, :userId, :userId);
```

The two rows are written in **one transaction**. If either insert fails, both
are rolled back.

#### Mirroring

`PATCH /delivery-partners/:id` propagates to the owned method in the same
transaction:

| Partner change       | Payment method effect                        |
| -------------------- | -------------------------------------------- |
| `title` changed      | `title` updated to the same value            |
| `enabled` 1 → 0      | `enabled` set to 0 (method hidden from all pay modals) |
| `enabled` 0 → 1      | `enabled` set to 1                           |
| `sort_order` changed | **Not** mirrored (see below)                 |

- The owned method's `sort_order` is the **one deliberately divergent field**:
  it places the method in the pay modal and may be tuned independently via
  `PATCH /payment-methods/:id`.
- The partner's own `sort_order` orders the partner list in the order page /
  admin UI.

#### Locking partner-owned methods

Partner-owned methods must not be independently edited in ways that break the
1:1:

- `PATCH /payment-methods/:id` where `id` is a delivery-partner slug and the
  body changes `title` or `enabled` → **403** with a message explaining the
  method is managed via Delivery Partners (same lock pattern as the `cash`
  method, ADR 0002).
- `sort_order` on a partner-owned method **remains adjustable** (it is the
  allowed divergent field).
- The server derives `isDeliveryPartner: true` on all payment-method list
  responses (`GET /payment-methods`, `GET /payment-methods/enabled`) by
  checking membership in `delivery_partners`. No new endpoint and no new
  permission are needed; the POS uses the flag to filter the pay modal (see
  Pay rules). The column is **not** stored on `payment_methods` — it is a
  derived view over `delivery_partners`.

#### Shared slug namespace

Because the partner slug and the method slug are the same string, the two
catalogs share one slug namespace:

- `POST /delivery-partners` whose generated slug already exists in
  `payment_methods` (or `delivery_partners`) → 409.
- `POST /payment-methods` whose generated slug already exists in
  `delivery_partners` → 409 (in addition to the existing duplicate-slug check).

### Pay rules when an order has a delivery partner

- **Only that partner's payment method is allowed and visible** in the pay
  modal (`methodId === order.deliveryPartnerId`). All other methods are
  hidden. Attempting any other method against a partner order → 400.
- **Partner orders still pay through the normal payment flow** — append
  `order_payments` lines via `POST /orders/:id/payments` and finalize via
  `POST /orders/:id/submit` (ADR 0006). **There is no skip-payment path**: a
  partner order cannot reach `paid` without at least one payment line on the
  partner's method, and all ADR 0006 submit preconditions (exact balance,
  net-per-method ≥ 0, etc.) apply unchanged.
- **Non-cash semantics**: the partner method is `zatca_payment_means_code
  '30'` (Credit / On Account) — no `tenderedHalalas` / `changeHalalas`, no
  cash-drawer kick (drawer kick already fires only on positive cash lines,
  ADR 0002/0006). The order is still submitted with `PaymentMeans` = the
  partner method id.
- **Partner is null** (walk-in takeaway, dine-in): partner-owned methods are
  hidden; the normal methods only. A partner-owned method can never be
  selected for an order that does not carry that partner.

#### Disabling a partner that has open orders

Disabling a partner (`enabled` 1 → 0) that any **open** order references →
**409** with the count of affected open orders. Rationale: a partner order
must stay payable through its own method, and ADR 0002 forbids selecting a
disabled method. (Paid/refunded historical orders are unaffected — the method
snapshot and report bucketing do not depend on the method staying enabled.)

### Rate (price) overrides

v1 has **no partner price catalog** (no default price lists, no % markup).
Instead: **per-line unit price override** on open orders that have a partner
set.

- The override writes `order_items.unit_price_halalas` — an existing snapshot
  column (the line's VAT-inclusive unit price) — and recomputes the line
  total (`unit_price_halalas × qty`) and the order totals via the existing
  totals-recompute path (VAT-inclusive decomposition, round-trip error
  ≤ 1 halala). `discount_halalas` is untouched in v1.
- **Floor**: the overridden unit price must be ≥ the **live catalog**
  `items.price_halalas` at edit time (read fresh inside the transaction).
  Below-floor → 400. The floor applies to the item's current catalog price
  even if the item is inactive; an order line with `item_id = NULL` (catalog
  item deleted) **cannot be overridden** in v1 — 400.
- **UI**: an explicit **"Edit partner prices"** button on the order page opens
  a modal listing the order lines (name, current unit price, new unit price,
  floor). It is **not auto-opened** and it is **not a pay gate** — a partner
  order can be paid without ever overriding a price.
- **Selecting or changing a partner does NOT auto-rewrite existing line
  prices.** Overrides are strictly manual, per line. Items added to a partner
  order later enter at the live catalog price (there is no price catalog to
  apply); their line can then be overridden manually.

### Partner set / clear / change (open orders only)

New endpoint `PATCH /orders/:id/partner`, body:

```json
{
  "baseUpdatedAt": 1785600000,
  "deliveryPartnerId": "hungerstation",
  "deliveryExternalRef": "HS-883129"
}
```

`deliveryPartnerId` is `null` to clear; `deliveryExternalRef` is optional and
may be sent on its own (editing the ref does not require changing the
partner). Server rules:

| Scenario                          | Behavior                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Status gate                       | `orders.status === 'open'` only; paid/voided/refunded → 400.                                 |
| Set partner                       | Type must be `takeaway`; `dine_in` → 400 with guidance ("set order type to takeaway first"). Partner must exist and be enabled; unknown/disabled → 400. **Does not touch line prices.** |
| Change partner (HS → Keeta)       | Partner id swapped; **line prices untouched**; `deliveryExternalRef` may be sent in the same call or edited separately. |
| Clear partner (stay takeaway)     | `deliveryPartnerId = null` ⇒ **reset every line's `unit_price_halalas` to the live catalog** (`items.price_halalas`) and recompute totals. `deliveryExternalRef` is force-nulled. |
| Ref with null partner             | If `deliveryPartnerId` is null, any `deliveryExternalRef` in the body is **ignored / force-nulled** (a ref has no meaning without a partner). |
| Concurrency                       | `baseUpdatedAt` must equal `orders.updated_at`; stale → 409 with the standard conflict shape `{ message, updatedAt }` (ADR 0004 pattern). |
| Permission                        | Reuses `update_order`. No new permission.                                                    |
| Response                          | Full order with items and events, same shape as `GET /orders/:id`.                           |

#### takeaway → dine_in now clears partner and resets prices (extends ADR 0004)

`PATCH /orders/:id` (ADR 0004) with `type: 'dine_in'` additionally, in the
same transaction:

1. Clears `delivery_partner_id` and `delivery_external_ref`.
2. **Resets every line's `unit_price_halalas` to the live catalog** and
   recomputes totals (a dine-in order is always at menu prices).
3. Writes the partner/price-reset audit events below, alongside the existing
   `type_changed` event (whose payload shape is unchanged).

`dine_in → takeaway` does **not** auto-set a partner — the order becomes
`takeaway` with `delivery_partner_id = NULL` (walk-in / internal delivery);
staff set a partner explicitly if needed. No price changes on that direction
(any prior partner was already cleared and prices reset at dine-in time).

For order lines whose `item_id` is `NULL` during a reset: keep the current
`unit_price_halalas` (there is no catalog price to reset to) and do not write
a reset event for them.

### Audit (`order_events`)

Three new `AuditAction` values in `packages/shared/src/enums.ts`:

| Event type                  | Written by                                              | Payload |
| --------------------------- | ------------------------------------------------------- | ------- |
| `delivery_partner_changed`  | partner set / clear / change / ref-only edit, and the partner-clear half of takeaway → dine_in | `{ fromPartnerId, toPartnerId, fromPartnerTitle, toPartnerTitle, fromExternalRef, toExternalRef, resetItemCount }` |
| `item_price_overridden`     | `PATCH /orders/:id/items/:itemId/unit-price`            | `{ orderItemId, itemId, fromUnitPriceHalalas, toUnitPriceHalalas, floorPriceHalalas }` |
| `item_price_reset`          | clear-partner, and the price-reset half of takeaway → dine_in (one event per line) | `{ orderItemId, itemId, fromUnitPriceHalalas, toUnitPriceHalalas, reason: 'partner_cleared' \| 'type_changed_to_dine_in' }` |

The existing `type_changed` payload (`{ fromType, toType, fromTableId,
toTableId }`) is **unchanged**; the partner-clear and price resets that
accompany a takeaway → dine_in change are recorded as their own events, so the
ledger tells the full story without altering ADR 0004's contract.

### Endpoint summary

#### Catalog CRUD — `/delivery-partners`

| Method   | Path                    | Auth              | Description                                              |
| -------- | ----------------------- | ----------------- | -------------------------------------------------------- |
| `GET`    | `/delivery-partners`    | `manage_settings` | List all (incl. disabled), `sort_order ASC, title ASC`   |
| `POST`   | `/delivery-partners`    | `manage_settings` | Create `{ title }` → slug; auto-creates the linked payment method (atomic) |
| `PATCH`  | `/delivery-partners/:id`| `manage_settings` | Update `title` / `enabled` / `sort_order`; mirrors `title`/`enabled` to the method |
| `DELETE` | —                       | —                 | Not offered (soft-disable only)                          |

Create body is `{ "title": "HungerStation" }` (like ADR 0002); `enabled` and
`sort_order` default to 1 / 0 and are adjustable via PATCH.

#### Order changes

| Method  | Path                                    | Auth          | Description                                                        |
| ------- | --------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `PATCH` | `/orders/:id/partner`                   | `update_order`| Set/clear/change partner + external ref (open order, takeaway rules)|
| `PATCH` | `/orders/:id/items/:itemId/unit-price`  | `update_order`| Per-line partner price override (`{ baseUpdatedAt, unitPriceHalalas }`; order must be `open` **and** have a partner set; floor = live catalog) |
| `PATCH` | `/orders/:id` (existing, ADR 0004)      | `update_order`| `takeaway → dine_in` now also clears partner/ref and resets line prices |

`OrderResponse` (full order detail) embeds `deliveryPartnerId`,
`deliveryPartnerTitle`, and `deliveryExternalRef`; open-orders list/summary
endpoints include `deliveryPartnerId` + `deliveryPartnerTitle` when set (the
orders list and kitchen views need the partner label). Android consumers
simply ignore the fields.

### Receipt / kitchen / reports

- **Customer receipt**: print partner `title` and `deliveryExternalRef` (when
  set) on the receipt.
- **Kitchen ticket**: print partner `title` (and the ref where useful).
- **Z-report**: **no by-partner section in v1**. Partner sales already bucket
  through `order_payments` because the payment method id equals the partner
  slug — the existing per-method `paymentTotals` aggregation (ADR 0002/0006)
  shows HungerStation/Keeta totals under their method ids at no extra cost.
  Expected cash is unaffected (the partner method is non-cash).
- Day close keeps blocking while any `open` orders exist (existing rule).

### POS UI sketch

- **Admin page** `/admin/delivery-partners` (permission `manage_settings`):
  list with title, slug, enabled toggle, sort order, edit; "Add Delivery
  Partner" create form (title → slug preview); edit via PATCH. Mirrors the
  Payment Methods admin page.
- **Order page**: for `takeaway` orders, a partner selector (chips/dropdown
  of enabled partners + "None") and an external-ref field; for `dine_in`
  orders the selector is hidden (partner requires takeaway). Changing the
  type to takeaway in the type/table modal leaves the partner null.
- **"Edit partner prices"** button (visible when a partner is set) opens the
  price-override modal: per-line current price, floor indicator, new price
  input; save via the per-line PATCH.
- **Pay modal**: when the order has a partner, only that partner's method is
  rendered; otherwise partner-owned methods (flagged `isDeliveryPartner`) are
  filtered out. No tendered/change fields for the partner method.

### Android

**No changes to the Android app.** No delivery-partner UI, no API surface
added to the tablet app, no knowledge of the feature required. The generated
`client-kt` may gain DTO types when the OpenAPI spec is regenerated, but
nothing in the Android UI consumes them (device-responsibilities rule:
tablets are order-item management only).

## Consequences

### Positive

- **App-menu pricing without drift.** Staff apply HungerStation/Keeta menu
  prices per line with a hard floor at the POS catalog price — no more manual
  arithmetic and no accidental below-cost lines.
- **On-account settlement is first-class.** Partner orders pay through the
  normal payments/submit flow (ADR 0006) on a `zatca_payment_means_code '30'`
  method — ZATCA semantics are correct (Credit / On Account), and no
  skip-payment loophole exists.
- **Reports work for free.** Partner sales appear under the partner's method
  id in the existing `paymentTotals` aggregation; no by-partner report code
  needed in v1.
- **No new order type, no new permissions, no Android changes.** The type
  enum, the permission model (`update_order`, `manage_settings`), and the
  device-responsibilities rule are all untouched.
- **Ledger integrity preserved.** Partner set/change/clear and every price
  mutation write immutable `order_events` rows; price overrides live in the
  existing `unit_price_halalas` snapshot so historical orders stay stable.
- **Reconciliation data.** `delivery_external_ref` on the order and the
  receipt gives staff the app order number for settlement disputes.

### Negative

- **1:1 coupling adds invariants.** Partner and payment-method rows must
  change atomically; the shared slug namespace and the PATCH lock on
  partner-owned methods add validation surface. The `isDeliveryPartner`
  derivation must stay in sync on both list endpoints.
- **Behavioral change to ADR 0004.** `takeaway → dine_in` now silently clears
  partner/ref and resets line prices — a side effect implementers must not
  forget, and a potential surprise if a partner order is converted to dine-in
  (prices revert to catalog).
- **Price floor is a product constraint, not a schema one.** The floor is
  enforced in application code at edit time; nothing prevents historical
  below-floor prices from existing if the catalog price is later raised.
- **Extra POS surface.** Partner selector, external-ref field, price-override
  modal, pay-modal filtering — more Chrome 109-safe, touch-friendly UI to
  build and test.
- **Open-order disable guard.** A partner with open orders cannot be disabled
  until those orders are paid/voided; staff may be confused why the toggle
  fails (mitigated by the 409 message).

### Neutral / Mitigations

- The disable guard and the mirroring rules are testable as pure
  transaction-level invariants (like ADR 0002's cash lock).
- Overrides remain snapshots: later catalog price edits do not rewrite open
  order lines, keeping behavior predictable.
- `docs/order-lifecycle.md` must be updated for the two new order endpoints,
  the new event types, and the extended takeaway → dine_in behavior — a
  required follow-up in the implementation slice (as ADR 0006 already requires
  for its own changes).

## Rejected alternatives

### Third order type (`delivery`)
**Rejected.** A third type would leak into every type switch site, occupancy
logic, kitchen routing, and the Android type UI for zero modeling gain — a
delivery-app order is semantically a takeaway order that is settled on
account. The nullable partner FK keeps the type enum and all existing
takeaway behaviors intact.

### Partner price catalog / % markup in v1
**Rejected.** Default price lists and markup rules are real but not required
for the first deployment; per-line manual override with a catalog floor is
the minimal correct mechanism. A catalog can be layered on later without
schema churn (it would only change how `unit_price_halalas` is populated).

### Skip-payment shortcut for partner orders
**Rejected.** Auto-marking partner orders paid without `order_payments` rows
would break the payment ledger, ZATCA `PaymentMeans`, and the Z-report
bucketing. Partner orders use the normal payment flow with a restricted
method set.

### Store `is_delivery_partner` on `payment_methods`
**Rejected.** The ownership relation is derivable from `delivery_partners`
and storing it creates a second source of truth that can drift during the
mirroring transaction. The derived flag is always consistent.

### Hard delete of partners
**Rejected.** Deleting would orphan `orders.delivery_partner_id` rows and the
owned payment method (which itself cannot be deleted, ADR 0002). Soft-disable
preserves referential integrity and history.

### By-partner Z-report section in v1
**Rejected.** Partner methods already bucket via `order_payments`; a separate
report section duplicates that aggregation and is easy to add later if
operators ask for it.

### Android support
**Rejected.** Device-responsibilities rule is unchanged: tablets are order-item
management only. No partner UI, no new tablet endpoints.

## Non-goals (explicit, later phases)

- **Android UI** for delivery partners (device-responsibilities rule
  unchanged).
- **Partner default price lists / % markup** — v1 is per-line manual override
  only.
- **One-tap pay shortcut** for partner orders — partner orders pay through the
  normal payments/submit flow.
- **Delivery API integrations** with HungerStation / Keeta (no webhooks, no
  order import, no settlement files) — v1 records the app order number as
  free text (`delivery_external_ref`).
- **Hard delete of partners** — soft-disable only.
- **Discount interplay** — `orders.discount_halalas` is untouched by price
  overrides and resets in v1.

## References

- **ADR 0002** — Payment methods: slug TEXT PK and slug rules, soft-disable,
  `manage_settings` permission, cash-lock pattern (reused for partner-owned
  method locking), `zatca_payment_means_code`, per-method report aggregation.
- **ADR 0004** — Open order type/table change: `PATCH /orders/:id`,
  `baseUpdatedAt` stale guard / 409 conflict shape, `type_changed` event,
  "POS-only by product decision, not by enforcement" precedent. This ADR
  extends the `takeaway → dine_in` path with partner clear + price reset.
- **ADR 0006** — Payment before food: `POST /orders/:id/payments` +
  `POST /orders/:id/submit`, append-only `order_payments`, submit
  preconditions (exact balance, net-per-method ≥ 0), drawer-kick rule. The
  partner pay rules build directly on it.
- **AGENTS.md** — money/VAT conventions (integer halalas, VAT-inclusive,
  round-half-up), timezone/Asia-Riyadh business rules, device
  responsibilities (POS vs Android), audit-field conventions.
