# Order Lifecycle — SpicyHome POS

## Order States

| Status     | Meaning                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `open`     | Order is active. Items can be added, updated, or removed. Each item addition or qty increase prints to the kitchen immediately. |
| `paid`     | Payment completed on POS SPA. ZATCA invoice generated, receipt printed. Terminal for the happy path.                            |
| `voided`   | Order cancelled. Terminal.                                                                                                      |
| `refunded` | All items on the order have been fully refunded. Terminal. Only reachable from `paid`.                                          |

There is no `sent` status. The kitchen is notified automatically as items are added or quantities increased — no separate "send to kitchen" step.

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

| Transition          | Trigger                   | Allowed On              | Side Effects                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (new) → `open`      | `POST /orders`            | POS SPA, Android tablet | `order_events` entry, `order.created` WebSocket event                                                                                                                                                                                                              |
| `open` → `paid`     | `POST /orders/:id/pay`    | **POS SPA only**        | Requires payment lines array. Writes `order_payments` rows. Receipt printed (cash drawer kick only if cash payment > 0). ZATCA invoice created. `order_events` entries for `paid` (with payments breakdown) + `receipt_print_enqueued` + `receipt_print_succeeded`. `order.paid` event. |
| `open` → `voided`   | `POST /orders/:id/void`   | **POS SPA only**        | `order_events` entry, `order.voided` event                                                                                                                                                                                                                         |
| `paid` → `refunded` | `POST /orders/:id/refund` | **POS SPA only**        | Refund records created, ZATCA credit note, receipt printed, `order_events` entries for `refund_issued` + `receipt_print_enqueued` + `receipt_print_succeeded` + `refunded` (if fully refunded), `order.refund.issued` event (+ `order.refunded` if fully refunded) |

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

| Type           | Trigger                            | Payload                                                                                                    |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `item_added`   | `POST /orders/:id/items`           | `{ orderItemId, itemId, itemName, qty, unitPriceHalalas, totalHalalas, kitchenPrintedQty: <qty>, notes? }` |
| `item_updated` | `PATCH /orders/:id/items/:itemId`  | `{ orderItemId, itemName, oldQty, newQty, oldTotal, newTotal, kitchenPrintedQty: <delta or 0>, notes? }`   |
| `item_removed` | `DELETE /orders/:id/items/:itemId` | `{ orderItemId, itemName, oldQty, oldTotal }`                                                              |

#### Print Events (DISTINCT from item mutations)

Print events come in **enqueued/succeeded** pairs. The `_enqueued` event is written when the print is initiated (intent). The `_succeeded` event is written when the printer confirms success. An `_enqueued` event without a subsequent `_succeeded` event indicates a failed or pending print — enabling retry tracking and audit of printer failures.

| Type                      | Trigger                                                    | Payload                                                                                  |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `kitchen_print_enqueued`  | Auto: item add / qty increase                              | `{ printer: "<name>", printerId: <id>, items: [{ orderItemId, itemName, printedQty }] }` |
| `kitchen_print_succeeded` | Printer confirms kitchen ticket                            | `{ printer: "<name>", printerId: <id> }`                                                 |
| `receipt_print_enqueued`  | `POST /orders/:id/pay`, `POST /orders/:id/refund`, reprint | `{ printer: "<name>", printerId: <id>, totalHalalas, kickDrawer: bool }`                 |
| `receipt_print_succeeded` | Printer confirms receipt                                   | `{ printer: "<name>", printerId: <id> }`                                                 |

> **Print events are separate from item mutation events.** A single item addition produces an `item_added` event (audit: what changed) AND a `kitchen_print_enqueued` + `kitchen_print_succeeded` pair (operational: what the printer received and whether it succeeded). Information is intentionally duplicated — `item_added` carries `kitchenPrintedQty` so per-item printed totals can be derived from item events alone without joining across event types.

#### Status Transition Events

| Type            | Trigger                   | Payload                                                                                      |
| --------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `created`       | `POST /orders`            | `{ type, tableId, orderNo, uuid }`                                                           |
| `paid`          | `POST /orders/:id/pay`    | `{ fromStatus: "open", toStatus: "paid", payments: [{ methodId, methodTitle, amountHalalas, tenderedHalalas?, changeHalalas? }] }` |
| `voided`        | `POST /orders/:id/void`   | `{ fromStatus: "open", toStatus: "voided" }`                                                 |
| `refund_issued` | `POST /orders/:id/refund` | `{ refundId, items: [{ orderItemId, itemName, qty, totalHalalas }], totalHalalas, reason? }` |
| `refunded`      | Auto: when fully refunded | `{ fromStatus: "paid", toStatus: "refunded" }`                                               |

### Payload Fields for Item Mutations

Every `item_added`, `item_updated`, and `item_removed` event carries enough data to reconstruct the full item history:

| Field               |  `item_added`  |  `item_updated`  | `item_removed` |
| ------------------- | :------------: | :--------------: | :------------: |
| `orderItemId`       |      Yes       |       Yes        |      Yes       |
| `itemId`            |      Yes       |        —         |       —        |
| `itemName`          |      Yes       |       Yes        |      Yes       |
| `qty`               |      Yes       |        —         |       —        |
| `oldQty`            |       —        |       Yes        |      Yes       |
| `newQty`            |       —        |       Yes        |       —        |
| `oldTotal`          |       —        |       Yes        |      Yes       |
| `newTotal`          |       —        |       Yes        |       —        |
| `unitPriceHalalas`  |      Yes       |        —         |       —        |
| `totalHalalas`      |      Yes       |        —         |       —        |
| `notes`             |      Yes       |       Yes        |       —        |
| `kitchenPrintedQty` | Yes (full qty) | Yes (delta or 0) |       —        |

### Deriving `kitchen_printed_qty` from the Ledger

For a given `order_item`, the total quantity ever printed to the kitchen is:

```
SUM(kitchenPrintedQty) across all item_added and item_updated events for that orderItemId
```

- `item_added`: `kitchenPrintedQty = qty` (first time, full qty printed)
- `item_updated` with increase: `kitchenPrintedQty = newQty - oldQty` (delta printed)
- `item_updated` with decrease: `kitchenPrintedQty = 0` (nothing printed)
- `item_removed`: no `kitchenPrintedQty` field (nothing printed)

No mutable column needed. The ledger is the source of truth.

### Verifying the Chain

```
GET /orders/:id/events/verify
```

Recomputes SHA-256 hashes and checks `prev_hash` links across all events for the order, iterated in `event_idx` order. Returns `{ valid: bool, brokenAt?: eventIdx }`.

## Kitchen Printing (Automatic & Differential)

Kitchen prints happen as a side effect of item mutations — no explicit "send to kitchen" step. Only additions and increases produce kitchen output.

### When Kitchen Prints

| Trigger                                           | What Prints                              |
| ------------------------------------------------- | ---------------------------------------- |
| Item added (`item_added`)                         | Full qty of the new item                 |
| Qty increased (`item_updated`, `newQty > oldQty`) | Delta: `newQty - previouslyPrintedTotal` |
| Qty decreased                                     | Nothing                                  |
| Item removed                                      | Nothing                                  |

> `previouslyPrintedTotal` is derived by summing `kitchenPrintedQty` from all prior `item_added` and `item_updated` events for that `orderItemId`.

### Kitchen Print Flow (Example)

1. **"Butter Naan" added, qty 5**
   - `item_added`: `kitchenPrintedQty: 5` (writes to `order_events`)
   - `kitchen_print_enqueued`: `{ printer: "Kitchen 1", items: [{ orderItemId: 1, itemName: "Butter Naan", printedQty: 5 }] }` (writes to `order_events`)
   - Kitchen physically prints: "Butter Naan x5"
   - `kitchen_print_succeeded`: `{ printer: "Kitchen 1" }` (writes to `order_events`)
   - Printed total for item 1: 5

2. **Increased to 8**
   - `previouslyPrintedTotal` = 5 (derived from ledger)
   - Delta = 8 - 5 = 3
   - `item_updated`: `kitchenPrintedQty: 3` (writes to `order_events`)
   - `kitchen_print_enqueued`: `{ printer: "Kitchen 1", items: [{ orderItemId: 1, itemName: "Butter Naan", printedQty: 3 }] }` (writes to `order_events`)
   - Kitchen physically prints: "Butter Naan x3"
   - `kitchen_print_succeeded`: `{ printer: "Kitchen 1" }` (writes to `order_events`)
   - Printed total: 8

3. **Reduced to 4**
   - `item_updated`: `kitchenPrintedQty: 0` (writes to `order_events`)
   - No `kitchen_print_enqueued` event. No physical print.
   - Printed total: 8 (kitchen already has materials prepped for 8)

4. **Increased back to 9**
   - `previouslyPrintedTotal` = 8 (derived from ledger)
   - Delta = 9 - 8 = 1
   - `item_updated`: `kitchenPrintedQty: 1` (writes to `order_events`)
   - `kitchen_print_enqueued`: `{ printer: "Kitchen 1", items: [{ orderItemId: 1, itemName: "Butter Naan", printedQty: 1 }] }` (writes to `order_events`)
   - Kitchen physically prints: "Butter Naan x1"
   - `kitchen_print_succeeded`: `{ printer: "Kitchen 1" }` (writes to `order_events`)

5. **Removed entirely**
   - `item_removed` (no `kitchenPrintedQty`). No `kitchen_print_enqueued` event.

### Event Sequence Per Operation

Each item mutation that triggers a kitchen print writes **three** `order_events` rows (happy path):

```
add item     → item_added + kitchen_print_enqueued + kitchen_print_succeeded  (3 rows)
increase qty → item_updated + kitchen_print_enqueued + kitchen_print_succeeded  (3 rows)
decrease qty → item_updated                                                   (1 row, no print)
remove item  → item_removed                                                   (1 row)
```

> If the printer fails, only `item_added`/`item_updated` + `kitchen_print_enqueued` are written (2 rows). The missing `kitchen_print_succeeded` signals a failed/pending print that can be retried.

Payment and refund write multiple rows:

```
pay (happy)    → paid + receipt_print_enqueued + receipt_print_succeeded              (3 rows)
refund (full)  → refund_issued + receipt_print_enqueued + receipt_print_succeeded + refunded  (4 rows)
refund (partial) → refund_issued + receipt_print_enqueued + receipt_print_succeeded   (3 rows)
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

### Pay Flow

`POST /orders/:id/pay` requires a `payments` array with at least one line:

```json
{
  "payments": [
    { "methodId": "card", "amountHalalas": 5000 },
    { "methodId": "cash", "amountHalalas": 3250, "tenderedHalalas": 10000 }
  ]
}
```

Validation (single transaction):
1. Order must be `open`.
2. Each `methodId` must exist and be enabled.
3. Each `amountHalalas` must be positive (> 0).
4. Sum of amounts must equal `order.totalHalalas` exactly.
5. No duplicate `methodId`.
6. Non-cash methods: `tenderedHalalas` absent/null.
7. Cash: `tenderedHalalas` (if present) ≥ `amountHalalas`. Change auto-computed.

Transaction writes:
1. `order_payments` rows (snapshot `method_title`)
2. Updates order to `paid`
3. `order_events` `paid` with payments breakdown
4. `order_events` `receipt_print_enqueued` with `kickDrawer: true` only if any cash payment `amountHalalas > 0`

### Cash Drawer Kick

`kickDrawer: true` only when a cash payment line has `amountHalalas > 0`. Card-only payments do not open the cash drawer. Previously, every pay always kicked the drawer.

### `order_payments` (Immutable Ledger)

`UNIQUE(order_id, method_id)` — at most one payment line per method per order. No `updated_at`/`updated_by` — insert-only immutable.

### Reports

- `paymentTotals` is an array of `{ methodId, methodTitle, totalHalalas }`, aggregated from `order_payments` via JOIN with `orders` filtered by `day_opening_id` and `status = 'paid'`. GROUP BY `methodId` only.
- Expected cash = `openingCashHalalas + SUM(amountHalalas WHERE methodId = 'cash')` (not total sales).

## Endpoint Summary

| Endpoint                                | Permission          |   POS SPA    | Android Tablet |
| --------------------------------------- | ------------------- | :----------: | :------------: |
| `POST /orders`                          | `create_order`      |     Yes      |      Yes       |
| `GET /orders`                           | none                |     Yes      |      Yes       |
| `GET /orders/:id`                       | none                |     Yes      |      Yes       |
| `GET /orders/:id/events`                | none                |     Yes      |       No       |
| `GET /orders/:id/events/verify`         | none                |     Yes      |       No       |
| `POST /orders/:id/items`                | `update_order`      |     Yes      |      Yes       |
| `PATCH /orders/:orderId/items/:itemId`  | `update_order`      |     Yes      |      Yes       |
| `DELETE /orders/:orderId/items/:itemId` | `delete_order_item` |     Yes      |      Yes       |
| `POST /orders/:id/pay`                  | `pay_order`         |   **Yes**    |     **No**     | Requires `{ payments: [{ methodId, amountHalalas, tenderedHalalas? }] }` body |
| `POST /orders/:id/refund`               | `refund_order`      |   **Yes**    |     **No**     |
| `GET /orders/:id/refunds`               | none                |     Yes      |       No       |
| `POST /orders/:id/void`                 | `void_order`        |   **Yes**    |     **No**     |
| `POST /orders/:id/print`                | `update_order`      | Receipt only |       No       |

> The Android app should only bind to endpoints for order creation and item management. The server enforces via permission guards; the Android client is a restricted UI surface.

## WebSocket Events

| Event                 | When                                                        |
| --------------------- | ----------------------------------------------------------- |
| `order.created`       | New order                                                   |
| `order.item.added`    | Item added (includes kitchen print)                         |
| `order.item.updated`  | Item qty/notes changed                                      |
| `order.item.removed`  | Item removed                                                |
| `order.paid`          | Payment completed                                           |
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

| Item                                   | Purpose                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `order_events` table                   | Unified immutable ledger: item mutations, kitchen prints, receipt prints, status transitions. |
| `OrderEventsService`                   | Hash-chain management, event creation, chain verification, `kitchen_printed_qty` derivation.  |
| `order_refunds` table                  | Refund transaction headers.                                                                   |
| `order_refund_items` table             | Individual items refunded per transaction.                                                    |
| `payment_methods` table                | Catalog of payment methods (cash, card, mada, etc.). Soft-delete via `enabled` flag. Slugs as TEXT PKs. |
| `order_payments` table                 | Immutable append-only payment ledger. One row per (order_id, method_id). Snapshots method_title. |
| `pay_order` permission on `user_roles` | New permission for payment operations (was guarded by `create_order`).                        |
| `PaymentMethodsModule`                 | CRUD for payment method catalog (admin only). Slugs generated from title, cash method locked.  |

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
