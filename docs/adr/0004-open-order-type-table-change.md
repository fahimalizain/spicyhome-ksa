# ADR 0004 — Open Order Type and Table Change

Date: 2026-08-01
Status: Accepted

## Context

Once an order is created on the POS, staff cannot correct a mistake or react to
a customer change of mind: the order type (Takeaway ↔ Dine-in) and table
selection are fixed for the life of the order (GitHub **Issue #109**). A guest
who arrives and wants to sit down, a takeaway that becomes a dine-in, or a
table move (e.g. after a table reassignment) all require voiding and recreating
the order, losing the item history and event chain. The controls are locked
after create.

We need the ability to switch the order type and (re)select a table on an
**open** order only, on the **POS only** (per the device-responsibilities rule,
Android remains order-item management only), with the same audit, occupancy,
and concurrency guarantees the rest of the order lifecycle already has.

## Decision

Introduce `PATCH /orders/:id` with body
`{ baseUpdatedAt, type, tableId? }` that updates type/table on an **open**
order, writes an audit event, and emits the standard `order.updated` realtime
event.

### API contract

| Topic        | Decision                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Clients      | POS only (the server endpoint still exists for any client with a valid JWT + `update_order`)           |
| When         | `orders.status === 'open'` only. Paid/voided/refunded orders return 400.                               |
| Permission   | Reuse `update_order`. No new permission.                                                               |
| Method/route | `PATCH /orders/:id`, body `{ baseUpdatedAt: number, type: 'dine_in' \| 'takeaway', tableId?: number }` |
| Response     | Full order with items and events, same shape as `GET /orders/:id` / `PUT /orders/:id/items/sync`       |
| No-op        | Same type + same table → 200 with current order; `updated_at` is NOT bumped; no event is written.      |

### Type/table semantics

- **→ Dine-in**: staff must pick a table first. The POS opens the table picker;
  a single PATCH is sent only after the pick, with `type: 'dine_in'` +
  `tableId`. `tableId` is required for `dine_in` — 400 if missing; table must
  exist and be active — 404 otherwise.
- **→ Takeaway**: one click. The server forces `table_id = null` (the table is
  released). A non-null `tableId` sent with `type: 'takeaway'` is **ignored**
  (force-null, issue D4) rather than rejected — resilience over pedantry.
- **Paid/voided/refunded orders**: never changed (status gate above).

### Occupancy

- Same rule and message as order creation (**Issue #28**):
  `Table already has an open order #<orderNo> (id <id>).`
- If another **open** order already occupies the target table → **409**,
  excluding the order being updated itself (an order may keep/re-select its own
  table — the exclude-self case is a no-op anyway).
- Check runs **inside** the update transaction.

### Concurrency (stale guard)

- `baseUpdatedAt` must equal `orders.updated_at`, same as the item sync
  (`PUT /orders/:id/items/sync`, issue #45 staged cart). Stale → **409** with
  the same conflict shape (`{ message, updatedAt }`).

### Audit

- New `AuditAction.TYPE_CHANGED = 'type_changed'` in
  `packages/shared/src/enums.ts`.
- One `order_events` row per change with payload:
  `{ fromType, toType, fromTableId, toTableId }`.
- The orders row is updated with the standard audit fields
  (`updated_at` / `updated_by`, integer Unix epoch / user id).

### Realtime

- Emit `order.updated` after a successful change (same event as item sync).
- Open-orders lists already refresh from `order.updated`; the OrderPage
  hydrates type/table/`updatedAt` from polling **only when the local cart is
  clean** — a dirty cart keeps the existing conflict-dialog path.

### Kitchen

- **No automatic kitchen ticket reprint** on type/table change. Item-level
  prints are unaffected; switching to dine-in does not re-send the menu to the
  kitchen.

## Consequences

### Positive

- Mistakes and customer changes are fixable without voiding/recreating orders.
- The event chain (`type_changed`) documents every type/table change with
  from/to values and the acting user, preserving the immutable audit ledger.
- Tables are released immediately when an order becomes takeaway, and
  occupancy checks keep the one-open-order-per-table invariant from #28.
- Reuses the existing `update_order` permission and the existing stale/conflict
  machinery — no new permission, no new concurrency model.

### Negative

- `PATCH /orders/:id` is a new endpoint surface; it must be kept in sync with
  OpenAPI drift checks and the generated clients (client-ts, client-kt types).
- The POS UI gains a small amount of logic (dirty-cart gating, in-flight
  meta-update state, occupancy exclude-self).

### Neutral / Mitigations

- The no-op path avoids needless `updated_at` churn and event writes, so
  mis-taps and double-taps do not invalidate other terminals' carts.
- POS-only by product decision, not by enforcement: the endpoint is available
  to any authenticated client with `update_order`; Android simply does not
  expose it in its UI.

## Non-goals (explicit)

- **Android UI** for type/table switching (deferred; device-responsibilities
  rule unchanged — Android remains order-item management only).
- **Kitchen reprint** on type/table change.
- **DB migration / partial unique indexes**: the one-open-order-per-table
  invariant continues to be enforced in application code (transactions), as
  today.
- **Changing type/table on non-open orders** (paid/voided/refunded are
  immutable for this feature).
- **New permissions**: reuses `update_order`.

## References

- GitHub Issue **#109** — switch Takeaway ↔ Dine-in (and table) on open orders
- GitHub Issue **#28** — one open order per table (occupancy invariant)
- GitHub Issue **#45** — staged cart (`baseUpdatedAt` concurrency guard)
- ADR 0002 — payment methods (audit-ledger and no-new-permission precedents)
