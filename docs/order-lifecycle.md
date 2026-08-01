# Order Lifecycle — SpicyHome POS

## Order States

| Status     | Meaning                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`     | Order is active. Items can be added, updated, or removed. Item mutations are persisted via sync and NEVER kitchen-print; the kitchen is notified only by explicit `POST /orders/:id/send-to-kitchen` (ADR 0006). |
| `paid`     | Payment completed on POS SPA. ZATCA invoice generated, receipt printed. Terminal for the happy path.                                                                                                             |
| `voided`   | Order cancelled. Terminal.                                                                                                                                                                                       |
| `refunded` | All items on the order have been fully refunded. Terminal. Only reachable from `paid`.                                                                                                                           |

There is no `sent` status. Kitchen notification is **explicit and differential**: `POST /orders/:id/send-to-kitchen` prints only the quantities not yet printed to the kitchen (ADR 0006). Item mutations (sync) never print.

## State Transitions

```
open ─┬──► paid ──────► refunded
      └──► voided
```

```
VALID_TRANSITIONS:
  open     → [paid, voided]
  paid     → [refunded]
  voided   → []
  refunded → []
```

### Transition Details

| Transition          | Trigger                   | Allowed On              | Side Effects                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (new) → `open`      | `POST /orders`            | POS SPA, Android tablet | `order_events` entry, `order.created` WebSocket event                                                                                                                                                                                                                                                                                                                                                                                             |
| `open` → `paid`     | `POST /orders/:id/submit` | **POS SPA only**        | Finalizes an open order (ADR 0006): validates exact payment balance (`SUM(order_payments) === total`), ≥ 1 item, and non-negative net per method. Writes the `paid` transition. Receipt printed (cash drawer kick only if a positive cash line exists). ZATCA invoice created (simplified inline / standard deferred to clearance). `order_events` entries for `paid` + `receipt_print_enqueued` + `receipt_print_succeeded`. `order.paid` event. |
| `open` → `voided`   | `POST /orders/:id/void`   | **POS SPA only**        | `order_events` entry, `order.voided` event                                                                                                                                                                                                                                                                                                                                                                                                        |
| `paid` → `refunded` | `POST /orders/:id/refund` | **POS SPA only**        | Refund records created, ZATCA credit note, receipt printed, `order_events` entries for `refund_issued` + `receipt_print_enqueued` + `receipt_print_succeeded` + `refunded` (if fully refunded), `order.refund.issued` event (+ `order.refunded` if fully refunded)                                                                                                                                                                                |

## Device Responsibilities

| Capability                           | POS SPA (Windows) | Android Tablet |
| ------------------------------------ | :---------------: | :------------: |
| Create order                         |        Yes        |      Yes       |
| Add / update / remove items          |        Yes        |      Yes       |
| Make payment                         |      **Yes**      |     **No**     |
| Issue refund                         |      **Yes**      |     **No**     |
| Void order                           |      **Yes**      |     **No**     |
| Reprint receipt                      |        Yes        |       No       |
| Open / close business day            |        Yes        |       No       |
| Manage menu, tables, printers, users |        Yes        |       No       |

> **Rule**: The Android tablet is exclusively for order item management. All payment, refund, void, and administrative operations happen on the POS SPA only. The Android app must not expose payment, refund, void, or admin endpoints in its UI.

### Android qty floor (ADR 0005)

The tablet may **add items, increase qty, and edit notes** on any line. It may
**not decrease qty or remove lines that already exist on the server**
(`orderItemId != null`) — reducing or removing kitchen-known quantity is a
cashier (POS) operation, because qty-down prints nothing and the kitchen cooks
what was printed. New never-synced local lines (`orderItemId == null`) remain
fully editable (including decrease and remove) until Send to Kitchen.

The floor is the **current server/DB line qty** from the last successful sync
snapshot, not `printedQty`. The server enforces the same rule for Android JWT
sessions on `PUT /orders/:orderId/items/sync` (entire sync rejected with
`Kitchen items can only be reduced at the cashier.`); POS sync keeps full
decrease/remove power. See `docs/adr/0005-android-qty-floor-client-type.md`.

## Item Lifecycle & Mutation Tracking

### Items Are Mutable While `open`

| Order Status | Add Item | Update Qty/Notes | Remove Item |
| ------------ | :------: | :--------------: | :---------: |
| `open`       |   Yes    |       Yes        |     Yes     |
| `paid`       |    No    |        No        |     No      |
| `voided`     |    No    |        No        |     No      |
| `refunded`   |    No    |        No        |     No      |

### Item Change History

Every item mutation writes an `order_events` entry with before/after state, enabling full traceability:

_"Butter Naan x5 was ordered at 14:02, reduced to x3 at 14:15, then fully removed at 14:30."_

All of this is reconstructable from the `order_events` ledger.

## `order_events` — Unified Immutable Ledger

> **`order_events` replaces `order_audit_log`.** It is the single append-only table for every action on an order: item mutations, kitchen prints, receipt prints, status transitions, and reprints.

### Schema

```
order_events
├── id            INTEGER PRIMARY KEY AUTOINCREMENT
├── order_id      INTEGER FK → orders.id    NOT NULL
├── event_idx     INTEGER NOT NULL           -- per-order sequence (1, 2, 3, ...)
├── user_id       INTEGER FK → users.id     NOT NULL
├── type          TEXT NOT NULL              -- event type (see below)
├── payload       TEXT NOT NULL              -- JSON, structure varies by type
├── prev_hash     TEXT NOT NULL              -- SHA-256 hash of previous event ('' for first)
├── hash          TEXT NOT NULL              -- SHA-256 hash of this event
├── created_at    INTEGER NOT NULL           -- Unix epoch
└── UNIQUE(order_id, event_idx)
```

**Hash computation**: `SHA-256(order_id | event_idx | user_id | type | payload | prev_hash | created_at)`

`event_idx` is a per-order monotonic counter. Each new event for an order gets `event_idx = previous_max + 1`. This provides deterministic ordering independent of `created_at` (which may collide when multiple events share the same timestamp within a single transaction). Chain verification iterates events ordered by `(order_id, event_idx)`.

### Immutability

SQLite triggers block UPDATE and DELETE on `order_events`. Once written, an event is permanent.

```sql
CREATE TRIGGER order_events_no_update
BEFORE UPDATE ON order_events
BEGIN
  SELECT RAISE(FAIL, 'UPDATE not allowed on order_events');
END;

CREATE TRIGGER order_events_no_delete
BEFORE DELETE ON order_events
BEGIN
  SELECT RAISE(FAIL, 'DELETE not allowed on order_events');
END;
```

Chain integrity is verified by recomputing hashes and checking `prev_hash` links.

### Event Types

#### Item Mutation Events

| Type           | Trigger                           | Payload                                                                                                |
| -------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `item_added`   | `PUT /orders/:orderId/items/sync` | `{ orderItemId, itemId, itemName, qty, unitPriceHalalas, totalHalalas, kitchenPrintedQty: 0, notes? }` |
| `item_updated` | `PUT /orders/:orderId/items/sync` | `{ orderItemId, itemName, oldQty, newQty, oldTotal, newTotal, kitchenPrintedQty: 0, notes? }`          |
| `item_removed` | `PUT /orders/:orderId/items/sync` | `{ orderItemId, itemName, oldQty, oldTotal }`                                                          |

> **ADR 0006**: item mutations always record `kitchenPrintedQty: 0` and never
> enqueue kitchen prints. Kitchen output happens only through
> `POST /orders/:id/send-to-kitchen`.

#### Print Events (DISTINCT from item mutations)

Print events come in **enqueued/succeeded** pairs. The `_enqueued` event is written when the print is initiated (intent). The `_succeeded` event is written when the printer confirms success. An `_enqueued` event without a subsequent `_succeeded` event indicates a failed or pending print — enabling retry tracking and audit of printer failures.

| Type                      | Trigger                                                                | Payload                                                                                  |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `kitchen_print_enqueued`  | `POST /orders/:id/send-to-kitchen` (explicit, differential — ADR 0006) | `{ printer: "<name>", printerId: <id>, items: [{ orderItemId, itemName, printedQty }] }` |
| `kitchen_print_succeeded` | Printer confirms kitchen ticket                                        | `{ printer: "<name>", printerId: <id> }`                                                 |
| `receipt_print_enqueued`  | `POST /orders/:id/submit`, `POST /orders/:id/refund`, reprint          | `{ printer: "<name>", printerId: <id>, totalHalalas, kickDrawer: bool }`                 |
| `receipt_print_succeeded` | Printer confirms receipt                                               | `{ printer: "<name>", printerId: <id> }`                                                 |

> **Print events are separate from item mutation events.** `send-to-kitchen`
> writes one `kitchen_print_enqueued` per kitchen printer, carrying the
> unsent delta per item; item mutations never write print events. Per-item
> printed totals are derived by summing `kitchenPrintedQty` from legacy item
> events (historical auto-print era) **plus** `items[].printedQty` from
> `kitchen_print_enqueued` events (`OrderEventsService.getPrintedQty`).

#### Status Transition Events

| Type            | Trigger                   | Payload                                                                                                                         |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `created`       | `POST /orders`            | `{ type, tableId, orderNo, uuid, documentId }`                                                                                  |
| `paid`          | `POST /orders/:id/submit` | `{ fromStatus: "open", toStatus: "paid", payments: [...], netPayments: [...] }`                                                 |
| `voided`        | `POST /orders/:id/void`   | `{ fromStatus: "open", toStatus: "voided" }`                                                                                    |
| `refund_issued` | `POST /orders/:id/refund` | `{ refundId, documentId, methodId, methodTitle, items: [{ orderItemId, itemName, qty, totalHalalas }], totalHalalas, reason? }` |
| `refunded`      | Auto: when fully refunded | `{ fromStatus: "paid", toStatus: "refunded" }`                                                                                  |

#### Delivery Partner & Price Reset Events (ADR 0007)

| Type                       | Trigger                                                                                                                              | Payload                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `delivery_partner_changed` | `PATCH /orders/:id/partner` (set / change / clear / ref-only edit), and the partner-clear half of a `takeaway → dine_in` type change | `{ fromPartnerId, toPartnerId, fromPartnerTitle, toPartnerTitle, fromExternalRef, toExternalRef, resetItemCount }`          |
| `item_price_reset`         | Clear-partner, and the price-reset half of a `takeaway → dine_in` type change (one event per changed line)                           | `{ orderItemId, itemId, fromUnitPriceHalalas, toUnitPriceHalalas, reason: 'partner_cleared' \| 'type_changed_to_dine_in' }` |

> **ADR 0007**: `takeaway → dine_in` via `PATCH /orders/:id` additionally clears
> `delivery_partner_id` / `delivery_external_ref` and resets every line price to
> the live catalog (a dine-in order is always at menu prices). The existing
> `type_changed` payload is unchanged; the partner clear and price resets are
> recorded as their own events above. `dine_in → takeaway` sets no partner and
> touches no prices. Lines whose `item_id` is NULL keep their current price
> during a reset and get no `item_price_reset` event.

> **`documentId` = ZATCA UBL root `cbc:ID`**: The `documentId` field on the
> `created` and `refund_issued` events is the business Invoice ID / document
> number that appears as the root `<cbc:ID>` in the signed ZATCA XML. See
> [overview.md](./zatca/overview.md#document-id-document_id--ubl-invoice-cbcid).

#### ZATCA Clearance Events

| Type                       | Trigger                                                                                                         | Payload                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zatca_clearance_rejected` | Standard invoice/credit note clearance returns business rejection (4xx HTTP / `NOT_CLEARED` / validation ERROR) | `{ documentKind: 'invoice' \| 'credit_note', zatcaRecordId: number, attemptNo: number, icv: number, uuid: string, cbcId: string (burned business document_id), documentId: string (same as cbcId — business document number INV…/REF…), orderId: number, refundId?: number, httpStatus: number \| null, errors: string[] }`     |
| `zatca_clearance_approved` | Standard invoice/credit note clearance succeeds (`status = 'cleared'`)                                          | `{ documentKind: 'invoice' \| 'credit_note', zatcaRecordId: number, attemptNo: number, icv: number, uuid: string, cbcId: string (accepted business document_id), documentId: string (same as cbcId — business document number INV…/REF…), orderId: number, refundId?: number, httpStatus: number \| null, warnings: string[] }` |

> **Burn semantics**: A `zatca_clearance_rejected` event signals that the ICV
> associated with this attempt is permanently burned — the invoice cannot be
> retried with the same ICV/UUID. The `cbcId` field records the burned
> `orders.document_id` (or `order_refunds.document_id`), and the
> order/refund `document_id` is rotated atomically within the same
> transaction so the next reissue gets a fresh document number. The
> `orders.id` never changes. The operator must fix the issue and call
> `reissue()` (or `reissueCreditNote()`) which allocates a new
> ICV+UUID+document_id. These events are written atomically with the DB
> status update + document_id rotation inside a single transaction. They are
> **not** emitted for `error` status (network/5xx — retryable).
>
> **Approval semantics**: a `zatca_clearance_approved` event is the
> success-side audit mirror. When clearance returns `cleared`, one approved
> event is written atomically with the `status = 'cleared'` update in the
> same transaction. The `cbcId`/`documentId` fields record the **accepted**
> business document number — it is **not** rotated on success, so it always
> matches the current `orders.document_id` / `order_refunds.document_id`.
> The `warnings` field carries any ZATCA acceptance warnings (e.g. minor
> schema deviations). Approved events are also **not** emitted for `error`
> status.

### Payload Fields for Item Mutations

Every `item_added`, `item_updated`, and `item_removed` event carries enough data to reconstruct the full item history:

| Field               |     `item_added`      |    `item_updated`     | `item_removed` |
| ------------------- | :-------------------: | :-------------------: | :------------: |
| `orderItemId`       |          Yes          |          Yes          |      Yes       |
| `itemId`            |          Yes          |           —           |       —        |
| `itemName`          |          Yes          |          Yes          |      Yes       |
| `qty`               |          Yes          |           —           |       —        |
| `oldQty`            |           —           |          Yes          |      Yes       |
| `newQty`            |           —           |          Yes          |       —        |
| `oldTotal`          |           —           |          Yes          |      Yes       |
| `newTotal`          |           —           |          Yes          |       —        |
| `unitPriceHalalas`  |          Yes          |           —           |       —        |
| `totalHalalas`      |          Yes          |           —           |       —        |
| `notes`             |          Yes          |          Yes          |       —        |
| `kitchenPrintedQty` | Always `0` (ADR 0006) | Always `0` (ADR 0006) |       —        |

### Deriving Printed Quantity from the Ledger

For a given `order_item`, the total quantity ever printed to the kitchen is:

```
SUM(kitchenPrintedQty) across item_added and item_updated events for that orderItemId   (legacy)
+ SUM(printedQty) across kitchen_print_enqueued events where items[].orderItemId matches (ADR 0006)
```

- `item_added` / `item_updated`: `kitchenPrintedQty = 0` — item mutations never print (ADR 0006)
- `kitchen_print_enqueued`: `printedQty` per item = the unsent delta printed by `send-to-kitchen`
- `item_removed`: no `kitchenPrintedQty` field (nothing printed)

No mutable column needed. The ledger is the source of truth.

### Verifying the Chain

```
GET /orders/:id/events/verify
```

Recomputes SHA-256 hashes and checks `prev_hash` links across all events for the order, iterated in `event_idx` order. Returns `{ valid: bool, brokenAt?: eventIdx }`.

## Kitchen Printing (Explicit & Differential — ADR 0006)

Item mutations (`PUT /orders/:orderId/items/sync`) **never** kitchen-print.
Kitchen output happens only through `POST /orders/:id/send-to-kitchen`
(POS SPA only, permission `update_order`), which prints the **unsent delta**
per item — the kitchen prints exactly what the cashier explicitly sends, once.

### When Kitchen Prints

| Trigger                               | What Prints                                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| `send-to-kitchen` with unsent qty     | Delta: `currentQty - previouslyPrintedTotal` per item, per printer |
| `send-to-kitchen` with nothing unsent | **200 no-op** — no events, no print                                |
| Item added / qty increased via sync   | Nothing (mutations never print)                                    |
| Qty decreased / item removed          | Nothing                                                            |

> `previouslyPrintedTotal` is derived by `getPrintedQty`:
> `SUM(kitchenPrintedQty)` from legacy `item_added`/`item_updated` events
> **plus** `SUM(items[].printedQty)` from `kitchen_print_enqueued` events for
> that `orderItemId`.

### Kitchen Print Flow (Example)

1. **"Butter Naan" added, qty 5 (sync)**
   - `item_added`: `kitchenPrintedQty: 0` (writes to `order_events`)
   - No `kitchen_print_enqueued` event. No physical print.

2. **`send-to-kitchen` (first send)**
   - Delta = 5 − 0 = 5
   - `kitchen_print_enqueued`: `{ printer: "Kitchen 1", items: [{ orderItemId: 1, itemName: "Butter Naan", printedQty: 5 }] }` (writes to `order_events`)
   - Kitchen physically prints: "Butter Naan x5"
   - `kitchen_print_succeeded`: `{ printer: "Kitchen 1" }` (writes to `order_events`)
   - Printed total for item 1: 5
   - `orders.updated_at` bumped so the POS can detect the change

3. **Increased to 8 via sync (no print)**
   - `item_updated`: `kitchenPrintedQty: 0` (writes to `order_events`)
   - No `kitchen_print_enqueued` event. No physical print.

4. **`send-to-kitchen` again**
   - `previouslyPrintedTotal` = 5 (derived from ledger)
   - Delta = 8 − 5 = 3
   - `kitchen_print_enqueued`: `{ printer: "Kitchen 1", items: [{ orderItemId: 1, itemName: "Butter Naan", printedQty: 3 }] }`
   - Kitchen physically prints: "Butter Naan x3"
   - `kitchen_print_succeeded`: `{ printer: "Kitchen 1" }`
   - Printed total: 8

5. **Reduced to 4 via sync, then `send-to-kitchen`**
   - `item_updated`: `kitchenPrintedQty: 0`
   - Send computes delta = 4 − 8 = −4 → nothing to print
   - **200 no-op**: no `kitchen_print_enqueued` event, no physical print
   - Printed total: 8 (kitchen already has materials prepped for 8)

6. **Removed entirely**
   - `item_removed` (no `kitchenPrintedQty`). No `kitchen_print_enqueued` event.

### Event Sequence Per Operation

```
sync add item      → item_added                                                      (1 row, no print)
sync increase qty  → item_updated                                                    (1 row, no print)
sync decrease qty  → item_updated                                                    (1 row, no print)
sync remove item   → item_removed                                                    (1 row)
send-to-kitchen    → kitchen_print_enqueued (+ kitchen_print_succeeded on success)   (1–2 rows per printer)
send-to-kitchen no-op → nothing                                                      (0 rows)
```

> If the printer fails, only `kitchen_print_enqueued` is written (1 row). The
> missing `kitchen_print_succeeded` signals a failed/pending print that can be
> retried. The send request itself still returns 200.

Payment and refund write multiple rows:

```
submit (happy)    → paid + receipt_print_enqueued + receipt_print_succeeded          (3 rows)
refund (full)     → refund_issued + receipt_print_enqueued + receipt_print_succeeded + refunded  (4 rows)
refund (partial)  → refund_issued + receipt_print_enqueued + receipt_print_succeeded   (3 rows)
```

## Refunds

### Rules

- Refunds can only be made against `paid` orders (completed invoices).
- Refunds MUST be issued from the POS SPA only.
- The user selects specific items and quantities to refund.
- A refund can be partial (some items/quantities) or full (all items).
- When ALL items on the order have been fully refunded, the order transitions to `refunded`.
- Partial refunds leave the order in `paid` status.

### Data Model

**`order_refunds`** — one row per refund transaction:

| Column             | Type                   | Description                                |
| ------------------ | ---------------------- | ------------------------------------------ |
| `id`               | integer PK             |                                            |
| `order_id`         | integer FK → orders.id |                                            |
| `user_id`          | integer FK → users.id  |                                            |
| `subtotal_halalas` | integer                | Sum of refunded item subtotals (excl. VAT) |
| `vat_halalas`      | integer                | VAT portion of the refund                  |
| `total_halalas`    | integer                | Total amount refunded                      |
| `reason`           | text                   | Optional                                   |
| `created_at`       | integer                | Unix epoch                                 |
| `created_by`       | integer FK             |                                            |
| `updated_at`       | integer                |                                            |
| `updated_by`       | integer FK             |                                            |

**`order_refund_items`** — one row per item/qty refunded:

| Column               | Type                                    | Description                 |
| -------------------- | --------------------------------------- | --------------------------- |
| `id`                 | integer PK                              |                             |
| `refund_id`          | integer FK → order_refunds.id (CASCADE) |                             |
| `order_item_id`      | integer FK → order_items.id             |                             |
| `item_name`          | text                                    | Snapshot at refund time     |
| `unit_price_halalas` | integer                                 | Snapshot at refund time     |
| `vat_rate_bp`        | integer                                 | Snapshot at refund time     |
| `qty`                | integer                                 | Quantity being refunded     |
| `total_halalas`      | integer                                 | Refund amount for this line |
| `created_at`         | integer                                 |                             |

### API

```
POST /orders/:id/refund
Body: {
  items: [
    { orderItemId: number, qty: number },
    ...
  ],
  reason?: string
}
Response: { success: true, refundId: number }
```

- Validates the order is `paid`.
- Validates each `orderItemId` belongs to the order.
- Validates `already_refunded_qty + requested_qty <= original_qty`.
- Creates `order_refunds` and `order_refund_items` in a transaction.
- Writes `refund_issued` event to `order_events`.
- Prints refund receipt, writes `receipt_print_enqueued` + `receipt_print_succeeded` events.
- If fully refunded after this transaction → transitions to `refunded`, writes `refunded` event. Emits `order.refund.issued` (always) and `order.refunded` (only if fully refunded) WS events.

### Constraints

- Sum of refunded qty across all refunds cannot exceed original ordered qty.
- Refund amounts use snapshotted price/VAT from `order_items`, not current menu prices.

## Payment Methods & Split Tender

### Payment Method Catalog

Admin-configurable catalog of payment methods (`payment_methods` table). Each method has a text slug (`id`), title, enabled flag (soft-disable), and sort order. Default methods: `cash`, `card`, `mada`.

- `cash` is fully locked: cannot be renamed or disabled. `sort_order` adjustable.
- Slugs are generated from titles (lowercase, kebab-case). Immutable after creation.
- No DELETE — soft-disable via `enabled = false`.

### Payments & Submit Flow (ADR 0006)

`POST /orders/:id/pay` is **removed**. Payment and finalization are decoupled:

**`POST /orders/:id/payments`** — append ONE payment line to an open order.
The order stays `open` — no invoice, no receipt.

```json
{ "methodId": "cash", "amountHalalas": 3250, "tenderedHalalas": 10000 }
```

Validation (single transaction):

1. Order must be `open` and have ≥ 1 order item.
2. `methodId` must exist and be enabled.
3. `amountHalalas` must be non-zero (negative lines are corrections).
4. Non-cash methods: `tenderedHalalas` absent/null.
5. Cash: `tenderedHalalas` (if present) ≥ `amountHalalas`. Change auto-computed.
6. After append, `SUM(all amounts) ≥ 0` — a line may not push the order into a net negative balance.

**`POST /orders/:id/submit`** — the ONLY `open → paid` path. Validates:

1. Order is `open`.
2. ≥ 1 order item.
3. `SUM(order_payments.amountHalalas) === order.totalHalalas` (outstanding exactly 0; temporary overpay must be balanced before submit).
4. Optional `baseUpdatedAt` concurrency check (stale → 409).
5. Every payment method nets ≥ 0.

Transaction writes: order → `paid`, `order_events` `paid` (with raw payment
ledger + netted per-method breakdown), `receipt_print_enqueued` with
`kickDrawer: true` only if a positive cash line exists. Simplified invoices
print the receipt inline; standard invoices defer the receipt until ZATCA
clearance (cash drawer kicked immediately on submit for cash orders).

### Cash Drawer Kick

`kickDrawer: true` only when a cash payment line has `amountHalalas > 0`. Card-only orders do not open the cash drawer.

### `order_payments` (Immutable Ledger)

Append-only: no UPDATE/DELETE, no `updated_at`/`updated_by`. Corrections are
new lines (negative amounts). The unique index `idx_order_payments_order_method`
is **dropped** (ADR 0006) — multiple lines per method are allowed; ZATCA
`PaymentMeans` net per method at submit, zero nets dropped.

### Reports

- `paymentTotals` is an array of `{ methodId, methodTitle, totalHalalas }`, aggregated from `order_payments` via JOIN with `orders` filtered by `day_opening_id` and `status = 'paid'`. GROUP BY `methodId` only.
- Expected cash = `openingCashHalalas + SUM(amountHalalas WHERE methodId = 'cash')` (not total sales).

### Delivery Partners (ADR 0007)

A delivery-app order (HungerStation, Keeta, …) is a **`takeaway` order that
additionally carries a partner reference** — there is no third order type.

- `orders.delivery_partner_id` (slug FK → `delivery_partners`) + `orders.delivery_external_ref`
  (the app's order number) are both nullable and only meaningful on `takeaway`.
- **`PATCH /orders/:id/partner`** (permission `update_order`, open orders only):

  | Scenario                                  | Behavior                                                                                                            |
  | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
  | Set partner                               | Type must be `takeaway` (`dine_in` → 400); partner must exist and be enabled (else 400). **Line prices untouched.** |
  | Change partner                            | Slug swapped; **line prices untouched**; ref may be sent in the same call or edited separately.                     |
  | Clear partner (`deliveryPartnerId: null`) | Resets every line's `unit_price_halalas` to the live catalog and recomputes totals; ref force-nulled.               |
  | Ref-only edit                             | Allowed when a partner is already set; without a partner the ref is ignored/force-nulled (no-op).                   |
  | Concurrency                               | `baseUpdatedAt` must equal `orders.updated_at`; stale → 409 `{ message, updatedAt }`.                               |

  Writes `delivery_partner_changed` (+ `item_price_reset` per changed line with
  `reason: 'partner_cleared'` on clear) and emits `order.updated`. Response is
  the full order (`GET /orders/:id` shape).

- **`PATCH /orders/:id` with `type: 'dine_in'`** (ADR 0004 extension): in the
  same transaction it clears partner/ref, resets line prices to the live
  catalog, and writes `delivery_partner_changed` (when a partner was set) +
  `item_price_reset` (`reason: 'type_changed_to_dine_in'`) alongside the
  unchanged `type_changed` event. `dine_in → takeaway` sets no partner and
  touches no prices.
- `OrderResponse` / order list/summary responses embed `deliveryPartnerId`,
  `deliveryPartnerTitle` (joined when set) and `deliveryExternalRef`.
- Per-line price overrides (`item_price_overridden`) land in Phase 7
  (`PATCH /orders/:id/items/:itemId/unit-price`); the `item_price_reset`
  events reference the same `unit_price_halalas` snapshot column.

## Endpoint Summary

| Endpoint                           | Permission     |   POS SPA    | Android Tablet |
| ---------------------------------- | -------------- | :----------: | :------------: |
| `POST /orders`                     | `create_order` |     Yes      |      Yes       |
| `GET /orders`                      | none           |     Yes      |      Yes       |
| `GET /orders/:id`                  | none           |     Yes      |      Yes       |
| `GET /orders/:id/events`           | none           |     Yes      |       No       |
| `GET /orders/:id/events/verify`    | none           |     Yes      |       No       |
| `PUT /orders/:orderId/items/sync`  | `update_order` |     Yes      |      Yes       | Persist cart items; **never** kitchen-prints (ADR 0006)                                  |
| `PATCH /orders/:id`                | `update_order` |   **Yes**    |     **No**     | Type/table change; `takeaway → dine_in` also clears partner and resets prices (ADR 0007) |
| `PATCH /orders/:id/partner`        | `update_order` |   **Yes**    |     **No**     | Set/change/clear delivery partner + external ref (ADR 0007)                              |
| `POST /orders/:id/send-to-kitchen` | `update_order` |   **Yes**    |     **No**     | Explicit differential kitchen print; 200 no-op when nothing unsent (ADR 0006)            |
| `POST /orders/:id/payments`        | `pay_order`    |   **Yes**    |     **No**     | Append one payment line (order stays `open`)                                             |
| `POST /orders/:id/submit`          | `pay_order`    |   **Yes**    |     **No**     | Finalize: `open → paid`, ZATCA invoice + receipt                                         |
| `POST /orders/:id/refund`          | `refund_order` |   **Yes**    |     **No**     |
| `GET /orders/:id/refunds`          | none           |     Yes      |       No       |
| `POST /orders/:id/void`            | `void_order`   |   **Yes**    |     **No**     |
| `POST /orders/:id/print`           | `update_order` | Receipt only |       No       |

> `POST /orders/:id/pay` is **removed** (ADR 0006) — no alias, no deprecation
> period. The Android app should only bind to endpoints for order creation and
> item management (it has no send-to-kitchen UI; the server gates it with
> `update_order`). The server enforces via permission guards; the Android
> client is a restricted UI surface.

## WebSocket Events

| Event                 | When                                                        |
| --------------------- | ----------------------------------------------------------- |
| `order.created`       | New order                                                   |
| `order.item.added`    | Item added (sync; no kitchen print)                         |
| `order.item.updated`  | Item qty/notes changed                                      |
| `order.item.removed`  | Item removed                                                |
| `order.paid`          | Submit finalized the order (open → paid)                    |
| `order.voided`        | Order voided                                                |
| `order.refund.issued` | Refund issued (both partial and full refunds)               |
| `order.refunded`      | Order fully refunded (status transition to `refunded` only) |

## Schema Changes Summary

### Removed

| Item                                                 | Reason                                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `order_audit_log` table                              | Replaced by `order_events`.                                                                                                       |
| `AuditLogService`                                    | Logic moves into `OrderEventsService`.                                                                                            |
| `orders.status = 'sent'`                             | Kitchen notified automatically on item mutations.                                                                                 |
| `POST /orders/:id/send` endpoint                     | Replaced by automatic kitchen printing.                                                                                           |
| `SENT` from `OrderStatus` enum                       | No longer a state.                                                                                                                |
| `SENT_TO_KITCHEN`, `PRINTED` from `AuditAction` enum | Replaced by `kitchen_print_enqueued`, `kitchen_print_succeeded`, `receipt_print_enqueued`, `receipt_print_succeeded` event types. |

### New

| Item                                   | Purpose                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `order_events` table                   | Unified immutable ledger: item mutations, kitchen prints, receipt prints, status transitions.           |
| `OrderEventsService`                   | Hash-chain management, event creation, chain verification, `kitchen_printed_qty` derivation.            |
| `order_refunds` table                  | Refund transaction headers.                                                                             |
| `order_refund_items` table             | Individual items refunded per transaction.                                                              |
| `payment_methods` table                | Catalog of payment methods (cash, card, mada, etc.). Soft-delete via `enabled` flag. Slugs as TEXT PKs. |
| `order_payments` table                 | Immutable append-only payment ledger. One row per (order_id, method_id). Snapshots method_title.        |
| `pay_order` permission on `user_roles` | New permission for payment operations (was guarded by `create_order`).                                  |
| `PaymentMethodsModule`                 | CRUD for payment method catalog (admin only). Slugs generated from title, cash method locked.           |

### Modified

| Item                                    | Change                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALID_TRANSITIONS`                     | `open → [paid, voided]`, `paid → [refunded]`                                                                                                                                                |
| `addItem` / `updateItem` / `removeItem` | Gate on `status NOT IN ('paid', 'voided', 'refunded')`. Emit kitchen print on add/increase. Write `order_events` entries.                                                                   |
| `payOrder` / `voidOrder`                | Write `order_events` entries instead of `order_audit_log`.                                                                                                                                  |
| `reprintOrder`                          | Write `order_events` entry.                                                                                                                                                                 |
| `BusinessDayService.closeDay`           | Block close if any `open` orders exist (was `open` or `sent`).                                                                                                                              |
| `PrintJobService`                       | Remove `onOrderSent` listener. Kitchen prints happen inline during item mutations. Delta-only prints use ledger-derived `previouslyPrintedTotal`.                                           |
| `shared/src/enums.ts`                   | Remove `SENT`, `SENT_TO_KITCHEN`, `PRINTED`. Add `KITCHEN_PRINT_ENQUEUED`, `KITCHEN_PRINT_SUCCEEDED`, `RECEIPT_PRINT_ENQUEUED`, `RECEIPT_PRINT_SUCCEEDED`, `REFUND_ISSUED`, `ITEM_UPDATED`. |
| `shared/src/types.ts`                   | Remove `order.sent` WS event. Add `order.refund.issued`. Update `WS_EVENTS`.                                                                                                                |
| `db/src/schema.ts`                      | Replace `order_audit_log` with `order_events` (add `event_idx` + `UNIQUE(order_id, event_idx)`). Add `order_refunds`, `order_refund_items`. Add `pay_order` boolean column to `user_roles`. |

## Migration Plan

1. Drop `order_audit_log` table and its immutability triggers.
2. Create `order_events` table with `event_idx` column, `UNIQUE(order_id, event_idx)` constraint, and immutability triggers.
3. Create `order_refunds` and `order_refund_items` tables.
4. Add `OrderEventsService`: hash-chain management with `event_idx` sequencing, `createEvent()`, `verifyChain()` (iterate by `event_idx`), `getPrintedQty(orderItemId)`.
5. Update `VALID_TRANSITIONS` — remove `sent`, add `paid → [refunded]`.
6. Update `orders.service.ts`:
   - Remove `sendOrder()` method.
   - Update `addItem`/`updateItem`/`removeItem` status guards.
   - Add kitchen print in `addItem` (full qty) and `updateItem` (delta on increase) — write `kitchen_print_enqueued` event, attempt physical print, write `kitchen_print_succeeded` on success.
   - Add `refundOrder()` / `getOrderRefunds()` methods.
   - Wire all mutations and prints through `OrderEventsService`.
7. Update `orders.controller.ts`:
   - Remove `POST /orders/:id/send`.
   - Add `POST /orders/:id/refund`, `GET /orders/:id/refunds`, `GET /orders/:id/events`, `GET /orders/:id/events/verify`.
   - Change `POST /orders/:id/pay` permission guard from `create_order` to `pay_order`.
8. Update `business-day.service.ts` — only check for `open` orders.
9. Update `print-job.service.ts` — remove `onOrderSent`; kitchen prints are inline during item mutations. Print service is called from `OrdersService` (or an event listener) and responsible only for the physical printer I/O, not triggering. On success, the caller writes `kitchen_print_succeeded` / `receipt_print_succeeded` to the ledger.
10. Update `shared/` enums, types, and WS events (add `order.refund.issued`, remove `order.sent`).
11. Update `db/` schema definitions (add `pay_order` column to `user_roles`).
12. Write fresh DB migration (replace `0000_initial.sql`).
13. Update AGENTS.md (already done).
