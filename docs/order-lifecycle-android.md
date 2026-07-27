# Order Lifecycle — Android Tablet Migration Plan

## Status

| Layer       | State                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server      | **Done** — see [`docs/order-lifecycle.md`](./order-lifecycle.md)                                                                                                                                  |
| POS SPA     | Separate plan — [`docs/order-lifecycle-pos.md`](./order-lifecycle-pos.md)                                                                                                                         |
| Android     | **Not started** — THIS document is the plan                                                                                                                                                       |
| `client-kt` | Generated OpenAPI client already has modern order APIs (no `/send`). Has pay/void/refund/print APIs that Android must NOT wrap for UI use. `AddOrderItemResponse` already includes `orderItemId`. |

---

## Critical Product Constraint

From [`AGENTS.md`](../AGENTS.md) and [`docs/order-lifecycle.md`](./order-lifecycle.md):

> **Android Tablet**: Order item management only — create orders, add/update/remove items. **No payments, no refunds, no void, no reprints, no administrative functions.** The Android app must not expose payment, refund, or admin endpoints in its UI.

Android must **never** call or surface: `POST /pay`, `POST /void`, `POST /refund`, `POST /print`, day open/close, menu/tables/printers/users/settings management.

Kitchen printing is **automatic server-side** on item add / qty increase — Android does not have a "Send to Kitchen" step and must not invent one.

---

## Current Codebase Facts

_Verified file:line references — use these exact locations when implementing._

### Status of Layers

| Layer       | State                                                                                                                                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server      | **Done** — `docs/order-lifecycle.md`                                                                                                                                                                                                                                                                                    |
| POS SPA     | Separate plan — `docs/order-lifecycle-pos.md`                                                                                                                                                                                                                                                                           |
| Android     | **Not started** — THIS document                                                                                                                                                                                                                                                                                         |
| `client-kt` | Generated OpenAPI client already has modern order APIs (no `/send`). Has pay/void/refund/print APIs that Android must NOT wrap for UI use. `AddOrderItemResponse` already includes `orderItemId`. `OrdersApi.kt:39` returns `Call<AddOrderItemResponse>` with `orderItemId: Long` field (`AddOrderItemResponse.kt:37`). |

### Current UX Flow (OrderScreen / OrderViewModel)

**BEFORE (current):**

1. `SELECTING_TYPE` — dine-in/takeaway + table pick (`OrderScreen.kt` `TypeSelectionPanel` 92–185; `OrderViewModel` screen states 39–45)
2. `BUILDING_ORDER` — local cart only via `addToCart`/`increaseQty`/`decreaseQty`/`removeFromCart`/`updateItemNotes` (`OrderViewModel.kt` 247–297). Cart has **no** `orderItemId`.
3. "Create Order" → `POST /orders` then sequential `addItem` for each cart line (`createOrder` 311–360, `addCartItemsToOrder` 362–396). Each successful `addItem` already triggers kitchen print on server. **Response `orderItemId` is ignored.**
4. `ORDER_CREATED` — read-only list of server items + **"New Order" only** (`OrderCreatedPanel` 479–564). **No add/update/remove after create.** **No continue-editing.**
5. `payOrder()` still exists in ViewModel (415–441) and Repository (63–65) but is **not bound in `OrderCreatedPanel` UI** (dead code / hazard).
6. `ORDER_PAID` panel still exists (`OrderScreen` 567–597) for post-pay UX that Android must not own.
7. Opening existing order via nav `order?tableId=&orderId=` loads order into `ORDER_CREATED` with `currentOrder` set but **does not hydrate cart** and provides **no edit UI** (`applyInitialTableContext` 134–170; test at `OrderViewModelTest.kt` 328–369).
8. Tables correctly list `status=open` only (`TablesViewModel.kt` 72–74) and deep-link to order with `orderId` (`NavGraph.kt` 121–125; `TablesScreen.kt` 124).
9. Orders list is read-only detail; still colors `"sent"` status (`OrdersScreen.kt` 132–137, 213–218) using `StatusSent` (`Color.kt` 18).
10. WS: `OrdersViewModel` and `TablesViewModel` refresh on any `event.type.startsWith("order.")` — no explicit `order.sent` filter (good), but tests still use `order.sent` fixture (`RealtimeClientTest.kt` ~79).
11. Permissions: `MeResponse` has `createOrder`, `updateOrder`, `deleteOrderItem`, `voidOrder`, `refundOrder`, `payOrder` etc. (`client-kt` `MeResponse.kt` 65–96). `AuthRepository.getMe()` exists (`AuthRepository.kt:16–18`) but order UI never gates on permissions.
12. `DayNotOpenPanel` is a stub: opening cash `onValueChange = {}`, Open Day button `onClick = { }` (`OrderScreen.kt` 600–668). Android must **not** open business days — redirect/message only.
13. README still says "create/send/pay" (`apps/android/README.md` line 117).
14. Money: `MoneyFormatter` uses integer halalas + `decomposeVat` half-up (`MoneyFormatter.kt` 1–41) — keep this pattern.
15. No `sent` send API in client-kt `OrdersApi` (already gone). Repository still has `payOrder`/`voidOrder` (`OrderRepository.kt` 63–69).

### CartItem Current

`OrderViewModel.kt:28–32`:

```kotlin
data class CartItem(
    val item: ItemResponse,
    val qty: Int = 1,
    val notes: String = "",
)
```

Missing: `orderItemId: Long?`

### OrderRepository Current Methods

Has: `createOrder`, `getOrder`, `listOrders`, `addItem`, `updateItem`, `removeItem`, **`payOrder`**, **`voidOrder`** (`OrderRepository.kt` 1–70)

Missing (and must stay missing for Android UI): refund, getRefunds, getEvents, verify, reprint

Must remove: `payOrder`, `voidOrder` from repository + ViewModel + tests that assert them as part of Android lifecycle

### Navigation

- Routes: `setup → login → order` (with optional `tableId`/`orderId`) `→ orders | tables`
- `NavGraph.kt` 85–128

### Generated client-kt `OrdersApi`

`OrdersApi.kt` 26–216 has all endpoints. `ordersControllerPayOrder` (lines 117–119) and `ordersControllerVoidOrder` (lines 213–214) exist as interface methods — Android must **not** call them from any UI flow. The repository's thin wrappers around these must be removed.

---

## Goals

1. Align Android with server order lifecycle: statuses `open | paid | voided | refunded` only — **no `sent`**.
2. Two-phase cart: local pre-order; server-synced post-order (same spirit as POS D1).
3. After order exists and is `open`, all add/update qty/notes/remove hit server APIs so kitchen prints fire automatically.
4. Opening an existing open order (from Tables) hydrates cart with `orderItemId` and allows full item editing.
5. **Strip all payment/void/refund/reprint/day-admin surfaces** from Android (UI + repository wrappers + ViewModel methods + dead panels).
6. Gate create/update/delete behind permissions from `getMe()` (hide when false; safe default all false).
7. Status badges: remove `sent`; add `refunded` styling.
8. WS: Order screen should react when another terminal pays/voids/refunds/updates the same order (refetch; go read-only if no longer open).
9. Fix DayNotOpen UX: informative only — no Open Day admin action on tablet.
10. Tests mandatory for every changed module; `bazel test //apps/android:unit_tests` must pass.

---

## Non-Goals

- POS SPA changes (see [`docs/order-lifecycle-pos.md`](./order-lifecycle-pos.md)).
- Server changes (already done). Do not plan server work unless a true micro-dep is discovered (unlikely — `orderItemId` already returned).
- ZATCA, receipts, refunds, voids, day open/close, menu/user admin on Android.
- Events timeline / audit UI on Android (POS-only).
- Regenerating `client-kt` just to hide pay endpoints (generated client may still contain them; Android simply must not call them). Optional follow-up: thin `OrderRepository` surface that only exposes allowed methods.

---

## Architecture Decisions

_These are settled. Do not re-litigate._

| ID      | Decision                                                                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | Two-phase cart: local pre-order, server-synced when `currentOrder?.status == "open"`                                                                                                                                                         | Kitchen prints only fire on server mutations                                                                                                                                                                                          |
| **D2**  | Create-empty-then-add-sequentially (keep pattern)                                                                                                                                                                                            | Matches today; each `addItem` → kitchen print; capture `orderItemId` from `AddOrderItemResponse`                                                                                                                                      |
| **D3**  | `orderItemId: Long?` on `CartItem`                                                                                                                                                                                                           | Required for PATCH/DELETE; map from `OrderItemResponse.id` on hydrate                                                                                                                                                                 |
| **D4**  | No "Send to Kitchen" ever on Android                                                                                                                                                                                                         | Server auto-prints; no sent status                                                                                                                                                                                                    |
| **D5**  | **Hard ban** on pay/void/refund/print/day-admin from Android                                                                                                                                                                                 | Device responsibility rule                                                                                                                                                                                                            |
| **D6**  | `ORDER_CREATED` merges into `BUILDING_ORDER`-like workspace when open                                                                                                                                                                        | Single editable workspace: menu grid + cart for open orders; terminal statuses show read-only summary + New Order                                                                                                                     |
| **D7**  | Screen state model simplification                                                                                                                                                                                                            | Target enum: `SELECTING_TYPE \| EDITING_ORDER \| ORDER_TERMINAL \| DAY_NOT_OPEN` where `EDITING_ORDER` covers both pre-create local cart and post-create server cart; `ORDER_TERMINAL` for paid/voided/refunded viewed from deep-link |
| **D8**  | Optimistic UI + full-order refetch rollback on failure                                                                                                                                                                                       | Same as POS                                                                                                                                                                                                                           |
| **D9**  | Permissions: hide not disable; only `createOrder`, `updateOrder`, `deleteOrderItem` matter on Android                                                                                                                                        | Safe default false when me null                                                                                                                                                                                                       |
| **D10** | WS on `OrderViewModel` when `currentOrderId` set: on matching order events refetch; if status leaves `open`, switch to read-only terminal UI                                                                                                 | Multi-terminal safety (POS may pay while tablet edits)                                                                                                                                                                                |
| **D11** | Orders list remains read-only (no pay/void/refund). Optional: "Continue" button for `open` orders → navigate to order route with `orderId`                                                                                                   | Staff continue work on Order screen                                                                                                                                                                                                   |
| **D12** | Tables: keep open-only occupancy; deep-link unchanged                                                                                                                                                                                        | Already correct model                                                                                                                                                                                                                 |
| **D13** | Money stays integer halalas via `MoneyFormatter`                                                                                                                                                                                             | [AGENTS.md](../AGENTS.md)                                                                                                                                                                                                             |
| **D14** | DayNotOpen: message + Back only; remove fake Open Day controls                                                                                                                                                                               | Admin is POS-only                                                                                                                                                                                                                     |
| **D15** | `client-kt`: do not remove generated pay methods; remove Android wrappers only                                                                                                                                                               | Generated code is shared surface                                                                                                                                                                                                      |
| **D16** | Server-synced "add from menu": if an open-order cart line already exists for that `item.id` with non-null `orderItemId`, call `updateQtyServer(orderItemId, qty+1)` instead of `POST addItem`. Only `POST addItem` when no such line exists. | Matches local cart merge UX; one kitchen delta print for qty increase; avoids duplicate lines                                                                                                                                         |
| **D17** | Pre-order local cart mutations are not permission-gated. Only "Create Order" requires `createOrder`. Post-order server mutations require `updateOrder` / `deleteOrderItem`.                                                                  | Staff must assemble a cart before create; server enforces create_order on POST /orders                                                                                                                                                |

---

## Gap Inventory

Each item represents a concrete discrepancy between current Android code and the target state. All file paths are relative to `apps/android/app/src/`.

### P0 — Blockers / Safety

| #       | Gap                                                                                  | File:Line                                                                                       | Severity |
| ------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------- |
| **G1**  | `payOrder()` in `OrderViewModel` — dead code that must not exist on Android          | `main/java/.../ui/order/OrderViewModel.kt:415-441`                                              | P0       |
| **G2**  | `payOrder`/`voidOrder` in `OrderRepository` — must remove                            | `main/java/.../data/repository/OrderRepository.kt:63-69`                                        | P0       |
| **G3**  | `ORDER_PAID` screen state + `OrderPaidPanel` — post-pay UX that Android must not own | `main/java/.../ui/order/OrderViewModel.kt:43`; `OrderScreen.kt:45,567-597`                      | P0       |
| **G4**  | `OrderCreatedPanel` is dead-end: no item mutations after create                      | `main/java/.../ui/order/OrderScreen.kt:479-564`                                                 | P0       |
| **G5**  | Cart mutations never call server after create; create ignores `orderItemId`          | `main/java/.../ui/order/OrderViewModel.kt:247-297,362-396`                                      | P0       |
| **G6**  | `CartItem` lacks `orderItemId`                                                       | `main/java/.../ui/order/OrderViewModel.kt:28-32`                                                | P0       |
| **G7**  | Opening existing open order does not hydrate editable cart                           | `main/java/.../ui/order/OrderViewModel.kt:134-170`                                              | P0       |
| **G8**  | `"sent"` status color branches in orders list and detail                             | `main/java/.../ui/orders/OrdersScreen.kt:134-135,215-216`; `main/java/.../ui/theme/Color.kt:18` | P0       |
| **G9**  | README claims send/pay flow                                                          | `apps/android/README.md:117`                                                                    | P0       |
| **G10** | `DayNotOpenPanel` pretends to open day with cash field + Open Day button             | `main/java/.../ui/order/OrderScreen.kt:600-668`                                                 | P0       |
| **G11** | `OrderRepositoryTest` asserts pay/void lifecycle                                     | `test/.../data/repository/OrderRepositoryTest.kt:156-197`                                       | P0       |

### P1 — Critical UX

| #       | Gap                                                                                          | File:Line                                                                                                                                                                   | Severity |
| ------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **G12** | No server-synced add/update/remove/notes methods on `OrderViewModel`                         | `main/java/.../ui/order/OrderViewModel.kt` — only local cart methods exist (247–297); no `addItemServer`, `updateQtyServer`, `removeItemServer`, `updateNotesServer`        | P1       |
| **G13** | No permission gating on create/update/delete                                                 | `main/java/.../ui/order/OrderScreen.kt` — none of the buttons or actions call `getMe()` or check permissions                                                                | P1       |
| **G14** | `OrderViewModel` not subscribed to `RealtimeClient`                                          | `main/java/.../ui/order/OrderViewModel.kt` — no `RealtimeClient` in constructor or init; compare with `OrdersViewModel` (31-33, 48-54) and `TablesViewModel` (32-33, 51-57) | P1       |
| **G15** | Orders detail has no Continue for open orders                                                | `main/java/.../ui/orders/OrdersScreen.kt` `OrderDetailView` (187–333) — read-only detail only                                                                               | P1       |
| **G16** | No `refunded` status color                                                                   | `main/java/.../ui/theme/Color.kt` — only `StatusOpen`, `StatusSent`, `StatusPaid`, `StatusVoided` (17-20)                                                                   | P1       |
| **G17** | Partial `addCartItemsToOrder` failure leaves inconsistent state without full refetch hydrate | `main/java/.../ui/order/OrderViewModel.kt:362-396` — on `hasError`, only sets `ORDER_CREATED` + error string; no refetch                                                    | P1       |

### P2 — Polish

| #       | Gap                                                                  | File:Line                                                                                                | Severity |
| ------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| **G18** | `RealtimeClientTest` fixture uses `order.sent`                       | `test/.../data/realtime/RealtimeClientTest.kt:79` — update fixture to `order.paid` or `order.item.added` | P2       |
| **G19** | VAT label hardcodes "VAT (15%)" in cart                              | `main/java/.../ui/order/OrderScreen.kt:380`                                                              | P2       |
| **G20** | No notes editing UI in cart rows (method exists, no Compose binding) | `main/java/.../ui/order/OrderScreen.kt` `CartItemRow` 433–476 — no notes field or edit affordance        | P2       |
| **G21** | `auditLog` on `OrderResponse` unused (fine — leave unused)           | P2                                                                                                       |

---

## Target UX

### Happy Path — New Order

```
1. Select type (+ table if dine-in) → EDITING_ORDER local cart
2. Add/remove/qty/notes locally (fast)
3. Create Order → POST /orders → sequential addItem (kitchen prints each) → capture orderItemId from each AddOrderItemResponse
4. Cart switches to server-synced mode; user can keep adding items from menu grid (addItemServer), change qty (updateQtyServer), remove (removeItemServer)
5. When done: New Order (or navigate away). Payment happens on POS SPA only.
6. If POS pays/voids while tablet has order open: WS → refetch → read-only terminal summary
```

### Continue Open Order (Tables)

```
Tables → tap occupied table → order?tableId=X&orderId=Y
→ GET /orders/Y → if status open: hydrate cart from items (orderItemId=item.id, resolve menu ItemResponse by itemId for price/name, OR build cart from OrderItemResponse snapshots if menu item missing)
→ EDITING_ORDER server-synced
→ if status not open: ORDER_TERMINAL read-only
```

### Status → Available Actions (Android Only)

| Status      | Add/Edit Items | Create |  Pay   |  Void  | Refund | Reprint | New Order |
| ----------- | :------------: | :----: | :----: | :----: | :----: | :-----: | :-------: |
| (pre-order) |  Yes (local)   |  Yes   |   —    |   —    |   —    |    —    |     —     |
| `open`      |  Yes (server)  |   —    | **No** | **No** | **No** | **No**  |    Yes    |
| `paid`      |       No       |   —    |   No   |   No   |   No   |   No    |    Yes    |
| `voided`    |       No       |   —    |   No   |   No   |   No   |   No    |    Yes    |
| `refunded`  |       No       |   —    |   No   |   No   |   No   |   No    |    Yes    |

### Permission Matrix (Android)

Per D17, pre-order local cart mutations (add, qty, remove) are **not** permission-gated. Only the "Create Order" button requires `createOrder`. Post-order server mutations require `updateOrder` / `deleteOrderItem`.

| Action                                    | Permission         | Hide if false | Phase                  |
| ----------------------------------------- | ------------------ | :-----------: | ---------------------- |
| Pre-order: add / qty / remove / notes     | none               | never hidden  | local cart only        |
| Create Order                              | `createOrder`      |      yes      | pre-order → post-order |
| Post-order: add item / update qty / notes | `updateOrder`      |      yes      | server-synced          |
| Post-order: remove item                   | `deleteOrderItem`  |      yes      | server-synced          |
| Pay / Void / Refund / Reprint / Admin     | N/A — never render | always hidden | never on Android       |

### Endpoint Allowlist (Android May Call)

| Endpoint                   | Permission          | Use              |
| -------------------------- | ------------------- | ---------------- |
| `POST /orders`             | `create_order`      | Create           |
| `GET /orders`              | none                | List             |
| `GET /orders/:id`          | none                | Detail / hydrate |
| `POST /orders/:id/items`   | `update_order`      | Add              |
| `PATCH .../items/:itemId`  | `update_order`      | Qty/notes        |
| `DELETE .../items/:itemId` | `delete_order_item` | Remove           |
| `GET /auth/me`             | auth                | Permissions      |
| `GET /tables`              | none                | Tables view      |
| `GET /menu/*`              | none                | Menu             |
| `WS /ws`                   | auth                | Realtime         |

### Endpoint Denylist (Must Not Call from Android App Code)

`pay`, `void`, `refund`, `print`, `events`, `events/verify`, `refunds`, day open/close, printers admin, users, settings mutations, menu mutations, table mutations

---

## Target Design Details

### Single `AuthProvider` / Permissions Holder

The app currently has no centralized user/permission state beyond `PreferencesManager` (token/URL only — `PreferencesManager.kt` 16-19) and `SessionManager` (unauthorized flow — `SessionManager.kt` 1-36). The simplest path is:

- Add `getMe()` call + `MeResponse` caching to `SessionManager` or a new lightweight `UserSession` holder.
- **Recommendation**: Create a `SessionState` data class held in `SessionManager` (or a new `UserSession` class stored on `SpicyHomeApp`). Fetch `getMe()` once after login success (in `LoginViewModel` or `NavGraph`'s `onLoginSuccess` callback). Store the `MeResponse` and expose a `Flow<Permissions>` computed property.
- `OrderViewModel` reads permissions from this holder. Safe default: all false when no me data.

Alternative lighter-weight approach (used in current codebase style): `OrderViewModel` fetches me directly in init. This avoids cross-VM coordination but adds one extra call. Preferred for simplicity:

```kotlin
// In OrderViewModel init:
viewModelScope.launch {
    val authRepo = AuthRepository(apiClientProvider.createAuthApi(baseUrl, bearerToken))
    try {
        val meResponse = withContext(ioDispatcher) { authRepo.getMe().execute() }
        if (meResponse.isSuccessful) {
            _uiState.value = _uiState.value.copy(permissions = Permissions.from(meResponse.body()))
        }
    } catch (_: Exception) { /* permissions stay default (all false) */ }
}
```

Add `Permissions` data class in same file or a new `Permissions.kt` helper:

```kotlin
data class Permissions(
    val createOrder: Boolean = false,
    val updateOrder: Boolean = false,
    val deleteOrderItem: Boolean = false,
    val voidOrder: Boolean = false,
    val refundOrder: Boolean = false,
    val payOrder: Boolean = false,
    val manageMenu: Boolean = false,
    val manageTables: Boolean = false,
    val managePrinters: Boolean = false,
    val manageUsers: Boolean = false,
    val manageSettings: Boolean = false,
) {
    companion object {
        fun from(me: MeResponse?): Permissions {
            if (me == null) return Permissions()
            return Permissions(
                createOrder = me.createOrder,
                updateOrder = me.updateOrder,
                deleteOrderItem = me.deleteOrderItem,
                voidOrder = me.voidOrder,
                refundOrder = me.refundOrder,
                payOrder = me.payOrder,
                manageMenu = me.manageMenu,
                manageTables = me.manageTables,
                managePrinters = me.managePrinters,
                manageUsers = me.manageUsers,
                manageSettings = me.manageSettings,
            )
        }
    }
}
```

### CartItem Target

`OrderViewModel.kt` (replacing lines 28–32):

```kotlin
data class CartItem(
    val item: ItemResponse,          // menu item snapshot (or synthesized from OrderItemResponse if menu item deleted)
    val orderItemId: Long? = null,   // order_items.id — set only after server creates it; null = local-only cart item
    val qty: Int = 1,
    val notes: String = "",
)
```

Hydrate from `OrderItemResponse`:

- `orderItemId = oi.id`
- `qty`, `notes` from `oi`
- `item`: match menu by `oi.itemId`; if missing, synthesize `ItemResponse`-like display from snapshots (`itemName`, `unitPriceHalalas` as `priceHalalas`, `vatRateBp`)

### OrderScreenState Target

`OrderViewModel.kt` (replacing lines 39–45):

```kotlin
enum class OrderScreenState {
    SELECTING_TYPE,   // choose dine-in/takeaway + table if dine-in
    EDITING_ORDER,    // unified menu + cart — covers both pre-create local cart and post-create server-synced cart
    ORDER_TERMINAL,   // read-only summary for paid/voided/refunded orders viewed from deep-link
    DAY_NOT_OPEN,     // no open business day — message only, no admin
}
```

This replaces the old: `SELECTING_TYPE | BUILDING_ORDER | ORDER_CREATED | ORDER_PAID | DAY_NOT_OPEN`.

### Server-Synced Mutation Pattern

Every server mutation follows this canonical pattern in `OrderViewModel`:

1. **Snapshot** cart before mutation (for rollback on catastrophic failure).
2. **Optimistic** local update to `_uiState` (immediate UI feedback).
3. **Call** server API via `OrderRepository`.
4. **Always refetch + hydrate** on both success and failure:
   - `val order = refetchOrder()` (suspend, returns `OrderResponse?`)
   - If `order != null`: `hydrateFromOrder(order)` (replaces cart + `currentOrder` with authoritative server state).
   - If `refetchOrder()` itself fails: restore snapshot cart + set `error` string.

This pattern is simpler and more reliable than extracting individual fields from API responses:

- `orderItemId` flows from the hydrated cart, not from `AddOrderItemResponse` directly.
- `currentOrder.totalHalalas` and other money fields are always accurate after every mutation.
- Concurrent POS edits are picked up automatically.
- Capturing `orderItemId` from `AddOrderItemResponse` remains an optional fast-path optimization — but hydrate is the single source of truth.

**`refetchOrder()` specification:**

```kotlin
private suspend fun refetchOrder(): OrderResponse? {
    val orderId = _uiState.value.currentOrderId ?: return null
    return try {
        val response = withContext(ioDispatcher) {
            orderRepo!!.getOrder(orderId).execute()
        }
        if (response.isSuccessful) response.body() else null
    } catch (e: Exception) {
        null
    }
}
```

Must be defined as `suspend` so callers can `await` the result before reading `_uiState`.

**`addItemServer` with canonical pattern:**

```kotlin
fun addItemServer(item: ItemResponse) {
    val orderId = _uiState.value.currentOrderId ?: return
    viewModelScope.launch {
        val snapshotCart = _uiState.value.cart.toList()
        val snapshotState = _uiState.value.copy(cart = snapshotCart)

        // Optimistic: add item locally with qty=1, orderItemId=null (placeholder)
        val tempCartItem = CartItem(item = item, qty = 1)
        _uiState.value = _uiState.value.copy(
            cart = _uiState.value.cart + tempCartItem,
            error = null,
        )
        try {
            val response = withContext(ioDispatcher) {
                orderRepo!!.addItem(
                    orderId = orderId,
                    itemId = item.id.toLong(),
                    qty = 1,
                    notes = null,
                ).execute()
            }
            // Always refetch + hydrate on both success and failure
            val order = refetchOrder()
            if (order != null) {
                hydrateFromOrder(order)
            } else {
                // refetch itself failed — restore snapshot
                _uiState.value = snapshotState.copy(
                    error = if (response.isSuccessful) "Sync failed — pull to refresh"
                        else "Failed to add item (${response.code()})"
                )
            }
        } catch (e: Exception) {
            val order = refetchOrder()
            if (order != null) {
                hydrateFromOrder(order)
            } else {
                _uiState.value = snapshotState.copy(
                    error = e.message ?: "Failed to add item"
                )
            }
        }
    }
}
```

For `updateQtyServer`, `removeItemServer`, `updateNotesServer` — same pattern:

1. snapshot → 2. optimistic → 3. API call → 4. `val order = refetchOrder()` → `hydrateFromOrder(order)` or restore snapshot.

### Menu Item-Tap Handler (D16)

When the user taps a menu item in `OrderEditingPanel`, the handler branches based on whether the order is open and whether a cart line already exists for that item:

```
if (currentOrderId != null && currentOrder?.status == "open") {
  val existing = cart.find { it.item.id == item.id && it.orderItemId != null }
  if (existing != null) {
    updateQtyServer(existing.orderItemId!!, existing.qty + 1)
  } else {
    addItemServer(item)
  }
} else {
  addToCart(item) // existing local merge behavior (indexOfFirst match)
}
```

This matches D16: server-synced "add from menu" merges qty when a line already exists for that `item.id`, instead of always creating a new `order_items` row. One kitchen delta print fires for the qty increase, and duplicate lines are avoided.

### OrderViewModel Methods Target

**Keep local (unchanged):** `addToCart`, `increaseQty`, `decreaseQty`, `removeFromCart`, `updateItemNotes`, `createOrder` (rewired), `newOrder`, `proceedToBuild`, `selectCategory`, `setOrderType`, `setTable`, `clearCart`

**Add server-synced:** `addItemServer(ItemResponse)`, `updateQtyServer(orderItemId: Long, newQty: Int)`, `removeItemServer(orderItemId: Long)`, `updateNotesServer(orderItemId: Long, notes: String)`, `hydrateFromOrder(OrderResponse)`, `refetchOrder()` (suspend, returns `OrderResponse?`)

**Remove:** `payOrder`

**Remove states:** `BUILDING_ORDER`, `ORDER_CREATED` (fold into `EDITING_ORDER`), `ORDER_PAID` (fold into `ORDER_TERMINAL`)

**Add to `OrderUiState`:** `permissions: Permissions = Permissions()`

### OrderViewModel Constructor Changes

Add `RealtimeClient` parameter:

```kotlin
class OrderViewModel(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
    private val realtimeClient: RealtimeClient,          // NEW
    private val initialTableId: Long? = null,
    private val initialOrderId: Long? = null,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel()
```

Add WS subscription in `init`:

```kotlin
viewModelScope.launch {
    realtimeClient.events.collect { event ->
        val currentId = _uiState.value.currentOrderId ?: return@collect
        if (event.type.startsWith("order.")) {
            // refetchOrder() is suspend — must await the result before reading _uiState
            val order = refetchOrder() ?: return@collect
            if (order.status != "open") {
                _uiState.value = _uiState.value.copy(
                    currentOrder = order,
                    screenState = OrderScreenState.ORDER_TERMINAL,
                    // cart remains as last known snapshot for display in OrderTerminalPanel
                    // (OrderTerminalPanel should prefer currentOrder.items over cart)
                )
            } else {
                hydrateFromOrder(order) // keep cart in sync with concurrent POS item edits
            }
        }
    }
}
```

Key points:

- `refetchOrder()` must be **suspend** so the collector awaits the GET response before reading status.
- Failure to refetch does **not** crash — `refetchOrder()` returns `null` on error, and we `return@collect` leaving the UI as-is. This is a soft failure; the next WS event or user interaction will retry.
- On `open` status: `hydrateFromOrder` syncs cart with current server state (picks up concurrent POS edits).
- On terminal status: `currentOrder` is updated and `screenState` switches to `ORDER_TERMINAL`. The cart is **not cleared** — it remains as the last known lines for display in `OrderTerminalPanel`. `OrderTerminalPanel` should render `currentOrder.items` (authoritative) and fall back to cart only if items are empty.

### createOrder Rewired

Current `createOrder()` (`OrderViewModel.kt` 311–360) already calls `addCartItemsToOrder`. Changes needed:

1. After all sequential `addOrderItem` calls complete (success or partial failure), always call `refetchOrder()` + `hydrateFromOrder` to populate `orderItemId` from the authoritative server state. Optionally, `addCartItemsToOrder` may also capture `orderItemId` from each `AddOrderItemResponse` as a fast-path write-back to cart, but the canonical source of truth is the refetch.
2. On partial failure (`hasError`), instead of just setting `ORDER_CREATED` + error, call `refetchOrder()` to hydrate the cart from whatever the server has.
3. On success, cart stays in `EDITING_ORDER` screen state with `orderItemId` populated; cart is now server-synced.

### hydrateFromOrder

New method in `OrderViewModel`:

```kotlin
fun hydrateFromOrder(order: OrderResponse) {
    val cartItems = order.items.map { oi ->
        // Match menu item by itemId; fall back to synthesized ItemResponse from snapshots
        val menuItem = _uiState.value.items.find { it.id == oi.itemId }
        val item = menuItem ?: ItemResponse(
            id = oi.itemId ?: 0L,
            categoryId = 0L,
            name = oi.itemName,
            nameAr = null,
            priceHalalas = oi.unitPriceHalalas,
            vatRateBp = oi.vatRateBp,
            sortOrder = 0,
            isActive = true,
            createdAt = 0L,
            updatedAt = 0L,
            createdBy = null,
            updatedBy = null,
        )
        CartItem(
            item = item,
            orderItemId = oi.id,
            qty = oi.qty,
            notes = oi.notes ?: "",
        )
    }
    _uiState.value = _uiState.value.copy(
        cart = cartItems,
        currentOrderId = order.id.toLong(),
        currentOrder = order,
        orderType = if (order.type == "dine_in") OrderType.DINE_IN else OrderType.TAKEAWAY,
        selectedTableId = order.tableId,
        screenState = if (order.status == "open") OrderScreenState.EDITING_ORDER else OrderScreenState.ORDER_TERMINAL,
    )
}
```

Replace `applyInitialTableContext` order-loading path (lines 135–162) to use `hydrateFromOrder` instead of setting `ORDER_CREATED`.

### OrderScreen Target Panels

`OrderScreen.kt` `when` block (line 41–47) becomes:

```kotlin
when (state.screenState) {
    OrderScreenState.SELECTING_TYPE -> TypeSelectionPanel(viewModel, state, onLogout)
    OrderScreenState.EDITING_ORDER -> OrderEditingPanel(viewModel, state, onViewOrders, onViewTables)
    OrderScreenState.ORDER_TERMINAL -> OrderTerminalPanel(viewModel, state)
    OrderScreenState.DAY_NOT_OPEN -> DayNotOpenPanel(viewModel, state)
}
```

Where:

- **`TypeSelectionPanel`**: unchanged (keep as-is, lines 92–185)
- **`OrderEditingPanel`**: replaces both `OrderBuildingPanel` and `OrderCreatedPanel`. Unified menu grid + cart composable. When `currentOrderId == null`, shows "Create Order" button (local cart). When `currentOrderId != null && currentOrder?.status == "open"`, hides Create button, shows server totals, allows continuing editing. The `CartPanel` composable (lines 311–430) is reused/adapted.
- **`OrderTerminalPanel`**: replaces `OrderPaidPanel`. Read-only summary for `paid`, `voided`, `refunded` orders. Shows status badge, totals, "New Order" button. No pay/void/refund buttons.
- **`DayNotOpenPanel`**: simplified — message + Back button only. **No cash input field. No Open Day button.** (fix G10)

### OrdersScreen Changes

1. Remove `"sent"` branch in `OrderCard` (line 134) — replace with `"refunded"`.
2. Remove `"sent"` branch in `OrderDetailView` status color `when` (line 215).
3. Add `StatusRefunded` color to `Color.kt` — e.g., `val StatusRefunded = Color(0xFF9C27B0)` (purple).
4. Optional: add "Continue" button in `OrderDetailView` when `status == "open"` — needs an `onContinue: (orderId: Long) -> Unit` callback. In `NavGraph.kt`, wire to navigate to `order?orderId=$orderId`.

### Color.kt Changes

`Color.kt` (lines 1–20) — replace:

```kotlin
// Order status colors
val StatusOpen = Color(0xFF2196F3)
val StatusSent = Color(0xFFFF9800)       // REMOVE
val StatusPaid = Color(0xFF4CAF50)
val StatusVoided = Color(0xFFF44336)
// ADD:
val StatusRefunded = Color(0xFF9C27B0)
```

### DayNotOpenPanel Fixed

`OrderScreen.kt` 600–668 — replace entire function with:

```kotlin
@Composable
private fun DayNotOpenPanel(viewModel: OrderViewModel, state: OrderUiState) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(title = "New Order")
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("⚠", fontSize = 48.sp, color = Warning)
            Spacer(modifier = Modifier.height(16.dp))
            Text("No Open Business Day", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = OnDark)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "A business day must be opened from the POS terminal before taking orders.",
                fontSize = 16.sp,
                color = OnDarkSecondary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = { viewModel.newOrder() },
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
                modifier = Modifier.height(48.dp),
            ) {
                Text("Back")
            }
        }
    }
}
```

### NavGraph Changes

- `NavGraph.kt` `order` composable (lines 85–106): inject `app.realtimeClient` into `OrderViewModel.Factory` (add `realtimeClient` parameter).
- `NavGraph.kt` `orders` composable (lines 108–114): if implementing "Continue" button, pass `onContinue = { orderId -> navController.navigate("order?orderId=$orderId") { popUpTo("order") { inclusive = true } } }` to `OrdersScreen`.

Updated factory:

```kotlin
class Factory(
    private val preferencesManager: PreferencesManager,
    private val apiClientProvider: ApiClientProvider,
    private val realtimeClient: RealtimeClient,         // NEW
    private val initialTableId: Long? = null,
    private val initialOrderId: Long? = null,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModelProvider.Factory { /* ... */}
```

### Permissions Gating in UI

In `OrderScreen.kt` composables, conditionally show action afforances:

**Pre-order** (`currentOrderId == null` — D17 local cart mutations are NOT permission-gated):

```kotlin
// Create Order button — only action gated in pre-order state
if (state.permissions.createOrder) {
    Button(onClick = { viewModel.createOrder() }, ...) {
        Text("Create Order", ...)
    }
}
// Menu item taps (add to local cart) — always visible, no permission gate
// Qty +/- on local cart items — always visible, no permission gate
// Remove (×) on local cart items — always visible, no permission gate
```

**Post-order open** (`currentOrderId != null`):

```kotlin
// Menu item taps & + button — gated on updateOrder
if (state.permissions.updateOrder) { /* ... */ }
// Remove item (×) button in CartItemRow — gated on deleteOrderItem
if (state.permissions.deleteOrderItem) {
    TextButton(onClick = onRemove) {
        Text("×", ...)
    }
}
```

Safe default: all false when `me` is null. This means:

- If permissions haven't loaded yet, **server-gated** actions are hidden (Create Order, post-order menu taps/+ and ×).
- **Local cart mutations** (pre-order add/qty/remove) remain always available regardless of permission state — only Create Order is hidden until permissions load.

---

## WebSocket Subscription Spec

### On `OrderViewModel` (when editing an order)

| WS Event  | Action                                                                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order.*` | If `currentOrderId != null`: `val order = refetchOrder()` (suspend, await) → if `order != null && order.status != "open"`, set `currentOrder = order` + switch to `ORDER_TERMINAL` (cart preserved as snapshot). If `open`, `hydrateFromOrder(order)`. If `refetchOrder()` returns `null`, leave UI as-is (soft failure). |

Implementation note: `RealtimeEvent.payload` is a raw JSON string (`RealtimeEvent.kt:3-7`). Parsing it to extract `orderId` adds complexity. The simpler approach — refetch on any `order.*` event when `currentOrderId != null` — is the recommended path. The refetch cost is one `GET /orders/:id` per WS event, acceptable for tablet scale. `refetchOrder()` must be **suspend** so the collector awaits the GET before reading `_uiState.value.currentOrder?.status`.

### On `OrdersViewModel` and `TablesViewModel`

No changes needed — they already subscribe to `event.type.startsWith("order.")` and refresh. The `order.sent` event type no longer exists server-side, so the existing generic prefix filter `"order."` is already correct.

---

## Tests to Specify

### OrderViewModelTest (`test/.../ui/OrderViewModelTest.kt`)

**Update existing:**

- Remove any test that exercises `payOrder` (none currently exist in this file — safe; payOrder is untested dead code).
- Test `initialOrderId` with `status == "open"` → hydrates cart with `orderItemId` and transitions to `EDITING_ORDER` (was `ORDER_CREATED`).
- Test `initialOrderId` with `status == "paid"` → transitions to `ORDER_TERMINAL` read-only.

**Add:**

- `hydrateFromOrder` populates `orderItemId`, `qty`, `notes` from `OrderItemResponse` items.
- `addItemServer` — optimistic add, success writes `orderItemId`, failure rolls back to previous cart.
- `updateQtyServer` — optimistic qty update, success, failure rollback.
- `removeItemServer` — optimistic remove, success, failure rollback.
- `createOrder` — after successful create + item adds, `orderItemId` populated on each `CartItem`.
- `createOrder` partial failure — refetches and hydrates cart.
- `permissions` — defaults to all false; updates after `getMe()` succeeds.
- WS: When `currentOrderId` set and `order.paid` event arrives → `screenState` becomes `ORDER_TERMINAL`.
- No `payOrder()` method exists on `OrderViewModel`.

### OrderRepositoryTest (`test/.../data/repository/OrderRepositoryTest.kt`)

**Remove:**

- `payOrder delegates correctly` (lines 156–162)
- `voidOrder delegates correctly` (lines 164–171)
- `order lifecycle create pay` (lines 173–197)
- `payCall` and `voidCall` mock fields (lines 40–43)

**Keep:**

- `createOrder`, `getOrder`, `listOrders`, `addItem` tests — all green.

**Add:**

- `updateItem delegates correctly` — mocks `ordersApi.ordersControllerUpdateOrderItem()`, verifies `updateItem(orderId=1, itemId=42, qty=2, notes=null)` calls the API with correct parameters.
- `removeItem delegates correctly` — mocks `ordersApi.ordersControllerDeleteOrderItem()`, verifies `removeItem(orderId=1, itemId=42)` calls the API.
- These methods already exist in `OrderRepository.kt` (addItem at ~54, updateItem at ~56, removeItem at ~58) — tests are newly added.

### RealtimeClientTest (`test/.../data/realtime/RealtimeClientTest.kt`)

- Line 79: Change fixture event type from `"order.sent"` → `"order.paid"` or `"order.item.added"` (does not affect test semantics — test only checks payload parsing, not the type).

### New: Permissions helper test (optional)

If `Permissions` extracted to its own file, add tests for `.from(null)` → all false, `.from(me)` maps correctly. Can be tested inline in `OrderViewModelTest`.

### MoneyFormatterTest

Unchanged — no modifications. `bazel test //apps/android:unit_tests` should still pass.

### Commands

```sh
# Android unit tests only
bazel test //apps/android:unit_tests

# Or via Gradle directly
cd apps/android && ./gradlew testDebugUnitTest

# Full suite before merge
pnpm test    # runs bazel test //...
```

---

## Migration Phases

Each phase is independently shippable (mergeable to main, CI-passing).

### Phase 1 — Safety Strip (pay/void/sent/day-admin dead code)

**Goal:** Remove all code that violates D5 (hard ban on pay/void/refund/print/day-admin) and D4 (no sent status). Android becomes "administratively safe" — even if bugs exist, they cannot accidentally trigger payment or void.

**Files touched:**

| File                                               | Action |
| -------------------------------------------------- | ------ |
| `main/java/.../data/repository/OrderRepository.kt` | Modify |
| `main/java/.../ui/order/OrderViewModel.kt`         | Modify |
| `main/java/.../ui/order/OrderScreen.kt`            | Modify |
| `main/java/.../ui/theme/Color.kt`                  | Modify |
| `main/java/.../ui/orders/OrdersScreen.kt`          | Modify |
| `test/.../data/repository/OrderRepositoryTest.kt`  | Modify |
| `test/.../data/realtime/RealtimeClientTest.kt`     | Modify |
| `apps/android/README.md`                           | Modify |

**Concrete steps:**

1. **`OrderRepository.kt`**: Delete `payOrder` (lines 63–65) and `voidOrder` (lines 67–69). Remove unused imports if any.
2. **`OrderViewModel.kt`**: Delete `payOrder` (lines 415–441). Remove `ORDER_PAID` from `OrderScreenState` enum (line 43).
3. **`OrderScreen.kt`**: Delete `OrderPaidPanel` composable (lines 567–597). Remove `OrderScreenState.ORDER_PAID ->` branch (line 45).
4. **`Color.kt`**: Delete `val StatusSent = Color(0xFFFF9800)` (line 18). Add `val StatusRefunded = Color(0xFF9C27B0)` (line 20).
5. **`OrdersScreen.kt`**: Remove `"sent"` → `StatusSent` branch in `OrderCard` (line 134). Add `"refunded"` → `StatusRefunded`. Remove `"sent"` → `StatusSent` branch in `OrderDetailView` (line 215). Add `"refunded"` → `StatusRefunded`.
6. **`OrderScreen.kt`** `DayNotOpenPanel`: Replace lines 600–668 with simplified message-only version (no cash input, no Open Day button). Remove `openingCash` and `dayOpeningError` from `OrderUiState`.
7. **`OrderRepositoryTest.kt`**: Delete `payOrder delegates correctly` (lines 156–162), `voidOrder delegates correctly` (lines 164–171), and `order lifecycle create pay` (lines 173–197). Remove `payCall`/`voidCall` mock fields and related `every` stubs.
8. **`RealtimeClientTest.kt`**: Line 79 — change `"order.sent"` → `"order.paid"`.
9. **`README.md`**: Line 117 — change `"create/send/pay"` → `"create/edit items"`.

**Acceptance greps (zero hits except in this plan doc):**

```sh
rg -n "payOrder|voidOrder|ORDER_PAID|StatusSent|\"sent\"" apps/android/app/src/main/
rg -n "payOrder|voidOrder" apps/android/app/src/test/
rg -n "order\.sent" apps/android/app/src/test/
```

```sh
# Also ensure no Open Day / openingCash references remain in OrderViewModel/OrderScreen:
rg -n "openingCash|dayOpeningError|Open Day" apps/android/app/src/main/java/com/spicyhome/pos/ui/order/
```

**Test:**

```sh
bazel test //apps/android:unit_tests
```

After Phase 1, post-create UX remains read-only dead-end (G4); this is fixed in Phases 2–3. No payment path remains on Android.

---

### Phase 2 — Cart Model + Hydrate

**Goal:** `CartItem` gains `orderItemId`. Opening an existing order hydrates the cart with server items and their `orderItemId`. `createOrder` captures `orderItemId` via the canonical mutation pattern (refetch + hydrate after item adds; capturing from `AddOrderItemResponse` is optional fast-path, not required for correctness).

**Files touched:**

| File                                       | Action |
| ------------------------------------------ | ------ |
| `main/java/.../ui/order/OrderViewModel.kt` | Modify |
| `main/java/.../ui/order/OrderScreen.kt`    | Modify |
| `test/.../ui/OrderViewModelTest.kt`        | Modify |

**Concrete steps:**

1. **`OrderViewModel.kt`:** Add `orderItemId: Long? = null` to `CartItem` (line 30).
2. Replace `OrderScreenState.BUILDING_ORDER` and `OrderScreenState.ORDER_CREATED` with single `EDITING_ORDER` (line 41,42 → `EDITING_ORDER`).
3. Add `hydrateFromOrder(OrderResponse)` method — maps `OrderItemResponse` items to `CartItem` with `orderItemId = oi.id`, resolving menu item by `oi.itemId`.
4. Update `applyInitialTableContext` (lines 134–170): when `initialOrderId` loads successfully, call `hydrateFromOrder` instead of setting `ORDER_CREATED`. If `status == "open"`, set `screenState = EDITING_ORDER`. Otherwise, set `screenState = ORDER_TERMINAL` (new state — Phase 3 implements the panel).
5. Update `OrderScreenState` to contain only: `SELECTING_TYPE`, `EDITING_ORDER`, `ORDER_TERMINAL`, `DAY_NOT_OPEN`.
6. **`addCartItemsToOrder`** (lines 362–396): Optionally capture `orderItemId` from `AddOrderItemResponse.body().orderItemId` as a fast-path optimization. Finalize by calling `refetchOrder()` then `hydrateFromOrder` to reconcile — this is the authoritative source of truth for `orderItemId` and totals. On partial failure, refetch + hydrate as well.
7. **`createOrder`** (line 333): After setting `currentOrderId`, change the state transition to stay in `EDITING_ORDER` (not the old `BUILDING_ORDER`/`ORDER_CREATED`).
8. **`OrderScreen.kt`:** Update the `when` block (lines 41–47) to use new state names. For `EDITING_ORDER`, render a unified panel — for now, wire the existing `OrderBuildingPanel` composable name but have it branch on `currentOrderId != null`.
9. **`OrderViewModelTest.kt`:** Update `initialOrderId loads order into ORDER_CREATED` test (lines 328–369) to expect `EDITING_ORDER` and populated cart with `orderItemId`. Add test for `paid` status → `ORDER_TERMINAL`.

**Acceptance:**

- Open an existing open order from Tables → cart populates with items and `orderItemId`.
- `OrderViewModelTest` updated and passes.
- `bazel test //apps/android:unit_tests` passes.

---

### Phase 3 — Server-Synced Mutations + Unified Editing UI

**Goal:** After an order exists (status `open`), all add/update/remove/notes operations hit server APIs. UI presents a single unified editing workspace for both pre-create local cart and post-create server cart.

**Files touched:**

| File                                       | Action |
| ------------------------------------------ | ------ |
| `main/java/.../ui/order/OrderViewModel.kt` | Modify |
| `main/java/.../ui/order/OrderScreen.kt`    | Modify |
| `test/.../ui/OrderViewModelTest.kt`        | Modify |

**Concrete steps:**

1. **`OrderViewModel.kt`:** Add four server-synced methods:
   - `addItemServer(item: ItemResponse)` — POST addItem (or delegates to `updateQtyServer` per D16). Follows the canonical mutation pattern (optimistic → API → refetch+hdyrate).
   - `updateQtyServer(orderItemId: Long, newQty: Int)` — PATCH updateItem with qty, optimistic + rollback. Follows canonical pattern.
   - `removeItemServer(orderItemId: Long)` — DELETE removeItem, optimistic + rollback. Follows canonical pattern.
   - `updateNotesServer(orderItemId: Long, notes: String)` — PATCH updateItem with notes only, optimistic + rollback. Follows canonical pattern.
     **D16 item-tap branching** in `OrderEditingPanel`:

   ```
   if (currentOrderId != null && currentOrder?.status == "open") {
     val existing = cart.find { it.item.id == item.id && it.orderItemId != null }
     if (existing != null) updateQtyServer(existing.orderItemId!!, existing.qty + 1)
     else addItemServer(item)
   } else {
     addToCart(item) // existing merge behavior
   }
   ```

   Tapping the same menu item twice on an open order results in a single cart line with qty 2 and one `updateItem` call (not two `addItem` calls creating duplicate lines).

2. **`OrderScreen.kt`:** Create `OrderEditingPanel` composable (unified) that:
   - Renders menu grid (left) + cart panel (right) — same layout as current `OrderBuildingPanel`.
   - When `currentOrderId == null` (pre-create): taps call `addToCart`, cart mutations are local (`increaseQty`, `decreaseQty`, `removeFromCart`), "Create Order" button at bottom of cart.
   - When `currentOrderId != null && currentOrder?.status == "open"`: menu item taps follow the **D16 branching** (merge qty if existing line, else `addItemServer`). Cart +/- call `updateQtyServer`/`removeItemServer`. "Create Order" button is **hidden**. Add a "New Order" button.
   - **Permission gating (Phase 4 will refine):** For now, all buttons render — Phase 4 adds the permission checks. But during Phase 3, the server-synced methods should still call the API regardless (permission check is server-side too).

3. **CartItemRow** (lines 433–476): Add a small notes edit affordance (e.g., a tappable pencil icon that opens a `Dialog` with `TextField`). Calls `updateNotesServer` when order exists, `updateItemNotes` when local-only. (Addresses G20.)

4. `proceedToBuild()` (line 299) → set `screenState = EDITING_ORDER` (was `BUILDING_ORDER`).

5. `newOrder()` (line 443) → reset to `SELECTING_TYPE` with preserved menu/tables.

6. **`OrderViewModelTest.kt`:** Add tests for:
   - `addItemServer` success writes `orderItemId` to cart.
   - `addItemServer` failure rolls back to previous cart.
   - `updateQtyServer` success updates qty.
   - `updateQtyServer` failure rolls back.
   - `removeItemServer` success removes item.
   - `removeItemServer` failure rolls back.
   - **D16:** Tapping same menu item twice on open order → single cart line with qty 2, one `updateItem` call (not two `addItem` calls).
   - `createOrder` with partial failure refetches + hydrates.
   - `hydrateFromOrder` maps `OrderItemResponse` to `CartItem` correctly.

**Acceptance:**

- Create an order → add more items → qty up/down → remove items. All reach server. Kitchen prints automatically.
- D16: Tap same menu item twice on open order → single line qty 2, one `updateItem` call.
- Open existing open order from Tables → edit items → server synced.
- Network failure: cart rolls back to server state, error shown.
- `bazel test //apps/android:unit_tests` passes.

---

### Phase 4 — Permissions

**Goal:** Gate create, add, update qty/notes, and remove behind `getMe()` permissions. Hide buttons when user lacks permission.

**Files touched:**

| File                                       | Action |
| ------------------------------------------ | ------ |
| `main/java/.../ui/order/OrderViewModel.kt` | Modify |
| `main/java/.../ui/order/OrderScreen.kt`    | Modify |
| `test/.../ui/OrderViewModelTest.kt`        | Modify |

**Concrete steps:**

1. **`OrderViewModel.kt`:**
   - Add `Permissions` data class (or use a companion `data class` at file top, or extract to `data/Permissions.kt` — inline in `OrderViewModel.kt` is fine for small scope).
   - Add `permissions: Permissions = Permissions()` to `OrderUiState`.
   - In `init {}`, after `initRepos()` + `loadMenu()` + `loadTables()` + `applyInitialTableContext()`, add a coroutine that calls `AuthRepository(...).getMe().execute()` and sets `_uiState.value = _uiState.value.copy(permissions = Permissions.from(meResponse.body()))`.
   - `AuthRepository` can be created ad-hoc in init (like `menuRepo`/`orderRepo`) — add a nullable field `private var authRepo: AuthRepository? = null` and create it in `initRepos()`.

2. **`OrderScreen.kt`:**
   - `OrderEditingPanel`: Gate "Create Order" button on `state.permissions.createOrder`.
   - `CartItemRow`: Gate `+` / `-` / `×` buttons on `state.permissions.updateOrder` (for +, -) and `state.permissions.deleteOrderItem` (for ×). If no permission, show item qty as read-only text.
   - Menu grid item taps (`ItemCard`): Only call `addItemServer` if `state.permissions.updateOrder` when server-synced mode. When local-only (no order yet), always allow add (local cart is not gated — you need to build a cart to create an order, and the Create button is gated separately).

3. **`OrderViewModelTest.kt`:** Add tests:
   - Permissions default to all false when `getMe()` call fails or returns null.
   - Permissions load correctly from a successful `MeResponse`.
   - `Permissions.from(null)` returns all-false.

**Acceptance:**

- Login with a role lacking `createOrder` → "Create Order" button hidden.
- Login with a role lacking `deleteOrderItem` → remove (×) buttons hidden on cart items.
- Login with a role having all perms → all buttons visible.
- No tests broken.
- `bazel test //apps/android:unit_tests` passes.

---

### Phase 5 — WS Multi-Terminal Safety on OrderViewModel

**Goal:** When the POS pays, voids, or refunds an order that the tablet is editing, the tablet detects it via WebSocket and transitions to read-only.

**Files touched:**

| File                                       | Action |
| ------------------------------------------ | ------ |
| `main/java/.../ui/order/OrderViewModel.kt` | Modify |
| `main/java/.../ui/navigation/NavGraph.kt`  | Modify |
| `test/.../ui/OrderViewModelTest.kt`        | Modify |

**Concrete steps:**

1. **`OrderViewModel.kt`:** Add `RealtimeClient` to constructor (see target design above). Add WS subscription in `init {}` that collects events and uses the **suspend** `refetchOrder()` pattern: `val order = refetchOrder() ?: return@collect` — then if `order.status != "open"`, set `currentOrder = order` + `screenState = ORDER_TERMINAL` (cart preserved for display). If `open`, call `hydrateFromOrder(order)` to sync with concurrent POS edits. Failure to refetch is a soft error: `return@collect` leaves UI unchanged until next event.
2. **`OrderViewModel.Factory`:** Add `realtimeClient` parameter.
3. **`NavGraph.kt`:** In `order` composable (lines 85–106), pass `app.realtimeClient` to `OrderViewModel.Factory`.
4. **`OrderViewModelTest.kt`:** Add tests:
   - When `currentOrderId` is set and WS event `order.paid` arrives → `screenState` becomes `ORDER_TERMINAL`.
   - When `currentOrderId` is set and WS event arrives but order still `open` → `screenState` stays `EDITING_ORDER`, cart stays populated.
   - No `currentOrderId` set → WS events do nothing.

**Acceptance:**

- Open an order on tablet. Pay it from POS. Tablet detects via WS and shows read-only terminal.
- Void from POS. Tablet shows read-only.
- `bazel test //apps/android:unit_tests` passes.

---

### Phase 6 — Orders List Continue + Refunded Badge

**Goal:** Orders list can deep-link back to Order screen for `open` orders. Refunded status has visual styling.

**Files touched:**

| File                                      | Action |
| ----------------------------------------- | ------ |
| `main/java/.../ui/orders/OrdersScreen.kt` | Modify |
| `main/java/.../ui/theme/Color.kt`         | Modify |
| `main/java/.../ui/navigation/NavGraph.kt` | Modify |

**Concrete steps:**

1. **`Color.kt`:** Ensure `StatusRefunded` is present (added in Phase 1).
2. **`OrdersScreen.kt` `OrderDetailView`** (lines 187–333): Add a "Continue Editing" `Button` below the items list when `order.status == "open"`. Wire to an `onContinue: (Long) -> Unit` callback prop.
3. **`OrdersScreen.kt` composable signature**: Add `onContinue: (Long) -> Unit` parameter (default `{}`).
4. **`NavGraph.kt`:** Pass `onContinue` to `OrdersScreen` that navigates to `order?orderId=$orderId`.
5. **`OrdersScreen.kt` `OrderCard`** (lines 132–137): Ensure `statusColor` `when` includes `"refunded"` → `StatusRefunded` (done in Phase 1).

**Acceptance:**

- Open orders in list → "Continue Editing" visible. Tap → navigates to Order screen with cart hydrated.
- Refunded orders show purple badge.
- `bazel test //apps/android:unit_tests` passes.

---

### Phase 7 — Tests Polish + Acceptance Greps + README Update

**Goal:** Ensure all new code is well-tested. Update README screen flow. Full acceptance grep pass.

**Files touched:**

| File                                | Action |
| ----------------------------------- | ------ |
| `apps/android/README.md`            | Modify |
| `test/.../ui/OrderViewModelTest.kt` | Modify |
| Various (grep pass)                 | Verify |

**Concrete steps:**

1. **`README.md`:** Update "Screen flow" diagram (line 116–118):
   ```
   Setup → Login → Order (category tabs, items, cart, create/edit items) → Orders list
   ```
   Remove "send/pay" reference.
2. **`OrderViewModelTest.kt`:** Ensure all new tests from Phases 2–6 are in place. Add a comprehensive test for the full flow: create order → add item server-synced → update qty → remove → WS triggered terminal.
3. **`OrdersViewModelTest.kt`:** Verify status handling tests (if any) don't reference `sent`.
4. **Full grep pass:**
   ```sh
   rg -n "payOrder|voidOrder|ORDER_PAID|StatusSent|\"sent\"" apps/android/
   ```
   Should return zero hits (except in this doc file and imports from generated `client-kt` `OrdersApi` — allow those).
   ```sh
   rg -n "order\.sent" apps/android/
   ```
   Should return zero hits (except possibly in this doc).
5. **Run full suite:**
   ```sh
   bazel test //apps/android:unit_tests
   pnpm test    # bazel test //... (all 7 targets)
   ```

**Acceptance:**

- All greps clean.
- `bazel test //apps/android:unit_tests` passes.
- `bazel test //...` all 7 targets pass.

---

## File Change Checklist

| Path                                                                 | Action | Notes                                                                                                                    |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `main/java/com/spicyhome/pos/ui/order/OrderViewModel.kt`             | Modify | CartItem + orderItemId; server-synced methods; hydrateFromOrder; WS; permissions; remove payOrder; new screen state enum |
| `main/java/com/spicyhome/pos/ui/order/OrderScreen.kt`                | Modify | Unified OrderEditingPanel; remove OrderPaidPanel; fix DayNotOpenPanel; permission gates; notes editing affordance        |
| `main/java/com/spicyhome/pos/data/repository/OrderRepository.kt`     | Modify | Remove payOrder, voidOrder methods                                                                                       |
| `main/java/com/spicyhome/pos/ui/orders/OrdersScreen.kt`              | Modify | Remove sent color branches; add refunded; optional Continue button                                                       |
| `main/java/com/spicyhome/pos/ui/orders/OrdersViewModel.kt`           | —      | No changes needed (WS filter already correct)                                                                            |
| `main/java/com/spicyhome/pos/ui/theme/Color.kt`                      | Modify | Remove StatusSent; add StatusRefunded                                                                                    |
| `main/java/com/spicyhome/pos/ui/navigation/NavGraph.kt`              | Modify | Inject RealtimeClient into OrderViewModel.Factory; Continue route wiring                                                 |
| `main/java/com/spicyhome/pos/data/SessionManager.kt`                 | —      | No changes (permissions fetched in OrderViewModel init, not stored here)                                                 |
| `main/java/com/spicyhome/pos/data/PreferencesManager.kt`             | —      | No changes (token/URL only — fine)                                                                                       |
| `main/java/com/spicyhome/pos/data/repository/AuthRepository.kt`      | —      | No changes (getMe() already exists)                                                                                      |
| `main/java/com/spicyhome/pos/data/repository/MenuRepository.kt`      | —      | No changes                                                                                                               |
| `main/java/com/spicyhome/pos/data/repository/TableRepository.kt`     | —      | No changes                                                                                                               |
| `main/java/com/spicyhome/pos/util/MoneyFormatter.kt`                 | —      | No changes                                                                                                               |
| `main/java/com/spicyhome/pos/data/realtime/RealtimeClient.kt`        | —      | No changes                                                                                                               |
| `main/java/com/spicyhome/pos/data/realtime/RealtimeEvent.kt`         | —      | No changes                                                                                                               |
| `main/java/com/spicyhome/pos/data/api/ApiClientProvider.kt`          | —      | No changes                                                                                                               |
| `main/java/com/spicyhome/pos/SpicyHomeApp.kt`                        | —      | No changes (RealtimeClient already instantiated)                                                                         |
| `test/java/com/spicyhome/pos/ui/OrderViewModelTest.kt`               | Modify | Server-synced mutation tests; hydrate tests; permission tests; WS tests; remove any payOrder references                  |
| `test/java/com/spicyhome/pos/data/repository/OrderRepositoryTest.kt` | Modify | Remove payOrder, voidOrder lifecycle tests; keep create/add/get/list tests                                               |
| `test/java/com/spicyhome/pos/data/realtime/RealtimeClientTest.kt`    | Modify | Line 79: change `order.sent` → `order.paid` or `order.item.added`                                                        |
| `test/java/com/spicyhome/pos/ui/OrdersViewModelTest.kt`              | —      | No changes (status handling doesn't reference sent)                                                                      |
| `apps/android/README.md`                                             | Modify | Line 117: update screen flow description                                                                                 |
| `docs/order-lifecycle-android.md`                                    | Create | THIS document                                                                                                            |

---

## Test Plan

### Unit Tests

| Module            | Test File                | Key Scenarios                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OrderViewModel`  | `OrderViewModelTest.kt`  | `hydrateFromOrder` maps `orderItemId`, `qty`, `notes`; `addItemServer` success + rollback; `updateQtyServer` success + rollback; `removeItemServer` success + rollback; `createOrder` populates `orderItemId`; partial failure refetches; permissions default false; permissions load from `MeResponse`; WS event → terminal transition when status changes; `payOrder` method no longer exists |
| `OrderRepository` | `OrderRepositoryTest.kt` | `createOrder` delegates correctly; `getOrder` delegates; `listOrders` with/without filters; `addItem` delegates; `updateItem` delegates correctly; `removeItem` delegates correctly; `payOrder`/`voidOrder` methods removed; no `order lifecycle create pay` test                                                                                                                               |
| `RealtimeClient`  | `RealtimeClientTest.kt`  | `parseWsMessage` uses `order.paid` (not `order.sent`) fixture                                                                                                                                                                                                                                                                                                                                   |
| `MoneyFormatter`  | `MoneyFormatterTest.kt`  | Unchanged — regression                                                                                                                                                                                                                                                                                                                                                                          |
| `OrdersViewModel` | `OrdersViewModelTest.kt` | Unchanged — regression                                                                                                                                                                                                                                                                                                                                                                          |

### Integration / Manual Verification

1. **Happy flow — full order:**
   - Create order → add items → qty up/down → remove item → verify on POS (via list) that items synced.
   - Kitchen printer fires automatically on each add + qty increase (verified on the physical printer or by checking `order_events` on server logs).
2. **Continue open order:**
   - Open order from Tables → verify cart hydrated with correct items and `orderItemId`.
   - Edit items → verify server syncs.
3. **Multi-terminal safety:**
   - Open order on tablet. Pay on POS SPA. Verify tablet transitions to read-only terminal view.
4. **Permission gating:**
   - Login with limited role (no `createOrder`) → "Create Order" hidden.
   - Login with full role → all buttons visible.
5. **Network failure:**
   - Disconnect Wi-Fi before server mutation → cart rolls back, error shown.

### Regression

```sh
bazel test //...  # all targets
```

All must pass before merge.

---

## Master Acceptance Checklist

- [ ] No `payOrder` method in `OrderRepository` or `OrderViewModel`.
- [ ] No `voidOrder` method in `OrderRepository` or `OrderViewModel`.
- [ ] No `ORDER_PAID` screen state in `OrderScreenState` enum.
- [ ] No `OrderPaidPanel` composable rendered.
- [ ] No `StatusSent` color in `Color.kt`.
- [ ] No `"sent"` status branch in `OrdersScreen.kt` `OrderCard` or `OrderDetailView`.
- [ ] `StatusRefunded` color defined and used for `"refunded"` status.
- [ ] `DayNotOpenPanel` has no cash field or Open Day button — only message + Back.
- [ ] `CartItem` has `orderItemId: Long?` field.
- [ ] `hydrateFromOrder` populates cart from `OrderResponse` with `orderItemId`.
- [ ] Opening existing open order from Tables hydrates cart and allows editing.
- [ ] `createOrder` captures `orderItemId` from each `AddOrderItemResponse`.
- [ ] Server-synced `addItemServer`, `updateQtyServer`, `removeItemServer`, `updateNotesServer` exist and work.
- [ ] Optimistic update + rollback on failure works for all server mutations.
- [ ] Permission gating: `createOrder`, `updateOrder`, `deleteOrderItem` hide actions when false.
- [ ] Permissions default to all false when `getMe()` fails/returns null.
- [ ] `OrderViewModel` subscribes to `RealtimeClient` and refetches on `order.*` events.
- [ ] WS event triggers `ORDER_TERMINAL` transition when status leaves `open`.
- [ ] Orders list optional "Continue" button for `open` orders navigates back to order for editing.
- [ ] `RealtimeClientTest` fixture uses `order.paid` (not `order.sent`).
- [ ] `README.md` screen flow updated (no send/pay).
- [ ] Kitchen prints via server side-effect only — no "Send to Kitchen" step on Android.
- [ ] `bazel test //apps/android:unit_tests` passes.
- [ ] `pnpm test` (full `bazel test //...`) passes before merge.

---

## Residual Risks & Follow-ups

| Risk                                                | Description                                                                                                 | Mitigation / Follow-up                                                                                                                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated `OrdersApi` exposes pay/void/refund/print | `client-kt` `OrdersApi` interface has `ordersControllerPayOrder`, `ordersControllerVoidOrder`, etc. methods | Android `OrderRepository` must not wrap them — enforced by code review and acceptance grep. Generated code is shared with POS which legitimately needs them. No change to `client-kt` is planned.               |
| Concurrent edit races (POS + Android)               | Both tablet and POS can edit the same `open` order simultaneously                                           | Last-write-wins via server. WS refetch on both sides mitigates UI drift. Non-goal to add optimistic concurrency control in v1.                                                                                  |
| Menu item deleted after order created               | `CartItem.item` resolution may fail if menu item no longer exists                                           | `hydrateFromOrder` synthesizes `ItemResponse` from `OrderItemResponse` snapshots (`itemName`, `unitPriceHalalas`, `vatRateBp`). Deleted menu items can't be re-added, but existing order items remain editable. |
| Day not open (409)                                  | Server returns 409 when no open business day                                                                | Android shows `DAY_NOT_OPEN` message. It does not open the day — that's POS-only. Staff must use POS to open day before tablet can create orders.                                                               |
| VAT label hardcodes 15%                             | `OrderScreen.kt:380` shows "VAT (15%)"                                                                      | Phase 2 low priority. Defer to a follow-up polish issue to read VAT rate from `CartItem`'s `vatRateBp`.                                                                                                         |
| POS migration may land separately                   | POS `docs/order-lifecycle-pos.md` is a separate plan                                                        | No dependency between plans. Android can ship independently. Both consume the same server which is already migrated.                                                                                            |
| `RealtimeEvent.payload` is raw JSON                 | Extracting `orderId` from WS events requires parsing                                                        | Recommended approach: refetch on any `order.*` event when `currentOrderId != null`. One extra `GET /orders/:id` per irrelevant event is negligible at tablet scale.                                             |

---

## Out of Scope

- POS SPA migration (see [`docs/order-lifecycle-pos.md`](./order-lifecycle-pos.md)).
- Server changes (already done in [`docs/order-lifecycle.md`](./order-lifecycle.md)).
- ZATCA credit notes, receipt printing, refund logic, void logic (POS-only).
- Business day open/close (POS-only).
- Menu, tables, printers, users, settings management (POS-only).
- Events timeline / audit UI (POS-only).
- Regenerating `client-kt` to remove pay/void/refund endpoints from generated `OrdersApi`.
- Playwright/Espresso e2e tests (planned but not yet implemented).
- Splash screen, offline support, push notifications.

---

## References

- [`docs/order-lifecycle.md`](./order-lifecycle.md) — server-side domain model: states, transitions, item lifecycle, `order_events` schema, kitchen printing, WS events, endpoint summary. 423 lines.
- [`docs/order-lifecycle-pos.md`](./order-lifecycle-pos.md) — POS SPA migration plan (mirrored structure). 1106 lines.
- [`AGENTS.md`](../AGENTS.md) — codebase conventions: Bazel, money (halalas), timezone (Asia/Riyadh), device responsibilities, Node 18, Chrome 109.
- Generated client `OrdersApi`: `packages/client-kt/src/generated/src/main/kotlin/com/spicyhome/client/apis/OrdersApi.kt` (216 lines).
- Generated model `AddOrderItemResponse`: `packages/client-kt/src/generated/src/main/kotlin/com/spicyhome/client/models/AddOrderItemResponse.kt` (43 lines) — has `orderItemId: Long`.
- Generated model `OrderItemResponse`: `packages/client-kt/src/generated/src/main/kotlin/com/spicyhome/client/models/OrderItemResponse.kt` (86 lines).
- Generated model `MeResponse`: `packages/client-kt/src/generated/src/main/kotlin/com/spicyhome/client/models/MeResponse.kt` (102 lines) — has all permission booleans.
- Generated model `OrderResponse`: `packages/client-kt/src/generated/src/main/kotlin/com/spicyhome/client/models/OrderResponse.kt` (104 lines).
- Generated model `OrderSummaryResponse`: `packages/client-kt/src/generated/src/main/kotlin/com/spicyhome/client/models/OrderSummaryResponse.kt` (94 lines).
- Generated model `CreateOrderResponse`: `packages/client-kt/src/generated/src/main/kotlin/com/spicyhome/client/models/CreateOrderResponse.kt` (46 lines).
- `OrderViewModel`: `apps/android/app/src/main/java/com/spicyhome/pos/ui/order/OrderViewModel.kt` (477 lines).
- `OrderScreen`: `apps/android/app/src/main/java/com/spicyhome/pos/ui/order/OrderScreen.kt` (669 lines).
- `OrderRepository`: `apps/android/app/src/main/java/com/spicyhome/pos/data/repository/OrderRepository.kt` (70 lines).
- `OrdersScreen`: `apps/android/app/src/main/java/com/spicyhome/pos/ui/orders/OrdersScreen.kt` (334 lines).
- `OrdersViewModel`: `apps/android/app/src/main/java/com/spicyhome/pos/ui/orders/OrdersViewModel.kt` (143 lines).
- `TablesScreen`: `apps/android/app/src/main/java/com/spicyhome/pos/ui/tables/TablesScreen.kt` (164 lines).
- `TablesViewModel`: `apps/android/app/src/main/java/com/spicyhome/pos/ui/tables/TablesViewModel.kt` (120 lines).
- `Color.kt`: `apps/android/app/src/main/java/com/spicyhome/pos/ui/theme/Color.kt` (20 lines).
- `NavGraph.kt`: `apps/android/app/src/main/java/com/spicyhome/pos/ui/navigation/NavGraph.kt` (130 lines).
- `RealtimeClient`: `apps/android/app/src/main/java/com/spicyhome/pos/data/realtime/RealtimeClient.kt` (180 lines).
- `RealtimeEvent`: `apps/android/app/src/main/java/com/spicyhome/pos/data/realtime/RealtimeEvent.kt` (7 lines).
- `MoneyFormatter`: `apps/android/app/src/main/java/com/spicyhome/pos/util/MoneyFormatter.kt` (41 lines).
- `SessionManager`: `apps/android/app/src/main/java/com/spicyhome/pos/data/SessionManager.kt` (36 lines).
- `PreferencesManager`: `apps/android/app/src/main/java/com/spicyhome/pos/data/PreferencesManager.kt` (58 lines).
- `ApiClientProvider`: `apps/android/app/src/main/java/com/spicyhome/pos/data/api/ApiClientProvider.kt` (103 lines).
- `SpicyHomeApp`: `apps/android/app/src/main/java/com/spicyhome/pos/SpicyHomeApp.kt` (166 lines).
- `AuthRepository`: `apps/android/app/src/main/java/com/spicyhome/pos/data/repository/AuthRepository.kt` (23 lines).
- `OrderViewModelTest`: `apps/android/app/src/test/java/com/spicyhome/pos/ui/OrderViewModelTest.kt` (420 lines).
- `OrderRepositoryTest`: `apps/android/app/src/test/java/com/spicyhome/pos/data/repository/OrderRepositoryTest.kt` (198 lines).
- `RealtimeClientTest`: `apps/android/app/src/test/java/com/spicyhome/pos/data/realtime/RealtimeClientTest.kt` (481 lines).
- `OrdersViewModelTest`: `apps/android/app/src/test/java/com/spicyhome/pos/ui/OrdersViewModelTest.kt` (212 lines).
- `FakePreferencesManager`: `apps/android/app/src/test/java/com/spicyhome/pos/data/FakePreferencesManager.kt` (22 lines).
- `FakeApiClientProvider`: `apps/android/app/src/test/java/com/spicyhome/pos/data/api/FakeApiClientProvider.kt` (24 lines).
- Android README: `apps/android/README.md` (146 lines).
