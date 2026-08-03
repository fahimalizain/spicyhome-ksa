# Kitchen KOT Open-Orders Probe (Bake-and-Send)

How SpicyHome POS validates `KitchenTicketBuilder` layout changes on real
thermal printers **without cutting a release**: the dev machine bakes real
ESC/POS buffers from the local SQLite DB into a single Node 18 script, and
that script is copied to the live Windows 7 POS machine and run — it sends
the baked buffers to every active kitchen printer immediately.

This is the kitchen-ticket twin of the Arabic hardware probes
(`docs/printing/arabic-thermal.md`): same idea (produce from the server's own
modules so probes can never drift from production code), different artifact
(an executable emit script instead of `.bin` preview files).

> Status: implemented. The baker CLI (`bazel run //apps/server:bake_open_kots`,
> module `apps/server/src/modules/printers/bake-open-kots.ts`), the thin
> wrapper (`scripts/printing/kitchen/bake-open-kots.mjs`), and the emit-script
> generator are all in place and documented; this document describes the
> running probe.

## 1. Purpose

- Validate a `KitchenTicketBuilder` layout change (header fields, spacing,
  table/delivery emphasis, item blocks) on **real thermal hardware** before
  it ships — without building the Win7 bundle, without touching the live
  server, and without any release/deploy path.
- A **bake** step runs on the developer machine: read the local DB
  read-only, build one ESC/POS buffer per (open order with items × active
  kitchen printer), and bake the buffers + connection targets into a single
  self-contained JS file.
- A **send** step runs on the live Win7 POS machine: `node send-open-kots.js`
  prints every baked buffer immediately. No DB, no server, no order events.

## 2. Architecture (arabic_probes pattern)

| Piece                    | Location                                                                                | Status      |
| ------------------------ | --------------------------------------------------------------------------------------- | ----------- |
| Baker CLI (Bazel target) | `apps/server` module — `bazel run //apps/server:bake_open_kots`                         | implemented |
| Thin wrapper             | `scripts/printing/kitchen/bake-open-kots.mjs` (runs `bazel run`)                        | implemented |
| Emitted artifact         | `scripts/printing/kitchen/out/send-open-kots.js` (`out/` is gitignored)                 | generated   |
| Probe tooling            | Baker + wrapper live in the repo permanently; the **emitted script is never committed** | committed   |

Flow:

```
dev machine                       live Win7 POS machine
+-------------------------------+   +--------------------------------+
| local DB (read-only)          |   | node send-open-kots.js         |
|   -> KitchenTicketBuilder     |   |   -> TCP raw :9100             |
|   -> bake base64 buffers      |   |   -> win_rawprint.exe + queue  |
|   -> emit single script       |   |   prints immediately           |
+-------------------------------+   +--------------------------------+
              |                          ^
              |  copy emit script        |
              +--------------------------+
```

The baker is produced by the server's own builder
(`apps/server/src/modules/printers/kitchen-ticket-builder.ts`), so the probe
layout is exactly the production layout — same guarantee the Arabic probes
get from `arabic-probe-bins.ts`.

## 3. Bake-time data (read-only SQLite)

### 3.1 DB resolution

Precedence (first match wins):

| Priority | Source                                         | Example                            |
| -------- | ---------------------------------------------- | ---------------------------------- |
| 1        | `--db` CLI flag                                | `--db /path/to/live.db`            |
| 2        | `SPICYHOME_DB` env var                         | `SPICYHOME_DB=./data/spicyhome.db` |
| 3        | `SPICYHOME_DB` from `.env.worktree` (if unset) | set by worktree bootstrap          |
| 4        | Default                                        | `./data/spicyhome.db`              |

`--out` overrides the emit path (default
`scripts/printing/kitchen/out/send-open-kots.js`). After worktree bootstrap
`.env.worktree` already carries `SPICYHOME_DB`, so the default invocation
just works.

### 3.2 Selections

| Thing        | Rule                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Orders       | `status = 'open'` (schema: `'open' \| 'paid' \| 'voided' \| 'refunded'`).                                                                              |
| Empty orders | **Skipped** — an open order with no `order_items` produces no ticket; the baker logs each skip.                                                        |
| Items        | **Full current lines** from `order_items` — mirrors `printKitchenTickets` (reprint path), **not** the differential deltas of ADR 0006 send-to-kitchen. |
| Printers     | All **active** kitchen-role printers (`listActiveByRole(KITCHEN)`) — same TEMPORARY fan-out as production.                                             |
| Buffers      | One ticket buffer per (open order with items × kitchen printer).                                                                                       |

### 3.3 Ticket header fields (same as production kitchen path)

Each buffer is built with `KitchenTicketBuilder.build()`, exactly like
`printKitchenTickets` does per printer:

| Field                  | Source                                                         |
| ---------------------- | -------------------------------------------------------------- |
| `documentId`           | `orders.document_id`, fallback `Order-${orderNo}`              |
| `printerName`          | per target printer (`printers.name`)                           |
| `createdAt`            | `orders.created_at` (rendered in Asia/Riyadh, like production) |
| `orderType`            | `dine_in` / `takeaway`                                         |
| `tableName`            | joined from `tables` via `orders.table_id`                     |
| `deliveryPartnerTitle` | joined from `delivery_partners` (ADR 0007)                     |
| `deliveryExternalRef`  | `orders.delivery_external_ref`                                 |
| `orderNotes`           | `orders.notes`                                                 |
| `createdByName`        | `users.name` of `orders.created_by`                            |
| `items`                | qty, name, notes per `order_items` row                         |

### 3.4 Zero writes

The bake opens SQLite **read-only**. It never inserts into `order_events`,
never touches printed-qty/ledger state, never mutates orders or printers.
This is a probe — **not** a real send-to-kitchen, and it must not look like
one to the ledger.

## 4. Emit script contract

`scripts/printing/kitchen/out/send-open-kots.js` (generated):

- **Node 18 compatible** (runs on the Win7 box's portable Node 18), single
  file, no dependencies.
- Contains the baked ESC/POS buffers (**base64**) plus the printer connection
  targets baked in.
- Honors each printer's `connectionType`:
  - **`tcp`** — raw socket to the baked `ip:port` using `net` (raw :9100,
    same as `printer-transport.ts`).
  - **`windows`** — spawns `win_rawprint.exe "<queue name>" <temp .bin>` via
    the baked queue name (same as `win-rawprint-transport.ts`).
- **Prints immediately on run** — there is no dry-run default. Running the
  script means printing: `openOrders × kitchenPrinters` full reprints.
- On site, the script does **no DB I/O** — network/spooler I/O only. It runs
  with no server, no SQLite, no ledger.

**Empty bake semantics:** if the bake produces no jobs (no open orders with
items) **or** there are no active kitchen printers, the baker **exits
non-zero** and **must not overwrite** a previous emit script — so a stale
`send-open-kots.js` on the Win7 box can never be silently replaced with an
empty one.

## 5. How to run

Bake on the dev machine (from repo root; after worktree bootstrap so
`.env.worktree` / `SPICYHOME_DB` is set):

```sh
# from repo root
node scripts/printing/kitchen/bake-open-kots.mjs
# optional overrides:
node scripts/printing/kitchen/bake-open-kots.mjs --db path/to.db --out scripts/printing/kitchen/out/send-open-kots.js
```

Copy the emit script to the Win7 POS machine, then:

```sh
node send-open-kots.js
```

For `windows`-connection printers, `win_rawprint.exe` must be discoverable —
alongside the script, in `prebuilt/`, or via `WIN_RAWPRINT_PATH` — the same
resolution rules as the production server.

## 6. Safety

- **Paper storm risk:** one run = `openOrders × kitchenPrinters` full
  reprints. A busy open-orders list with two kitchen printers is a
  double-digit number of physical tickets in seconds. Run it when you want
  that, not "just to try".
- **Service-hours risk:** kitchen staff will see and react to these tickets.
  Do not run during service, and tell the kitchen before a probe run.
- **No dry-run:** the emit script prints the moment it starts. If you only
  want to inspect, review the bake output on the dev machine instead —
  but note there are no laptop-side `.bin` previews by design (§7); the
  intended review surface is the live printer.
- **Empty bake is loud:** a non-zero exit tells you nothing was baked; the
  previous emit script is preserved untouched.

## 7. Non-goals

- **Not** differential kitchen deltas (ADR 0006 send-to-kitchen) — full
  current lines only.
- **Not** writing ledger events — zero `order_events`, zero order/printer
  mutations.
- **Not** a release/deploy path — no bundle, no version bump, no server
  involvement.
- **No laptop-side `.bin` preview artifacts** — the only artifact is the
  emit script; anything printable goes through the real printers.
- **Kitchen tickets remain English/ASCII** — Arabic stays receipt-only, see
  `docs/printing/arabic-thermal.md` §1.

## 8. Code pointers

| Concern                           | Where                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baker (bake + emit CLI)           | `apps/server/src/modules/printers/bake-open-kots.ts` (wired as `bazel run //apps/server:bake_open_kots` via the wrapper `scripts/printing/kitchen/bake-open-kots.mjs`) |
| Ticket builder (shared with prod) | `apps/server/src/modules/printers/kitchen-ticket-builder.ts`                                                                                                           |
| Production full reprint path      | `printKitchenTickets` in `apps/server/src/modules/printers/print-job.service.ts`                                                                                       |
| TCP transport                     | `apps/server/src/modules/printers/printer-transport.ts`                                                                                                                |
| Windows transport                 | `apps/server/src/modules/printers/win-rawprint-transport.ts` (+ `win-rawprint-helpers.ts` for exe resolution)                                                          |
| Analogous probe pattern           | `scripts/arabic-print-probes.mjs` + `apps/server/src/modules/printers/arabic-probe-bins.ts` + `docs/printing/arabic-thermal.md`                                        |

The baker must call the same `KitchenTicketBuilder` used by
`printKitchenTickets` — a probe that re-implements layout is a probe that
lies.

## 9. Related

- `docs/printing/arabic-thermal.md` — the receipt-side hardware probe
  procedure; Arabic scope (receipts/credit notes only) and the probe
  philosophy ("produce from production modules") apply here too.
- ADR 0006 — send-to-kitchen deltas and the `order_events` ledger this probe
  deliberately bypasses.
