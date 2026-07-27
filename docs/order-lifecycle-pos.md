# Order Lifecycle — POS SPA Migration Plan

## Status

| Layer       | State                                                                           |
| ----------- | ------------------------------------------------------------------------------- |
| Server      | **Done** — see [`docs/order-lifecycle.md`](./order-lifecycle.md)                |
| POS SPA     | **Not started** — this document is the plan                                     |
| Android     | Out of scope (separate future migration)                                        |
| `client-ts` | Partial — generated OpenAPI types exist, hand-written wrapper needs new methods |

---

## Goals

1. Remove the `sent` status entirely from the POS SPA (server already removed it).
2. Replace explicit "Send to Kitchen" with automatic kitchen printing on item mutations.
3. Add full refund UI (primary surface: OrdersPage; also inline on OrderPage for paid orders).
4. Replace the legacy audit section on OrdersPage with a proper event timeline.
5. Add reprint capability (receipt + kitchen ticket).
6. Gate all privileged operations behind permissions from `getMe()`.
7. Make the cart server-synced for orders that exist (two-phase: local-only pre-order, server-synced post-order).
8. Wire new WebSocket events (`order.refund.issued`, `order.refunded`, `order.updated`).

## Non-Goals

- Android app migration (separate plan, separate worktree).
- Server-side changes except where micro-dependencies for POS (see Phase 0).
- ZATCA credit notes — handled separately by `docs/credit-notes-plan.md`.
- `docs/order-lifecycle.md` already covers: kitchen printing logic, event schema, hash-chain details, domain model. This doc only covers POS SPA + `client-ts` changes.

---

## Current vs Target UX

### Order Taking (OrderPage)

**BEFORE (current):**

| Step | Action                       | Details                                                                                                                                                                                                                                                | Issues                                                                                        |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1    | Select items on menu grid    | Cart (local-only via `useCart`)                                                                                                                                                                                                                        | —                                                                                             |
| 2    | "Create Order"               | `POST /orders` → sequential `addItem` calls → `GET /orders/:id` loadOrder                                                                                                                                                                              | —                                                                                             |
| 3    | Order exists (status `open`) | `currentOrder` set, `orderReadonly = status !== 'open'` evaluates to `false` → UI allows cart edits (add/update/remove). **BUT mutations stay local-only** — they never call `updateItem`/`removeItem`/`addItem` again. Server state diverges from UI. | **Critical bug**                                                                              |
| 4    | "Send to Kitchen"            | `POST /orders/:id/send` → status → `sent` (button rendered for `open` orders)                                                                                                                                                                          | Server endpoint **gone** — broken at runtime                                                  |
| 5    | From `sent`: Pay or Void     | Pay/Void buttons gated on `status === 'sent'`                                                                                                                                                                                                          | **Pay unreachable** (sent endpoint is dead); Void only reachable if order was previously sent |
| 6    | From `paid`: "New Order"     | Resets currentOrder to null                                                                                                                                                                                                                            | No refund UI, no reprint                                                                      |

Key observations:

- Kitchen prints are NOT automatic from POS side; the Send button triggers them (broken).
- No permission gates on any action.
- Cart mutations after order creation are local-only → server state diverges.
- No refund, no reprint capability anywhere.

**AFTER (target):**

```
1. Select items on menu grid → cart (local-only, identical to today)
2. "Create Order" → POST /orders → add items sequentially → each addItem
   triggers automatic kitchen print on server. Cart switches to server-synced mode.
3. Order status = "open". Cart mutations (add/update/remove/notes) hit server APIs
   with optimistic UI + full-order refetch on failure rollback.
4. Pay or Void available immediately from "open" — no intermediate "sent" step.
5. From "paid": Refund (inline modal) or New Order.
6. Reprint actions available via OrderActionBar.
```

### Order List / Detail (OrdersPage)

**BEFORE:**

- List of orders with status badges. WS subscriptions include `order.sent`.
- Detail pane: items, totals, and an "Audit Trail" section (shows `auditLog[].action` text + timestamp).
- No refund capability. No reprint. No permissions gating.

**AFTER:**

- List unchanged in structure. WS: drop `order.sent`, add `order.refund.issued`, `order.refunded`, `order.updated`.
- Detail pane gains:
  - **OrderActionBar** — Reprint Receipt (visibility gated by status + permission).
  - **RefundPanel** — accessible from `paid` status, inline within detail pane.
  - **OrderEventTimeline** — replaces raw audit trail with typed, labeled, formatted event list (types from `order_events`).
- All action buttons hidden (not disabled) when user lacks permission.

### Tables View (TablesViewPage)

**BEFORE:** Subscribes to `order.sent` WS event.
**AFTER:** Drop `order.sent` from WS subscriptions. Add `order.paid` and `order.voided` (already present), add `order.refund.issued`, `order.refunded` for correctness. Show relevant status/occupied indication based on new status model (tables with `open` orders are occupied; `paid`/`voided`/`refunded` free the table).

### Day / X-Report (DayPage)

**BEFORE:** X-report shows `sentOrderCount` at line 174-176.
**AFTER:** Remove the "Sent" row from the X-report display. Server-side `sentOrderCount` removal is a **follow-up** (not blocking POS), but POS must stop displaying it.

---

## Gap Inventory

Each item below represents a concrete discrepancy between current POS SPA code and the target state.

### P0 — Blockers (must ship in order lifecycle PR)

| #   | Gap                                                                                     | File:Line                                  | Severity |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------ | -------- |
| G1  | `handleSend()` exists, calls `client.orders.send()`                                     | `apps/pos/src/pages/OrderPage.tsx:147-159` | P0       |
| G2  | "Send to Kitchen" button rendered for `open` orders                                     | `apps/pos/src/pages/OrderPage.tsx:400-408` | P0       |
| G3  | Pay/Void gated on `sent` status, not available from `open`                              | `apps/pos/src/pages/OrderPage.tsx:419-436` | P0       |
| G4  | `client.orders.send()` method exists in hand-written wrapper                            | `packages/client-ts/src/client.ts:261-262` | P0       |
| G5  | `STATUS_LABELS` includes `sent: 'Sent'`                                                 | `apps/pos/src/pages/OrdersPage.tsx:10`     | P0       |
| G6  | WS subscribes to `order.sent`                                                           | `apps/pos/src/pages/OrdersPage.tsx:33`     | P0       |
| G7  | `.status-sent` CSS class present                                                        | `apps/pos/src/index.css:24-26`             | P0       |
| G8  | `client.orders` missing: `refund`, `getRefunds`, `getEvents`, `verifyEvents`, `reprint` | `packages/client-ts/src/client.ts:240-269` | P0       |
| G9  | `OrderPage` no refund capability at all — only "New Order" for paid                     | `apps/pos/src/pages/OrderPage.tsx:438-445` | P0       |

### P1 — Critical (user-facing regressions if not done)

| #   | Gap                                                                               | File:Line                                   | Severity |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------- | -------- |
| G10 | Cart mutations are local-only after order creation — server state diverges        | `apps/pos/src/pages/OrderPage.tsx:119-145`  | P1       |
| G11 | `CartItem` has no `orderItemId` — cannot track items back to server for mutations | `apps/pos/src/hooks/useCart.ts:5-12`        | P1       |
| G12 | `loadOrder()` maps `oi.itemId` to `itemId` but loses `oi.id` (the order item PK)  | `apps/pos/src/hooks/useCart.ts:167-182`     | P1       |
| G13 | No `usePermissions()` hook — all actions currently unprotected                    | P1                                          |
| G14 | OrdersPage "Audit Trail" renders raw `entry.action` strings, not typed events     | `apps/pos/src/pages/OrdersPage.tsx:185-197` | P1       |
| G15 | `OrdersPage` no refund UI                                                         | `apps/pos/src/pages/OrdersPage.tsx:131-198` | P1       |
| G16 | `TablesViewPage` subscribes to `order.sent`                                       | `apps/pos/src/pages/TablesViewPage.tsx:48`  | P1       |
| G17 | X-report displays `sentOrderCount`                                                | `apps/pos/src/pages/DayPage.tsx:174-176`    | P1       |

### P2 — Polish / Follow-up

| #   | Gap                                                                                            | File:Line                                  | Severity |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ | -------- |
| G18 | No reprint capability anywhere in POS                                                          | P2                                         |
| G19 | `verifyAuditChain` on client (legacy) — should become `verifyEvents`                           | `packages/client-ts/src/client.ts:246-247` | P2       |
| G20 | `OrderResponse.auditLog` uses legacy field name (server already populates from `order_events`) | P2                                         |
| G21 | No `order.updated` WS subscription on OrdersPage                                               | P2                                         |

---

## Architecture Decisions

These are settled. Do not re-litigate.

| ID      | Decision                                                  | Rationale                                                                                                                                                                                                                              |
| ------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | Two-phase cart: local pre-order, server-synced post-order | Pre-order must be rapid-fire; post-order mutations must hit server for kitchen prints. Optimistic UI with full-order refetch rollback.                                                                                                 |
| **D2**  | Create-empty-then-add-sequentially                        | Keep current OrderPage pattern. Each `addItem` triggers kitchen print. Capture `orderItemId` per line.                                                                                                                                 |
| **D3**  | `orderItemId` on `CartItem`                               | Extend `CartItem` with optional `orderItemId`. `loadOrder` maps `oi.id` → `orderItemId` and `oi.itemId` → `itemId`. Prefer server `addItem` returns `{ success, orderItemId }`; fallback to refetch if server change deferred.         |
| **D4**  | Remove "Send to Kitchen" entirely                         | No `sent` status. Pay and Void available from `open`. Kitchen prints auto-fired server-side on `addItem` + qty increase.                                                                                                               |
| **D5**  | `client-ts` must land before POS UI                       | Remove `orders.send`. Add `refund`, `getRefunds`, `getEvents`, `verifyEvents`, `reprint`. Deprecate `verifyAuditChain` (legacy `/audit/verify` still on server). Export new types.                                                     |
| **D6**  | Events timeline uses `GET /orders/:id/events`             | Do not rely on `OrderResponse.auditLog` for new UI. Server still returns it for backward compat; POS uses the dedicated events endpoint.                                                                                               |
| **D7**  | Refund primary surface                                    | Reusable `RefundPanel` + `useRefund` hook. Primary entry: OrdersPage detail. Also on OrderPage when `status === 'paid'` (inline modal). Permission: `refundOrder`.                                                                     |
| **D8**  | Reprint via `OrderActionBar`                              | Reprint Receipt (`paid`\|`refunded`). Permission: `updateOrder`. API: `POST /orders/:id/print { target: 'receipt' }`. Kitchen reprints are not supported; kitchen prints happen automatically on item add / qty increase only.         |
| **D9**  | Permissions: hide (not disable)                           | New `usePermissions()` from `getMe()`. Buttons without permission are not rendered. Safe default when `me` is null: hide privileged actions.                                                                                           |
| **D10** | WS events                                                 | Drop `order.sent`. Add `order.refund.issued`, `order.refunded`, and (on OrdersPage) `order.updated`.                                                                                                                                   |
| **D11** | DayPage: remove Sent row only                             | Server `sentOrderCount` cleanup is a follow-up. POS stops displaying it.                                                                                                                                                               |
| **D12** | Android out of scope                                      | Permission gates on POS SPA are sufficient for shared concepts. Android is a separate worktree.                                                                                                                                        |
| **D13** | Chrome 109                                                | No ES2022+ syntax. No `Array.fromAsync`, no `#private`, no top-level await (except Vite-bundled). Tailwind v3 only. `.touch-target` utility class for touch surfaces.                                                                  |
| **D14** | Money in integer halalas                                  | All calc in halalas; display via `halalasToSar()`. VAT-inclusive, decompose via `decomposeVat()`.                                                                                                                                      |
| **D15** | Server leftovers in POS plan                              | In-scope micro server deps: `addItem` returns `orderItemId` (recommended Phase 0). Document but defer: rename `auditLog` → `events` in `OrderResponse`, remove `sentOrderCount` from x-report schema, retire `/audit/verify` endpoint. |

---

## Target Component / Hook Design

### `useCart` Changes

**File:** `apps/pos/src/hooks/useCart.ts`

Current `CartItem` (lines 5–12):

```ts
export interface CartItem {
  itemId: number;
  name: string;
  unitPriceHalalas: number;
  vatRateBp: number;
  qty: number;
  notes: string;
}
```

Target `CartItem`:

```ts
export interface CartItem {
  itemId: number; // menu item ID (maps from OrderItemResponse.itemId)
  orderItemId?: number; // order_items.id — set only after server creates it
  name: string;
  unitPriceHalalas: number;
  vatRateBp: number;
  qty: number;
  notes: string;
}
```

`loadOrder()` fix (current lines 167–182):

```ts
// BEFORE (loses order line id):
const items: CartItem[] = (order.items || []).map((oi) => ({
  itemId: (oi.itemId as unknown as number) || 0,
  name: oi.itemName,
  unitPriceHalalas: oi.unitPriceHalalas,
  vatRateBp: oi.vatRateBp,
  qty: oi.qty,
  notes: (oi.notes as unknown as string) || '',
}));

// AFTER (preserves orderItemId):
const items: CartItem[] = (order.items || []).map((oi) => ({
  itemId: (oi.itemId as unknown as number) || 0,
  orderItemId: oi.id, // <-- NEW
  name: oi.itemName,
  unitPriceHalalas: oi.unitPriceHalalas,
  vatRateBp: oi.vatRateBp,
  qty: oi.qty,
  notes: (oi.notes as unknown as string) || '',
}));
```

New server-synced mutation methods added to `useCart` return type:

```ts
// Return type extends current with:
{
  // ... existing ...
  addItemServer: (orderId: number, item: ItemResponse, qty?: number) => Promise<CartItem>;
  updateQtyServer: (orderId: number, orderItemId: number, qty: number) => Promise<void>;
  removeItemServer: (orderId: number, orderItemId: number) => Promise<void>;
  updateNotesServer: (orderId: number, orderItemId: number, notes: string) => Promise<void>;
  refetchOrder: (orderId: number) => Promise<void>;
}
```

Each server-synced mutation:

1. Immediately apply optimistic update to local cart state.
2. Call server API.
3. On success: if `addItemServer`, capture `orderItemId` from response and write it back to the cart item.
4. On failure: call `refetchOrder(orderId)` to roll back to server state, display error to user.

### `usePermissions`

**New file:** `apps/pos/src/hooks/usePermissions.ts`

```ts
import { getMe } from '../api';

export interface Permissions {
  createOrder: boolean;
  updateOrder: boolean;
  deleteOrderItem: boolean;
  voidOrder: boolean;
  refundOrder: boolean;
  payOrder: boolean;
  manageMenu: boolean;
  manageTables: boolean;
  managePrinters: boolean;
  manageUsers: boolean;
  manageSettings: boolean;
}

const SAFE_DEFAULT: Permissions = {
  createOrder: false,
  updateOrder: false,
  deleteOrderItem: false,
  voidOrder: false,
  refundOrder: false,
  payOrder: false,
  manageMenu: false,
  manageTables: false,
  managePrinters: false,
  manageUsers: false,
  manageSettings: false,
};

export function usePermissions(): Permissions {
  const me = getMe();
  if (!me) return SAFE_DEFAULT;
  return {
    createOrder: me.createOrder,
    updateOrder: me.updateOrder,
    deleteOrderItem: me.deleteOrderItem,
    voidOrder: me.voidOrder,
    refundOrder: me.refundOrder,
    payOrder: me.payOrder,
    manageMenu: me.manageMenu,
    manageTables: me.manageTables,
    managePrinters: me.managePrinters,
    manageUsers: me.manageUsers,
    manageSettings: me.manageSettings,
  };
}
```

Usage pattern in components:

```tsx
const permissions = usePermissions();

// HIDE button if no permission (never disable):
{
  permissions.voidOrder && <button onClick={handleVoid}>Void Order</button>;
}
```

### `useRefund`

**New file:** `apps/pos/src/hooks/useRefund.ts`

```ts
// Return type:
{
  loading: boolean;
  error: string;
  refund: (orderId: number, items: { orderItemId: number; qty: number }[], reason?: string) =>
    Promise<void>;
  // Helper to compute remaining qty per order item given refund history:
  getRemainingQty: (originalQty: number, orderItemId: number, refunds: OrderRefundResponse[]) =>
    number;
}
```

Implementation: calls `client.orders.refund(orderId, { items, reason })`. On success clears error/loading. On failure sets error. Does NOT manage UI state — the `RefundPanel` owns item selection state.

### `OrderActionBar`

**New file:** `apps/pos/src/components/OrderActionBar.tsx`

Props:

```ts
interface OrderActionBarProps {
  orderId: number;
  status: string; // 'open' | 'paid' | 'voided' | 'refunded'
}
```

Renders action buttons conditionally:

| Action          | Visible When         | API Call                               | Permission    |
| --------------- | -------------------- | -------------------------------------- | ------------- |
| Reprint Receipt | `paid` or `refunded` | `client.orders.reprint(id, 'receipt')` | `updateOrder` |

Internal: calls `usePermissions()` and hides buttons without `updateOrder`.

### `RefundPanel`

**New file:** `apps/pos/src/components/RefundPanel.tsx`

Props:

```ts
interface RefundPanelProps {
  order: OrderResponse; // the full order (must have .items populated)
  onClose: () => void; // dismiss the panel
  onRefunded: () => void; // callback after successful refund to refresh order data
}
```

Design:

- Renders order items as a checklist. Each item shows: name, original qty, unit price, total. User enters qty to refund (max = `remainingQty`).
- `remainingQty = originalQty - sum of already-refunded qty for that orderItemId`.
- Computes refund totals as user edits qtys. Uses `decomposeVat()`.
- "Process Refund" button calls `useRefund().refund(...)`.
- Shows error/loading states inline.
- Must be placed in the OrdersPage detail pane and in OrderPage as an inline modal overlay.

### `OrderEventTimeline`

**New file:** `apps/pos/src/components/OrderEventTimeline.tsx`

Props:

```ts
interface OrderEventTimelineProps {
  orderId: number;
}
```

Fetches `GET /orders/:id/events` on mount. Renders each event as a timeline row:

```
┌─ paid ─────────────────────── 14:32 ─┐
│  Order paid. From: open               │
├─ item_added ───────────────── 14:30 ─┤
│  Zinger Burger x2 added (46.00 SAR)  │
├─ created ──────────────────── 14:28 ─┤
│  Dine-in order created. Table #3     │
└───────────────────────────────────────┘
```

Replaces the current raw audit section at `apps/pos/src/pages/OrdersPage.tsx:185-197`.

### OrderPage Mutation Wrappers

**File:** `apps/pos/src/pages/OrderPage.tsx`

The OrderPage must detect whether it's in pre-order mode (`currentOrder === null`) or post-order mode (`currentOrder` set, status `open`).

| User Action             | Pre-Order (local)                 | Post-Order (server-synced)                                                                |
| ----------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| Add item from menu grid | `cart.addItem(item)` (local)      | `cart.addItemServer(currentOrder.id, item)` → triggers kitchen print                      |
| Tap `+` on cart item    | `cart.updateQty(itemId, qty + 1)` | `cart.updateQtyServer(orderId, orderItemId, newQty)` → triggers kitchen print if increase |
| Tap `-` on cart item    | `cart.updateQty(itemId, qty - 1)` | `cart.updateQtyServer(orderId, orderItemId, newQty)`                                      |
| Tap `✕` remove          | `cart.removeItem(itemId)`         | `cart.removeItemServer(orderId, orderItemId)`                                             |

**Action buttons** (post-order, both pre- and post- gated by permission):

| Button          | Status                           | Permission                                |
| --------------- | -------------------------------- | ----------------------------------------- |
| Create Order    | No currentOrder                  | `createOrder`                             |
| Pay             | `open`                           | `payOrder`                                |
| Void            | `open`                           | `voidOrder`                               |
| Refund          | `paid`                           | `refundOrder` (→ opens RefundPanel modal) |
| Reprint Receipt | `paid` or `refunded`             | `updateOrder`                             |
| New Order       | `paid` or `voided` or `refunded` | none                                      |

> **Permission note:** Add item and update qty/notes use `updateOrder`. The remove (✕) button on a cart item maps to `deleteOrderItem` (server uses DELETE `/orders/:orderId/items/:itemId` which checks `delete_order_item`). Wire each cart action wrapper to the correct permission flag.

### Status → Available Actions Matrix

| Status      | Pay | Void | Refund | Reprint Receipt | Add/Edit Items |
| ----------- | :-: | :--: | :----: | :-------------: | :------------: |
| (pre-order) |  —  |  —   |   —    |        —        |  Yes (local)   |
| `open`      | Yes | Yes  |   —    |        —        |  Yes (server)  |
| `paid`      |  —  |  —   |  Yes   |       Yes       |       —        |
| `voided`    |  —  |  —   |   —    |        —        |       —        |
| `refunded`  |  —  |  —   |   —    |       Yes       |       —        |

> **Action surface split:**
>
> - **OrderPage** (full-screen order workspace): primary surface for Create Order, item mutations (add/update/qty/remove), Pay, Void, Refund (modal for paid orders), Reprint, and New Order. This is where staff do the work.
> - **OrdersPage detail pane** (list + detail): read-only view with EventTimeline, Refund, and Reprint. **No Pay or Void** — if staff need to continue an open order, they navigate to OrderPage via existing deep-link patterns (e.g., TablesView already deep-links with `orderId`).

### Permission Matrix

| Action                        | Permission Flag   | Hide If            |
| ----------------------------- | ----------------- | ------------------ |
| Create Order                  | `createOrder`     | `false`            |
| Add Item / Update Qty / Notes | `updateOrder`     | `false`            |
| Remove Item (DELETE)          | `deleteOrderItem` | `false`            |
| Pay                           | `payOrder`        | `false`            |
| Void                          | `voidOrder`       | `false`            |
| Refund                        | `refundOrder`     | `false`            |
| Reprint                       | `updateOrder`     | `false`            |
| Manage Menu                   | `manageMenu`      | not on these pages |
| Manage Tables                 | `manageTables`    | not on these pages |
| Manage Printers               | `managePrinters`  | not on these pages |
| Manage Users                  | `manageUsers`     | not on these pages |
| Manage Settings               | `manageSettings`  | not on these pages |

> **Rule**: Permissions default to `false` when `getMe()` returns `null`. This means: no action buttons render if the user data is missing (e.g., stale token, page reload before me-fetch). This is safe — once the app re-authenticates, buttons appear.

---

## API Contract (`client-ts` Changes)

### Endpoint Matrix

| API Call                                  | Method | Path                             | Returns                         | Current in client.ts | New?                             |
| ----------------------------------------- | ------ | -------------------------------- | ------------------------------- | -------------------- | -------------------------------- |
| `orders.list(status?, date?)`             | GET    | `/orders`                        | `OrderResponse[]`               | Yes (line 241)       | —                                |
| `orders.get(id)`                          | GET    | `/orders/:id`                    | `OrderResponse`                 | Yes (line 244)       | —                                |
| `orders.create(dto)`                      | POST   | `/orders`                        | `CreateOrderResponse`           | Yes (line 249)       | —                                |
| `orders.addItem(orderId, dto)`            | POST   | `/orders/:id/items`              | `{ success, orderItemId }`      | Yes (line 252)       | Return type extension            |
| `orders.updateItem(orderId, itemId, dto)` | PATCH  | `/orders/:orderId/items/:itemId` | `{ success }`                   | Yes (line 255)       | —                                |
| `orders.removeItem(orderId, itemId)`      | DELETE | `/orders/:orderId/items/:itemId` | `{ success }`                   | Yes (line 258)       | —                                |
| **`orders.send(orderId)`**                | POST   | `/orders/:id/send`               | —                               | Yes (line 261)       | **REMOVE**                       |
| `orders.pay(orderId)`                     | POST   | `/orders/:id/pay`                | `{ success, status }`           | Yes (line 264)       | —                                |
| `orders.void(orderId)`                    | POST   | `/orders/:id/void`               | `{ success, status }`           | Yes (line 267)       | —                                |
| **`orders.refund(orderId, dto)`**         | POST   | `/orders/:id/refund`             | `{ success, refundId, status }` | No                   | **NEW**                          |
| **`orders.getRefunds(orderId)`**          | GET    | `/orders/:id/refunds`            | `OrderRefundResponse[]`         | No                   | **NEW**                          |
| **`orders.getEvents(orderId)`**           | GET    | `/orders/:id/events`             | `OrderEventResponse[]`          | No                   | **NEW**                          |
| **`orders.verifyEvents(orderId)`**        | GET    | `/orders/:id/events/verify`      | `{ valid, brokenAt? }`          | No                   | **NEW**                          |
| **`orders.reprint(orderId, target)`**     | POST   | `/orders/:id/print`              | `{ success, errors }`           | No                   | **NEW**                          |
| `orders.verifyAuditChain(orderId)`        | GET    | `/orders/:id/audit/verify`       | `{ valid }`                     | Yes (line 246)       | **DEPRECATE** (keep, not remove) |

> The legacy `verifyAuditChain` is kept (maps to `/orders/:id/audit/verify`) for backward compat. New UI uses `verifyEvents`.

### New Type Exports

Add to `packages/client-ts/src/client.ts` exports:

```ts
export type AddOrderItemResponse = { success: boolean; orderItemId?: number };
export type RefundResponse = Schemas['RefundResponse']; // POST /orders/:id/refund response
export type OrderRefundResponse = Schemas['OrderRefundResponse']; // GET /orders/:id/refunds response
export type OrderEventResponse = Schemas['OrderEventResponse']; // if generated
export type ReprintOrderDto = Schemas['ReprintOrderDto']; // if generated
export type CreateRefundDto = Schemas['CreateRefundDto']; // if generated
```

> If the generated OpenAPI types do not include these (they may lag behind the actual server DTOs), define them inline in `client.ts` from the DTO source files.

### Method Signatures (Additions)

```ts
orders = {
  // ... existing methods (minus .send) ...

  refund: (
    orderId: number,
    dto: { items: { orderItemId: number; qty: number }[]; reason?: string },
  ) =>
    request<{ success: boolean; refundId: number; status: string }>(
      this.config,
      'POST',
      `/orders/${orderId}/refund`,
      dto,
    ),

  getRefunds: (orderId: number) => request<any[]>(this.config, 'GET', `/orders/${orderId}/refunds`),

  getEvents: (orderId: number) => request<any[]>(this.config, 'GET', `/orders/${orderId}/events`),

  verifyEvents: (orderId: number) =>
    request<{ valid: boolean; brokenAt?: number }>(
      this.config,
      'GET',
      `/orders/${orderId}/events/verify`,
    ),

  reprint: (orderId: number, target: 'receipt') =>
    request<{ success: boolean; errors: string[] }>(
      this.config,
      'POST',
      `/orders/${orderId}/print`,
      { target },
    ),
};
```

Also modify `addItem` return type from `SuccessResponse` to the extended shape:

```ts
addItem: (orderId: number, dto: AddOrderItemDto) =>
  request<{ success: boolean; orderItemId?: number }>(
    this.config, 'POST', `/orders/${orderId}/items`, dto,
  ),
```

### Remove

```ts
// DELETE this method entirely:
send: (orderId: number) => request<StatusResponse>(this.config, 'POST', `/orders/${orderId}/send`),
```

---

## Event Timeline Rendering Spec

### Event Type → Display Label Mapping

`GET /orders/:id/events` returns `OrderEventResponse[]`. Each event has `type`, `payload` (JSON string), `eventIdx`, `userId`, `createdAt`.

| `event.type`              | Label (en)           | Payload Fields to Display                                                                               |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `created`                 | Order Created        | `type` (dine_in/takeaway), `tableId`, `orderNo`                                                         |
| `item_added`              | Item Added           | `itemName`, `qty`, `unitPriceHalalas` × `totalHalalas`                                                  |
| `item_updated`            | Item Updated         | `itemName`, `oldQty` → `newQty`, `oldTotal` → `newTotal`, `kitchenPrintedQty` (show "printed N" if > 0) |
| `item_removed`            | Item Removed         | `itemName`, `oldQty`, `oldTotal`                                                                        |
| `kitchen_print_enqueued`  | Kitchen Print Queued | `printer`, list of items with `printedQty`                                                              |
| `kitchen_print_succeeded` | Kitchen Print OK     | `printer`                                                                                               |
| `receipt_print_enqueued`  | Receipt Print Queued | `printer`, `totalHalalas`                                                                               |
| `receipt_print_succeeded` | Receipt Print OK     | `printer`                                                                                               |
| `paid`                    | Order Paid           | `fromStatus` → `toStatus`                                                                               |
| `voided`                  | Order Voided         | `fromStatus` → `toStatus`                                                                               |
| `refund_issued`           | Refund Issued        | `refundId`, items list (`orderItemId`, `itemName`, `qty`, `totalHalalas`), `totalHalalas`, `reason`?    |
| `refunded`                | Fully Refunded       | `fromStatus` → `toStatus`                                                                               |

> Display `createdAt` as `HH:MM:SS` in Asia/Riyadh. Events listed newest-first (descending `eventIdx`). Print events that don't have a paired `_succeeded` show a ⚠ warning icon.

---

## Refund UX Spec

### Interaction Flow

```
OrdersPage detail → see "paid" status → Refund button visible
  → RefundPanel opens (inline, right side of detail pane)
    → Shows order items as a checklist:
       ┌─────────────────────────────────────────┐
       │  Refund for Order #42                   │
       │                                         │
       │  □ Butter Naan         5 × 1.15 = 5.75 │
       │    Refund: [ 2] /5   remaining: 5       │
       │  □ Zinger Burger       2 × 23.00 = 46.00│
       │    Refund: [ 0] /2   remaining: 2       │
       │                                         │
       │  Reason (optional): [____________]     │
       │                                         │
       │  Refund Total:  11.50 SAR               │
       │  (incl. VAT:     1.50 SAR)              │
       │                                         │
       │  [ Process Refund ]    [ Cancel ]       │
       └─────────────────────────────────────────┘
    → On success: toast, close panel, refetch order
    → On error: inline error message, panel stays open
```

### Remaining Qty Formula

```ts
function getRemainingQty(
  originalQty: number,
  orderItemId: number,
  refundResponses: Array<{
    items: Array<{ orderItemId: number; qty: number }>;
  }>,
): number {
  const alreadyRefunded = refundResponses.reduce((sum, refund) => {
    const match = refund.items.find((ri) => ri.orderItemId === orderItemId);
    return sum + (match ? match.qty : 0);
  }, 0);
  return originalQty - alreadyRefunded;
}
```

> Refund amounts use the **original order item price** (`unitPriceHalalas` from `OrderItemResponse`), not current menu prices. This is consistent with server-side behavior.

### Error States

| Error                 | Handling                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Order not paid        | Server returns 400. Show "Only paid orders can be refunded."                                         |
| Qty exceeds remaining | Show per-item validation inline before API call (computed client-side from `getRefunds()` response). |
| Network error         | Generic "Refund failed. Please try again."                                                           |
| Permission denied     | Button is hidden entirely — user never reaches this state.                                           |

### Layout Notes

- RefundPanel is rendered **inline** within the detail pane of OrdersPage (not a modal overlay — uses available horizontal space in the `w-1/2` detail pane).
- On OrderPage (full-screen), it renders as a fixed modal overlay, same style as the TablePicker modal at `OrderPage.tsx:452-481`.

---

## WebSocket Subscription Spec

### Changes Per Page

| Page               | Remove Subscription    | Add Subscription                                         | Keep                                                                                               |
| ------------------ | ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **OrdersPage**     | `order.sent` (line 33) | `order.refund.issued`, `order.refunded`, `order.updated` | `order.created`, `order.paid`, `order.voided`, `order.item.*`                                      |
| **TablesViewPage** | `order.sent` (line 48) | `order.refund.issued`, `order.refunded`                  | `order.created`, `order.paid`, `order.voided`, `order.item.*`                                      |
| **OrderPage**      | none (not subscribed)  | none currently needed                                    | `order.paid`, `order.voided` could be added to auto-update if another terminal pays the same order |

### WS Event → Action

| WS Event              | OrdersPage     | TablesViewPage | OrderPage                              |
| --------------------- | -------------- | -------------- | -------------------------------------- |
| `order.created`       | `loadOrders()` | `loadData()`   | —                                      |
| `order.paid`          | `loadOrders()` | `loadData()`   | —                                      |
| `order.voided`        | `loadOrders()` | `loadData()`   | —                                      |
| `order.refund.issued` | `loadOrders()` | `loadData()`   | if `currentOrder?.id` matches, refetch |
| `order.refunded`      | `loadOrders()` | `loadData()`   | if `currentOrder?.id` matches, refetch |
| `order.updated`       | `loadOrders()` | —              | —                                      |
| `order.item.added`    | `loadOrders()` | `loadData()`   | —                                      |
| `order.item.updated`  | `loadOrders()` | `loadData()`   | —                                      |
| `order.item.removed`  | `loadOrders()` | `loadData()`   | —                                      |

> `order.updated` on OrdersPage triggers a full list refresh — covers totals changes from item mutations on open orders. No dedicated OrderPage WS sub needed because OrderPage re-fetches on every server operation.

---

## Migration Phases

Each phase is independently shippable (mergeable to main, CI-passing).

### Phase 0 — Server Micro-Dep (if needed)

**Goal:** `addItem` returns `orderItemId` so POS doesn't need a refetch roundtrip after each add.

**Files touched:**

- `apps/server/src/modules/orders/orders.service.ts` line 276: change `return { success: true }` → `return { success: true, orderItemId }`.
- `apps/server/src/modules/orders/dto/success-response.dto.ts`: add optional `orderItemId` field.
- Re-generate OpenAPI types if using codegen, or manually update `AddOrderItemResponse`.

**Acceptance:** `POST /orders/:id/items` response includes `orderItemId`. POS can rely on this.

**Fallback:** If skipped, Phase 3 must call `client.orders.get(orderId)` after each `addItem` (1 extra roundtrip per item). Functional but wasteful. Specify in implementation notes.

### Phase 1 — `client-ts` Update

**Files touched:**

- `packages/client-ts/src/client.ts`
- `packages/client-ts/src/index.ts`
- `packages/client-ts/src/client.test.ts`

**Concrete steps:**

1. Remove `send()` method (currently lines 261–262).
2. Add `refund()`, `getRefunds()`, `getEvents()`, `verifyEvents()`, `reprint()` methods to `orders` namespace.
3. Change `addItem` return type from `SuccessResponse` → `{ success: boolean; orderItemId?: number }`.
4. In `index.ts`: export new types — `AddOrderItemResponse`, `RefundResponse`, `OrderRefundResponse`, `OrderEventResponse`.
5. In `client.test.ts`: remove the `send` method assertion (line 72: `expect(typeof client.orders.send).toBe('function')`). Add type/shape assertions for all 5 new methods.
6. Keep `verifyAuditChain` but add `@deprecated` JSDoc comment (maps to legacy `/audit/verify`).
7. Regenerate OpenAPI types **only if** Phase 0 changes `SuccessResponse` schema: run from workspace root `node_modules/.bin/openapi-typescript packages/api-spec/openapi.json -o packages/client-ts/src/generated/types.ts` (maps to the `generate-types` script in `packages/client-ts/package.json`). Otherwise skip — the new DTO types can be defined inline in `client.ts`.
8. `bazel test //packages/client-ts:test` must pass.

**Acceptance:**

```sh
bazel test //packages/client-ts:test
```

All new methods compile; `send` is gone from the `SpicyHomeClient` interface.

### Phase 2 — Remove "Sent" + Rewire Pay/Void from Open

**Files touched:**

- `apps/pos/src/pages/OrderPage.tsx`
- `apps/pos/src/pages/OrdersPage.tsx`
- `apps/pos/src/pages/TablesViewPage.tsx`
- `apps/pos/src/index.css`

**Concrete steps:**

1. **OrderPage.tsx:**
   - Delete `handleSend()` (lines 147–159).
   - Replace "open" action section (lines 400–416): remove "Send to Kitchen" button. Add Pay + Void buttons side by side.
   - Replace "sent" action section (lines 419–436): delete entirely (no `sent` status exists).
   - For `paid`/`voided`/new `refunded`: keep "New Order" button. Add Refund button for `paid` (Phase 6 will fill in — for now a placeholder or navigate to OrdersPage).
   - Update `currentOrder` type: status union becomes `'open' | 'paid' | 'voided' | 'refunded'` (no `sent`).

2. **OrdersPage.tsx:**
   - Remove `sent: 'Sent'` from `STATUS_LABELS` (line 10).
   - Remove `order.sent` WS subscription (line 33).
   - Add `order.refund.issued`, `order.refunded`, `order.updated` WS subscriptions.

3. **TablesViewPage.tsx:**
   - Remove `order.sent` WS subscription (line 48).
   - Add `order.refund.issued`, `order.refunded` WS subscriptions.

4. **index.css:**
   - Remove `.status-sent` rule (lines 24–26).

**Acceptance:**

- `grep -rn "status === 'sent'" apps/pos/src/` returns 0 hits.
- `grep -rn "'sent'" apps/pos/src/` returns 0 hits (covers STATUS_LABELS, type unions).
- `grep -rn "order\.sent" apps/pos/src/` returns 0 hits.
- `grep -rn "client\.orders\.send\b" apps/pos/src/` returns 0 hits.
- `grep -rn "handleSend" apps/pos/src/` returns 0 hits.
- `grep -rn "\.status-sent" apps/pos/src/` returns 0 hits.
- `grep -rn "order\.sent\b" apps/pos/src/realtime.ts` returns 0 hits (WS subscription).
- **Note:** Server-side `sentOrderCount` cleanup tracked in Phase 8.

### Phase 3 — Server-Synced Cart Mutations

**The hard part.** Must be correct; money path.

**Files touched:**

- `apps/pos/src/hooks/useCart.ts`
- `apps/pos/src/pages/OrderPage.tsx`

**Concrete steps:**

1. **`useCart.ts`:**
   - Add `orderItemId?: number` to `CartItem` interface.
   - Fix `loadOrder()` to map `oi.id` → `orderItemId`.
   - Add `addItemServer`, `updateQtyServer`, `removeItemServer`, `updateNotesServer`, `refetchOrder`.
   - Each mutation:
     ```ts
     // Pattern:
     // 1. Snapshot pre-optimistic state
     // 2. Apply optimistic update (dispatch to reducer)
     // 3. Call server API
     // 4. On success: capture orderItemId from addItem response, update cart
     // 5. On failure: refetch full order from GET /orders/:id, dispatch LOAD_ORDER with refetched data
     ```
   - `addItemServer` must handle the `orderItemId` in response:
     - If server returns `orderItemId`, update the cart item in-place.
     - If server does NOT (Phase 0 skipped), call `refetchOrder()` after each add.

2. **`OrderPage.tsx`:**
   - Add a wrapper function for each cart mutation that branches on `currentOrder`:
     ```tsx
     function handleAddItem(item: ItemResponse) {
       if (currentOrder && currentOrder.status === 'open') {
         cart.addItemServer(currentOrder.id, item);
       } else {
         cart.addItem(item);
       }
     }
     ```
   - Same pattern for `updateQty`, `removeItem`, `updateNotes` (notes need server API binding — today there's no explicit PATCH for notes; if the server exposes it through `updateItem`, use that).
   - Call `handleCreateOrder` updated: capture `orderItemId` from each `addItem` response.
   - Keep the existing local-only behavior when `currentOrder === null`.

**Acceptance:**

- Open an order. Add items. Increase qty. Remove item. All hit server APIs.
- Kitchen printers receive jobs automatically (server side effect of addItem).
- Network failure during mutation: cart reverts to server state, error displayed.
- `bazel test //apps/pos:test` and `//apps/server:test` pass.

### Phase 4 — Permissions Hook + Gate Buttons

**Files touched:**

- `apps/pos/src/hooks/usePermissions.ts` (new)
- `apps/pos/src/pages/OrderPage.tsx`
- `apps/pos/src/pages/OrdersPage.tsx`
- `apps/pos/src/components/OrderActionBar.tsx` (new)

**Concrete steps:**

1. Create `usePermissions.ts` as specified above.
2. In `OrderPage.tsx`: import `usePermissions`, wrap Pay, Void, future Refund buttons in permission checks.
3. In `OrdersPage.tsx`: wrap future Refund and Reprint buttons in permission checks.
4. In `OrderActionBar.tsx`: reprint buttons already gated.

**Acceptance:**

- Login with a role that does NOT have `payOrder` → Pay button hidden on OrderPage.
- Login with a role that has all perms → all buttons visible.
- `getMe()` returns null → all privileged buttons hidden (safe default).
- No tests broken.

### Phase 5 — Events Timeline

**Files touched:**

- `apps/pos/src/components/OrderEventTimeline.tsx` (new)
- `apps/pos/src/pages/OrdersPage.tsx`

**Concrete steps:**

1. Create `OrderEventTimeline.tsx`:
   - Fetch `GET /orders/:id/events` on mount.
   - Render as a vertical timeline with the label mapping from the spec above.
   - Show newest-first (reverse chronological).
   - Highlight broken print chains (enqueued without succeeded).
2. In `OrdersPage.tsx`: replace the audit section (lines 185–197) with `<OrderEventTimeline orderId={selectedOrder.id} />`.
3. Remove any direct references to `selectedOrder.auditLog` in the render.

**Acceptance:**

- Open a paid order → events show: created, item_added × N, kitchen_print_enqueued × N, kitchen_print_succeeded × N, paid, receipt_print_enqueued, receipt_print_succeeded.
- Timeline renders chronologically.
- `bazel test //apps/pos:test` passes.

### Phase 6 — Refund Flow

**Files touched:**

- `apps/pos/src/hooks/useRefund.ts` (new)
- `apps/pos/src/components/RefundPanel.tsx` (new)
- `apps/pos/src/pages/OrdersPage.tsx`
- `apps/pos/src/pages/OrderPage.tsx`

**Concrete steps:**

1. Create `useRefund.ts` hook.
2. Create `RefundPanel.tsx` component as specified.
3. In `OrdersPage.tsx`: add `<RefundPanel>` to the detail pane when `selectedOrder.status === 'paid'` and user clicks "Refund" button. Add "Refund" button gated by `permissions.refundOrder`.
4. In `OrderPage.tsx`: when `currentOrder.status === 'paid'`, render "Refund" button (gated by `permissions.refundOrder`). On click, open `RefundPanel` as a modal overlay.
5. On successful refund: refetch order data, close panel.

**Acceptance:**

- Login as manager (has `refundOrder`). Go to OrdersPage. Select a paid order. Click Refund. Select items and qtys. Process. Refund succeeds, order stays `paid` if partial or transitions to `refunded` if full.
- The refunded order shows correct status in list.
- Refund button hidden when `refundOrder === false`.
- `bazel test //apps/pos:test //apps/server:test` pass.

### Phase 7 — Reprint + OrderActionBar Consolidation

**Files touched:**

- `apps/pos/src/components/OrderActionBar.tsx` (new)
- `apps/pos/src/pages/OrdersPage.tsx`
- `apps/pos/src/pages/OrderPage.tsx`

**Concrete steps:**

1. Create `OrderActionBar.tsx` with reprint buttons as specified.
2. In `OrdersPage.tsx` detail pane: add `<OrderActionBar orderId={selectedOrder.id} status={selectedOrder.status} />` above the items list.
3. In `OrderPage.tsx`: add `OrderActionBar` below the totals section.

**Acceptance:**

- Open a paid order: "Reprint Receipt" visible (no Reprint Kitchen).
- Open an open order: nothing rendered (no reprint buttons).
- Voided/refunded orders: reprint buttons per matrix above.
- Reprint triggers server API, receipt prints, events written to ledger.
- `bazel test //apps/pos:test` passes.

### Phase 8 — WS + DayPage Cleanup + CSS

**Files touched:**

- `apps/pos/src/pages/OrdersPage.tsx`
- `apps/pos/src/pages/TablesViewPage.tsx`
- `apps/pos/src/pages/DayPage.tsx`
- `apps/pos/src/index.css`

**Concrete steps:**

1. OrdersPage WS: ensure all Phase 2 WS changes are in place (remove `order.sent`, add refund + updated events). This may already be done if Phase 2 was clean.
2. TablesViewPage WS: same WS changes.
3. DayPage: remove "Sent" row from X-report (lines 174–176). Keep the rest of the report structure.
4. index.css: ensure `.status-sent` CSS removed (Phase 2 may have done this).

**Note:** Server `sentOrderCount` field removal from x-report response is deferred. POS just stops displaying it; if the server still sends it, POS ignores it silently.

**Acceptance:**

- `grep -rn "order.sent" apps/pos/src/` returns 0 hits.
- `grep -rn "sentOrderCount" apps/pos/src/` returns 0 hits.
- X-report no longer shows Sent row; all other rows display correctly.
- Tables view correctly reflects occupied/free based on new statuses.

### Phase 9 — Tests

**Goal:** Ensure all new code is tested and no regressions.

**Files touched (all under `apps/pos/src/__tests__/` per existing POS convention):**

- `apps/pos/src/__tests__/cart.test.ts` (update existing)
- `apps/pos/src/__tests__/permissions.test.ts` (new)
- `apps/pos/src/__tests__/refund.test.tsx` (new)
- `apps/pos/src/__tests__/event-timeline.test.tsx` (new)
- `apps/pos/src/__tests__/order-action-bar.test.tsx` (new)
- Existing mocks to clean: `api.test.ts` (remove `send: vi.fn()`), `day.test.tsx` (remove `send: vi.fn()` + `sentOrderCount` fixture/assertion)

**Test categories:**

1. **Unit tests — `useCart`:**
   - `loadOrder` preserves `orderItemId` from `OrderItemResponse.id`.
   - `addItemServer` adds item, captures `orderItemId`, rollback on failure.
   - `updateQtyServer` updates qty, rollback on failure.
   - `removeItemServer` removes item, rollback on failure.

2. **Unit tests — `usePermissions`:**
   - Returns `SAFE_DEFAULT` (all false) when `getMe()` is null.
   - Returns correct booleans when `getMe()` returns data.
   - Each permission field is independently correct.

3. **Unit tests — `useRefund`:**
   - `getRemainingQty` computes correctly given multiple refunds.
   - `refund` calls correct API and returns success.

4. **Component tests:**
   - `OrderEventTimeline` renders events in reverse chronological order.
   - `RefundPanel` renders items, computes totals, handles selection.
   - `OrderActionBar` shows/hides buttons per status matrix.

5. **Regression tests:**
   - `bazel test //...` — full suite must pass.
   - Specifically verify: `//apps/pos:test`, `//packages/client-ts:test`, `//packages/shared:test`, `//apps/server:test`.

**Acceptance:**

```sh
bazel test //...
```

All 7 targets pass.

---

## File Change Checklist

| Path                                                         | Action           | Notes                                                                                                                                                                              |
| ------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/client-ts/src/index.ts`                            | Modify           | Re-export new types (`AddOrderItemResponse`, `RefundResponse`, `OrderRefundResponse`, `OrderEventResponse`)                                                                        |
| `packages/client-ts/src/client.ts`                           | Modify           | Remove `send`, add 5 new methods, update `addItem` return type                                                                                                                     |
| `packages/client-ts/src/client.test.ts`                      | Modify           | Drop `send` assertion (line 72), add assertions for new methods (`refund`, `getRefunds`, `getEvents`, `verifyEvents`, `reprint`)                                                   |
| `apps/pos/src/__tests__/api.test.ts`                         | Modify           | Remove `send: vi.fn()` mock from client mock                                                                                                                                       |
| `apps/pos/src/__tests__/day.test.tsx`                        | Modify           | Remove `send: vi.fn()` mock, remove `sentOrderCount` fixture + UI assertion                                                                                                        |
| `apps/pos/src/hooks/useCart.ts`                              | Modify           | Add `orderItemId`, server-synced mutation methods                                                                                                                                  |
| `apps/pos/src/hooks/usePermissions.ts`                       | Create           | Permission check hook                                                                                                                                                              |
| `apps/pos/src/hooks/useRefund.ts`                            | Create           | Refund API hook                                                                                                                                                                    |
| `apps/pos/src/components/OrderActionBar.tsx`                 | Create           | Reprint buttons                                                                                                                                                                    |
| `apps/pos/src/components/RefundPanel.tsx`                    | Create           | Refund item selection UI                                                                                                                                                           |
| `apps/pos/src/components/OrderEventTimeline.tsx`             | Create           | Typed event timeline                                                                                                                                                               |
| `apps/pos/src/pages/OrderPage.tsx`                           | Modify           | Remove send, rewire actions, add server-synced mutations, add refund modal                                                                                                         |
| `apps/pos/src/pages/OrdersPage.tsx`                          | Modify           | Remove sent label, WS changes, add events timeline, add refund panel, add action bar                                                                                               |
| `apps/pos/src/pages/TablesViewPage.tsx`                      | Modify           | WS subscription changes                                                                                                                                                            |
| `apps/pos/src/pages/DayPage.tsx`                             | Modify           | Remove sent row from X-report                                                                                                                                                      |
| `apps/pos/src/index.css`                                     | Modify           | Remove `.status-sent`                                                                                                                                                              |
| `apps/server/src/modules/orders/orders.service.ts`           | Modify (Phase 0) | `addItem` return `orderItemId`                                                                                                                                                     |
| `apps/server/src/modules/orders/dto/success-response.dto.ts` | Modify (Phase 0) | Add `orderItemId` field                                                                                                                                                            |
| `apps/server/src/client.contract.test.ts`                    | Modify (Phase 1) | If it calls `verifyAuditChain` (line 219), add note to keep — no `send` call present; ensure `refund`, `getRefunds`, `getEvents`, `verifyEvents`, `reprint` contract test coverage |

---

## Test Plan

### Unit Tests

| Module               | Test File                   | Key Scenarios                                                                                                                                                                           |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCart`            | `cart.test.ts`              | `loadOrder` preserves `orderItemId`; `addItemServer` success + rollback; `updateQtyServer` success + rollback; `removeItemServer` success + rollback; cart totals unchanged on rollback |
| `usePermissions`     | `permissions.test.ts`       | Null me → all false; valid me → correct booleans; each flag independently verified                                                                                                      |
| `useRefund`          | `refund.test.tsx`           | `getRemainingQty` with 0/1/multiple prior refunds; `refund()` calls API with correct payload; error handling on API failure                                                             |
| `OrderEventTimeline` | `event-timeline.test.tsx`   | Renders all event types with correct labels; newest first; missing `_succeeded` shows warning icon                                                                                      |
| `RefundPanel`        | `refund.test.tsx`           | Item list renders with correct remaining qty; qty inputs capped; totals compute correctly; process button calls hook                                                                    |
| `OrderActionBar`     | `order-action-bar.test.tsx` | Buttons show/hide per status; permission gate hides all when no `updateOrder`                                                                                                           |

### Component / Integration Tests (manual or future e2e)

1. **Happy flow — full order lifecycle on POS:**
   - Create order → add items → qty up (kitchen print) → qty down → remove item → pay → refund (full) → status `refunded`.
   - Verify: events timeline shows complete chain. WS events fire on OrdersPage list.
2. **Refund workflow:**
   - Partially refund a paid order → verify `paid` status retained.
   - Fully refund a paid order → verify `refunded` status.
3. **Permission gating:**
   - Login as role without `payOrder` → Pay hidden on OrderPage.
   - Login as role without `refundOrder` → Refund hidden on OrdersPage and OrderPage paid state.
4. **Network failure:**
   - Disconnect network before `addItem` on open order → rollback to pre-error state.
   - Refund failure → error shown in panel, panel stays open.

### Regression

```sh
bazel test //...  # all 7 targets
```

All must pass before merge.

---

## Acceptance Criteria (Master Checklist)

- [ ] `client.orders.send` removed from `SpicyHomeClient`.
- [ ] No `sent` literal string in `apps/pos/src/` (grep confirms).
- [ ] No `order.sent` WS subscription in any file.
- [ ] `.status-sent` CSS class removed.
- [ ] `STATUS_LABELS` in OrdersPage does not include `sent`.
- [ ] "Send to Kitchen" button removed from OrderPage.
- [ ] Pay and Void available from `open` status on OrderPage.
- [ ] Cart mutations on open orders hit server APIs (addItem, updateItem, removeItem).
- [ ] Optimistic update + rollback on failure works.
- [ ] `usePermissions()` hook gates all privileged actions (hide when false).
- [ ] `OrderEventTimeline` renders typed events in place of raw audit log.
- [ ] `RefundPanel` works: select items, set qtys, process refund, close on success.
- [ ] Refund button hidden when user lacks `refundOrder` permission.
- [ ] `OrderActionBar` renders Reprint Receipt per status matrix.
- [ ] Reprint buttons hidden when user lacks `updateOrder` permission.
- [ ] X-report no longer shows Sent row.
- [ ] WS subscriptions updated: `order.sent` removed; `order.refund.issued`, `order.refunded`, `order.updated` added (OrdersPage).
- [ ] TablesViewPage WS updated.
- [ ] `CartItem` has `orderItemId` field and `loadOrder` populates it.
- [ ] Server `addItem` returns `orderItemId` (Phase 0) or POS refetches after add (acceptable fallback).
- [ ] `bazel test //...` passes — all 7 targets green.
- [ ] Windows 7 compatibility: no ES2022+ syntax, no Chrome 109+ APIs, no Tailwind v4.

---

## Residual Risks & Follow-ups

| Risk                                | Description                                                                                        | Mitigation / Follow-up                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sentOrderCount` in server x-report | Server still returns this field in X-report response. POS ignores it (Phase 8).                    | File a server follow-up issue to remove from `XReportResponse` schema.                                                                                                 |
| `auditLog` field name               | `OrderResponse` has `.auditLog` backed by `order_events`. Server uses legacy name.                 | File a server follow-up to rename to `events` (breaking change — coordinate with Android and any other consumers).                                                     |
| `/audit/verify` endpoint            | Legacy endpoint exists server-side. POS uses new `/events/verify`.                                 | File a server follow-up to deprecate and eventually remove.                                                                                                            |
| Android tablet migration            | Android still expects `sent` status and `POST /orders/:id/send` (if it hasn't been migrated).      | Out of scope for this PR. Ensure Android worktree has its own migration plan. Server retains backward-compat stopgap for Android if needed.                            |
| Toast system                        | Refund success/failure messages currently use inline errors. No global toast component exists.     | Acceptable for initial release. File a polish issue for a `ToastProvider` component.                                                                                   |
| ZATCA credit notes                  | `docs/credit-notes-plan.md` covers server-side credit notes for refunds. POS doesn't display them. | Phase 6 (refund) doesn't need credit note awareness. File a follow-up to display "Credit Note" in events timeline when `refund_issued` relates to a ZATCA credit note. |
| Performance: `addItem` + refetch    | Without Phase 0, each item add requires a refetch (N+1).                                           | Phase 0 is recommended but not blocking. Acceptable for MVP with small order sizes (< 20 items).                                                                       |

---

## Out of Scope

- Android tablet migration (separate worktree, separate plan, separate PR).
- Server-side `sentOrderCount` removal from X-report schema (follow-up issue).
- Server-side `auditLog` → `events` rename in `OrderResponse` (follow-up issue).
- ZATCA credit note generation (see `docs/credit-notes-plan.md`).
- Menu / Tables / Printers / Users / Settings pages — not affected by order lifecycle changes.
- Login page — not affected.
- Global toast notification component (follow-up polish issue).
- Playwright e2e tests (planned but not yet implemented in the repo).
- `apps/pos` tests for existing pages that are not directly affected (e.g., SettingsPage, UsersPage, MenuPage).

---

## References

- [`docs/order-lifecycle.md`](./order-lifecycle.md) — server-side domain model, event types, state transitions, WS events, endpoint summary.
- [`docs/credit-notes-plan.md`](./credit-notes-plan.md) — ZATCA credit note design for refunds.
- [`AGENTS.md`](../AGENTS.md) — codebase conventions (Bazel, money, timezone, Chrome 109 cap, permissions).
- Server endpoints: `apps/server/src/modules/orders/orders.controller.ts` (169 lines).
- Server service: `apps/server/src/modules/orders/orders.service.ts` (1020 lines).
- Shared enums: `packages/shared/src/enums.ts` (55 lines).
- Shared types: `packages/shared/src/types.ts` (226 lines).
- POS pages: `apps/pos/src/pages/OrderPage.tsx` (484 lines), `OrdersPage.tsx` (202 lines), `TablesViewPage.tsx` (137 lines), `DayPage.tsx` (368 lines).
- POS hooks: `apps/pos/src/hooks/useCart.ts` (199 lines).
- POS CSS: `apps/pos/src/index.css` (35 lines).
- POS API client instantiation: `apps/pos/src/api.ts` (70 lines).
- POS realtime: `apps/pos/src/realtime.ts` (149 lines).
- Hand-written client wrapper: `packages/client-ts/src/client.ts` (375 lines).
- Generated types: `packages/client-ts/src/generated/types.ts` (~3036 lines).
