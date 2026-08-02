# ADR 0006 — Payment Before Food (Split Payment from Submit, Explicit Kitchen)

Date: 2026-08-01
Status: Accepted

## Context

Operationally, payments happen **before** food is served: a waiter stages the
ticket (on the tablet or the POS), the cashier takes the money — possibly split
across methods, possibly over-tendered — and only after payment is confirmed
should the kitchen cook and the order be finalized.

Today the API cannot express that. `POST /orders/:id/pay` is atomic:
writing `order_payments` rows, the `open → paid` transition, the ZATCA
invoice, and the receipt print all happen in one transaction. Any payment
therefore finalizes the order immediately:

1. **Finalize-at-pay.** Because `pay` is atomic with the `paid` transition, a
   single payment line locks the order: no further item edits, invoice exists,
   receipt printed. Payment (take money now) and finalization (invoice + close
   the order) are conceptually different moments that the API cannot separate.
2. **Auto-kitchen.** Kitchen prints fire automatically on every item mutation
   (`item_added` / `item_updated` qty increase). A waiter building a ticket on
   the Android tablet hits the kitchen on every intermediate edit, and the
   kitchen cooks before the cashier has confirmed the order. When the
   cashier's job is to take payment _before_ food, this is unwanted output.

The change is to decouple three things that today move together: **recording
payments**, **finalizing the order** (invoice + receipt + `paid`), and
**notifying the kitchen**. Order lifecycle states stay unchanged; what changes
is what an `open` order may contain and how it leaves `open`.

Blast radius for the implementation (later slices): `apps/pos`,
`apps/server`, `packages/db`, `packages/client-ts`. The Android app UI is
unchanged — the server simply stops auto-kitchen-printing on item mutations.

## Decision

**Lifecycle states are unchanged** (`open` | `paid` | `voided` | `refunded`),
but an `open` order may now hold `order_payments` rows. Payment and
finalization are decoupled: appending a payment line never changes status, and
**Submit is the only path `open → paid`**.

| Action                 | Effect                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Add payment            | Append an immutable `order_payments` row. Status stays `open`. No invoice, no receipt. |
| Submit                 | **Only** path `open → paid`. ZATCA invoice + receipt + drawer kick.                    |
| Send to Kitchen        | Explicit **differential** kitchen print only. Orthogonal to Submit.                    |
| Save Items / syncItems | Persist the cart; **never** kitchen-prints.                                            |

`POST /orders/:id/pay` is **removed entirely** (no alias, no deprecation
period — see "Defaults locked in grilling").

### API

| Endpoint                                 | Role                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `POST /orders/:id/payments`              | Append **one** payment line (POS; `pay_order`)                        |
| `POST /orders/:id/submit`                | Finalize: ZATCA invoice + receipt + `paid` (POS; `pay_order`)         |
| `POST /orders/:id/send-to-kitchen`       | Kitchen deltas only (POS; `update_order` — see permission note below) |
| `PUT /orders/:id/items/sync` (syncItems) | Persist items, **no** kitchen print                                   |
| ~~`POST /orders/:id/pay`~~               | **Removed**                                                           |

> **`send-to-kitchen` permission note**: gated by the existing `update_order`.
> The endpoint re-derives kitchen deltas from the same item ledger that item
> mutations write, and every item-mutation endpoint
> (`POST/PATCH/DELETE /orders/:id/items*`, `PUT /orders/:id/items/sync`) is
> already gated by `update_order` (or `delete_order_item`); nothing in the
> codebase suggests a different permission. No new permission is introduced.

`OrderResponse` embeds `payments[]` (full order detail):

```ts
payments: Array<{
  id: number;
  methodId: string;
  methodTitle: string; // snapshot at payment time
  amountHalalas: number;
  tenderedHalalas?: number; // positive cash lines only
  changeHalalas?: number; // positive cash lines only
  createdAt: number;
}>;
```

List/summary endpoints stay lean — **no** `payments` embedded.

### Submit preconditions (server)

Submit validates all of the following inside its transaction; any failure is a
4xx and the order remains `open`:

1. **Status `open`** — paid/voided/refunded → 400.
2. **≥ 1 order item** — an empty order cannot be submitted.
3. **Outstanding exactly 0**: `totalHalalas - SUM(payment.amountHalalas) === 0`.
   Over-pay or under-pay → 400. (Temporary overpay is allowed _during_ `open`;
   it must be balanced before Submit.)
4. **Concurrency**: when the client sends `baseUpdatedAt`, it must equal
   `orders.updated_at`, matching the existing staged-cart pattern
   (`PUT /orders/:id/items/sync`, ADR 0004). Stale → 409 with the standard
   conflict shape `{ message, updatedAt }`.
5. **Kitchen is NOT required** — an order may be submitted without ever
   calling send-to-kitchen.
6. **Net per `methodId` ≥ 0**: for every method, `SUM(amountHalalas)` across
   its lines must be ≥ 0 — reject if any method nets negative. `PaymentMeans`
   on the invoice = net per `methodId`, zero nets dropped.

### Payments rules

- **Append-only**: no edit/delete of `order_payments` rows. Corrections are
  new lines.
- **Drop** the unique index `idx_order_payments_order_method` on
  `(order_id, method_id)` (supersedes ADR 0002's "at most one row per method
  per order").
- `amountHalalas ≠ 0`; **negatives are allowed** (correction lines).
- After each append: `SUM(all amounts) ≥ 0` — a line may not push the order
  into a net negative balance.
- **Temporary overpay is allowed** (`SUM > total`) while `open`; Submit
  requires exact balance (precondition 3).
- Cash tendered/change: only on **positive** cash lines; otherwise the same
  rules as today (tendered ≥ amount, change = tendered − amount, server
  computed). Negative cash lines carry no tendered/change.
- Each append writes an `order_events` entry (e.g. `payment_added`) with the
  line details, preserving the immutable ledger.
- **≥ 1 order item required to add a payment** — 400 on an empty order.
- POS blocks adding a payment while the cart is dirty (client-side); the
  server always computes outstanding from **server** item totals.
- Permission: existing `pay_order` / `payOrder` for **both** add-payment and
  submit. No new permission.

### Void

- **Block void unless `SUM(payments) === 0`** — 400 with guidance.
- Staff first append negative balancing lines (to bring the sum to zero), then
  void. The void itself stays the existing endpoint/flow.

### Kitchen

- **No auto-print** on any item mutation path: `POST /orders/:id/items`,
  `PATCH /orders/:id/items/:itemId`, `DELETE /orders/:id/items/:itemId`, and
  `PUT /orders/:id/items/sync`.
- Item mutation events record `kitchenPrintedQty: 0` at mutation time
  (replacing today's auto-print semantics of full qty on add / delta on
  increase).
- `POST /orders/:id/send-to-kitchen` computes **deltas** versus the ledger
  printed totals — the existing differential math over `order_events`
  (`SUM(kitchenPrintedQty)` per `orderItemId`).
- POS only; Android has no send button (device-responsibilities rule).
- No deltas → **200 no-op** (no events, no print).
- POS Items tab: **Save Items** when the cart is dirty; **Send to Kitchen**
  when the cart is clean **and** unsent deltas exist. The two are **mutually
  exclusive** — you cannot send while dirty.

### Items after payments

- Order items remain **fully mutable while `open`** (POS and Android,
  including Android's qty-floor rules from ADR 0005).
- `outstanding = totalHalalas − SUM(payments)`; the Payments tab drives off
  this figure.

### ZATCA / receipt (Submit only)

- `PaymentMeans` = net per `methodId`, zero nets dropped.
- **Reject Submit if any method nets negative** (precondition 6).
- **Drawer kick** if any **positive** cash payment line exists (card-only
  orders keep the drawer closed, as in ADR 0002).
- Multi-line or corrected cash (`SUM` of cash lines ≠ a single positive line
  with tendered) → **omit tendered/change on the invoice**; a single positive
  cash line with tendered keeps the prior behavior.
- Standard-invoice buyer form lives on the Summary tab; the submit DTO carries
  `isStandardInvoice` + `zatcaBuyerDetails` exactly like the old pay request.
- **Optional `printReceipt`** (default `true`) on submit disables the auto
  receipt print for **simplified invoices only** (e.g. order-at-table flows
  where the customer keeps the phone receipt). `false` skips the receipt
  print entirely, but a **cash drawer kick is still emitted** when any
  positive cash payment exists — the flag suppresses the receipt, never the
  drawer. **Ignored for standard invoices**: their receipt is always deferred
  until ZATCA clearance regardless of the flag.

### Reports

- X-report / Z-report / expected cash count `order_payments` only on
  **`paid` / `refunded`** orders — payments on `open` orders are excluded.
- Day close still **blocks while any `open` orders exist** (existing rule,
  unchanged).

### POS UI

Right cart panel becomes a tabbed panel: **Items | Payments | Summary**

- **Items**: cart, Create Order, Save Items + Discard (when dirty), Send to
  Kitchen (when clean and unsent deltas exist).
- **Payments**: outstanding, append-only payment log, Add payment → modal
  (no finalize in the modal; allows ± amounts).
- **Summary**: totals, outstanding, standard-invoice buyer form, **Submit**,
  Void, Refund (if paid), reprints, New Order.

### Defaults locked in grilling

- **Payment log order**: oldest-first (append order).
- **Old `/pay`**: deleted in the same change set — no deprecation alias, no
  grace period.
- **Leave-guard**: only a **dirty cart** blocks leaving the order page for v1;
  unsent kitchen deltas do **not** block navigation.

## Consequences

### Positive

- **Matches the operational reality**: cashier takes payment before the
  kitchen cooks, without finalizing the order.
- **No more auto-kitchen noise**: tablet/waiter staging edits no longer print
  intermediate or abandoned tickets; the kitchen prints exactly what the
  cashier explicitly sends, once.
- **Split-tender and corrections become natural**: multiple lines per method,
  negative balancing lines, and temporary overpay are first-class instead of
  requiring void/recreate.
- **Cleaner finality semantics**: only Submit produces an invoice, a receipt,
  and the `paid` transition — one code path for finalization.
- **No new states and no new permissions**: `open | paid | voided | refunded`
  unchanged; `pay_order` covers both new endpoints; `send-to-kitchen` reuses
  `update_order`.
- **Ledger integrity preserved**: `order_payments` stays append-only and
  every line is audited via `order_events`; reports keep counting only
  finalized (paid/refunded) orders.

### Negative

- **Breaking API change**: `POST /orders/:id/pay` is deleted; clients
  (server tests, client-ts, OpenAPI spec) must move to
  payments/submit/send-to-kitchen in the same change set.
- **Schema migration**: the unique index
  `idx_order_payments_order_method` must be dropped; historical
  one-line-per-method rows remain valid.
- **POS SPA gains real complexity**: tabbed panel, append-only log with
  corrections, dirty-cart gating, send/save exclusivity, submit preconditions.
  Must stay Chrome 109 safe and touch-friendly.
- **New failure surface at Submit**: overpay/underpay, negative net per
  method, and concurrent edits can now surface as a 400/409 at submit time
  rather than being rejected at pay time.
- **Day-close dependency**: an order with a stray overpay can sit `open`
  (blocking day close) until staff balance it — same class of risk as an
  unfinalized open order today.

### Neutral / Mitigations

- `kitchenPrintedQty: 0` on mutation events keeps the ledger derivation
  (`SUM(kitchenPrintedQty)` per item) intact — the differential math for
  send-to-kitchen is the existing algorithm, just no longer fired inline.
- Overpay is only ever _temporary_: the post-append sum guard (`SUM ≥ 0`) and
  the Submit exact-balance precondition bound the state space.
- Deleting `/pay` outright (no alias) avoids a second, parallel finalize path
  that could drift.

## Non-goals (explicit)

- **Android UI changes** — no payments, no submit, no send-to-kitchen on the
  tablet; the server simply stops auto-kitchen-printing for all clients.
- **New order statuses** (e.g. a separate `sent` or `paying` state) —
  states stay `open | paid | voided | refunded`.
- **New permissions** — `pay_order` for payments/submit, `update_order` for
  send-to-kitchen.
- **Edit/delete of payment lines** — append-only, including corrections.
- **Leave-guard on unsent kitchen deltas** for v1 (see defaults above).

## Supersedes parts of `docs/order-lifecycle.md`

This ADR supersedes, in part, `docs/order-lifecycle.md`:

- **Automatic kitchen printing** — the lifecycle doc's "Kitchen Printing
  (Automatic & Differential)" section and its auto-print event sequences
  (`item_added` → `kitchen_print_enqueued` → `kitchen_print_succeeded`, etc.)
  are replaced by explicit, differential send-to-kitchen.
- **Atomic pay** — the `pay` flow (atomic `order_payments` + `open → paid` +
  invoice + receipt), the `UNIQUE(order_id, method_id)` constraint, and the
  `POST /orders/:id/pay` rows in the endpoint summary and schema-change
  sections are replaced by payments / submit / send-to-kitchen.

Updating `docs/order-lifecycle.md` is a **required follow-up** in the
implementation slice (not part of this ADR).

## References

- **ADR 0002** — Payment methods (payment catalog, immutable `order_payments`,
  cash semantics, drawer-kick rule, per-method report aggregation)
- **ADR 0005** — Android qty floor & `clientType` (item sync semantics reused
  unchanged)
- `docs/order-lifecycle.md` — superseded in part (see above)
