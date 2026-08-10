# Print Probe (Bake-and-Send)

How SpicyHome POS validates every production print layout on real thermal
printers **without cutting a release**: the dev machine bakes real ESC/POS
buffers from the local SQLite DB into a single Node 18 emit script, and that
script is copied to the live Windows 7 POS machine and run — it prints the
baked buffers to the target printers immediately.

This is the generic twin of the Arabic hardware probes
(`docs/printing/arabic-thermal.md`): same idea (produce from the server's own
modules so probes can never drift from production code), different artifact
(an executable emit script instead of `.bin` preview files). Unlike the Arabic
01–06 probe set, the print probe covers **all five production print layouts**:
kitchen tickets, simplified-invoice receipts, open-order receipts, credit
notes, and the diagnostic test ticket.

> Status: implemented. The baker CLI
> (`bazel run //apps/server:bake_print_probe`, module
> `apps/server/src/modules/printers/bake/`) and the emit-script generator are
> in place and documented; this document describes the running probe.

## 1. Purpose

- Validate a layout change (header fields, spacing, item blocks, Arabic
  charset vs raster, QR placement) on **real thermal hardware** before it
  ships — without building the Win7 bundle, without touching the live server,
  and without any release/deploy path.
- A **bake** step runs on the developer machine: read the local DB
  read-only, build one ESC/POS buffer per (document × target printer) using
  the same `print-documents.ts` helpers the production print paths use, and
  bake the buffers + connection targets into a single self-contained JS file.
- A **send** step runs on the live Win7 POS machine:
  `node send-<format>.js` prints every baked buffer immediately. No DB, no
  server, no order events.
- One CLI and one emit-script contract cover all formats, so a kitchen layout
  change and a receipt layout change use the identical procedure.

## 2. Architecture (bake → copy → send)

| Piece             | Location                                                                       | Status      |
| ----------------- | ------------------------------------------------------------------------------ | ----------- |
| Baker CLI (Bazel) | `bazel run //apps/server:bake_print_probe` (`apps/server` module `bake/`)      | implemented |
| Emitted artifact  | `tmp/print-probe/send-<format>.js` (under `tmp/` gitignore; never committed)   | generated   |
| Probe tooling     | Baker lives in the repo permanently; the **emitted script is never committed** | committed   |

Flow:

```
dev machine                            live Win7 POS machine
+------------------------------------+   +-----------------------------------+
| local DB (read-only)               |   | node send-<format>.js             |
|   -> print-documents.ts helpers    |   |   -> TCP raw :9100                |
|   -> bake base64 buffers           |   |   -> win_rawprint.exe + queue     |
|   -> emit single script            |   |   prints immediately              |
+------------------------------------+   +-----------------------------------+
               |                            ^
               |  copy emit script          |
               +----------------------------+
```

The baker produces buffers via the server's own document builders
(`apps/server/src/modules/printers/print-documents.ts`), so the probe layout
is exactly the production layout — same guarantee the Arabic probes get from
`arabic-probe-bins.ts`.

## 3. CLI

```sh
bazel run //apps/server:bake_print_probe -- --format <format> [options]
```

`--format` is required; everything else is optional. The baker prints the
plan (one line per job: label → printer name), writes the emit script, and
exits 0. Any hard failure (bad flags, empty bake, DB error) exits 1 **without**
writing the emit script.

## 4. Formats

| Format        | Builder helper                 | Default selection (no filters)                                                | Printer role(s) | `--all`                             | Recent-1 default |
| ------------- | ------------------------------ | ----------------------------------------------------------------------------- | --------------- | ----------------------------------- | ---------------- |
| `kitchen`     | `buildKitchenTicketBuffer`     | every **open** order with items × every active kitchen printer                | kitchen         | soft no-op (already all)            | no               |
| `receipt`     | `buildSimplifiedInvoiceBuffer` | the **single most recent** eligible order (paid + printable ZATCA invoice QR) | receipt         | widens to every eligible paid order | yes              |
| `open_order`  | `buildOpenOrderReceiptBuffer`  | every **open** order with items × every active receipt printer                | receipt         | soft no-op (already all)            | no               |
| `credit_note` | `buildCreditNoteBuffer`        | the **single most recent** eligible refund (printable ZATCA credit-note QR)   | receipt         | widens to every eligible refund     | yes              |
| `test`        | `buildTestTicketBuffer`        | every active printer (any role)                                               | any             | soft no-op (already all)            | no               |

Notes:

- **`kitchen` / `open_order`**: item-less open orders are skipped with a note
  in the default sweep. `--limit` takes the first N eligible orders by order
  id ascending.
- **`receipt` / `credit_note`**: eligibility mirrors the helpers' printable-QR
  lookup (`PRINTABLE_QR_STATUSES` + non-null `qr_tlv`) so bake eligibility and
  the printed buffer cannot disagree. Use `--all` to widen past the
  most-recent-1 default; `--limit` then caps the widened set (first N by id
  ascending). `--limit` alone does **not** widen a recent-1 default.
- **`test`**: synthetic — no document lookups, buffer built from the printer
  row only. Runs on printers of any role.
- `--kick-drawer` is honored by `receipt` and `credit_note` only; see §5.

## 5. Flags

| Flag             | Meaning                                                                                                                                                           | Valid formats                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `--format`       | **Required.** `kitchen` \| `receipt` \| `open_order` \| `credit_note` \| `test`                                                                                   | all                                       |
| `--db`           | SQLite path override. Default: `SPICYHOME_DB` env → `.env.worktree` → `./data/spicyhome.db` (first match wins; relative paths resolve against the workspace root) | all                                       |
| `--out`          | Emit script path override. Default: `tmp/print-probe/send-<format>.js` (workspace root; `tmp/` gitignored)                                                        | all                                       |
| `--order <id>`   | Explicit order id (repeatable). Open with items for `kitchen`/`open_order`; paid + printable QR for `receipt`; order's eligible refunds for `credit_note`         | kitchen, receipt, open_order, credit_note |
| `--refund <id>`  | Explicit refund id (repeatable). Must exist with a printable credit-note QR                                                                                       | credit_note only                          |
| `--printer <id>` | Explicit printer id (repeatable). Must be active; kitchen-role for `kitchen`, receipt-role for `receipt`/`open_order`/`credit_note`, any role for `test`          | all                                       |
| `--limit <n>`    | Cap to the first N sources by id ascending (order id for order formats, refund id for `credit_note`, printer id for `test`)                                       | all                                       |
| `--all`          | Widen `receipt`/`credit_note` from most-recent-1 to every eligible source; soft no-op (with a note) elsewhere                                                     | receipt, credit_note                      |
| `--kick-drawer`  | **Opt-in** cash-drawer kick on the printed receipt/credit note                                                                                                    | receipt, credit_note only                 |

Invalid combinations **hard-fail** (exit 1, no emit script):

| Combination                                                                                           | Why                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--kick-drawer` with `kitchen` / `open_order` / `test`                                                | kitchen tickets have no drawer; open-order receipts are deliberately not tax invoices and never kick (builder hard-codes `kickDrawer` false); the diagnostic ticket has its own content |
| `--refund` with `kitchen` / `open_order` / `receipt` / `test`                                         | those formats bake orders, not refunds                                                                                                                                                  |
| `--order` with `test`                                                                                 | test tickets are synthetic — no orders                                                                                                                                                  |
| `--order`/`--refund`/`--printer` id that is missing, wrong status, item-less, inactive, or wrong role | hard `BakeFilterError` naming the id and the reason                                                                                                                                     |

`--refund` + `--order` together are **allowed** for `credit_note`: the sets
are unioned and every explicitly listed refund is validated.

## 6. Hard-fail vs soft-skip

- **Hard-fail (explicit filters).** Any explicit `--order` / `--refund` /
  `--printer` id that cannot be baked — missing, not open, item-less, not
  paid, no printable QR, inactive, wrong role — throws a `BakeFilterError`
  naming the id and the reason. Invalid flag combos per format (§5) are the
  same class of failure. The CLI prints the message and exits 1; the emit
  script is never written.
- **Soft-skip (default sweep).** Without explicit ids, ineligible sources are
  skipped with a human-readable note: item-less open orders, orders/refunds
  without a printable QR. `--all` on formats that already default to "all" is
  likewise a soft note, not an error.

## 7. Empty bake

If the bake produces no jobs — no eligible sources, or no active printers for
the format's role — the baker prints
`no jobs for format '<format>' — not writing the emit script.` and **exits
non-zero without overwriting** any previous emit script. A stale
`send-<format>.js` on the Win7 box can therefore never be silently replaced
with an empty one. `writeEmitScript` is only ever called with a non-empty job
list.

## 8. Emit script

`tmp/print-probe/send-<format>.js` (generated, per §3/§5):

- **Node 18 compatible** (runs on the Win7 box's portable Node 18), single
  plain CommonJS file, **no dependencies** beyond Node builtins
  (`net`, `fs`, `path`, `os`, `child_process`). Generated code stays
  ES5-ish (`var`/`function`, string concatenation) — trivially greppable and
  safe on old engines.
- Contains the baked ESC/POS buffers (**base64**) plus the printer connection
  targets baked in, embedded as `JSON.parse('<escaped json>')` — no
  `require('./jobs.json')` at runtime.
- Honors each printer's `connectionType`:
  - **`tcp`** — raw socket to the baked `ip:port` using `net` (raw :9100,
    same as `printer-transport.ts`); 5 s timeout per job.
  - **`windows`** — writes a temp `.bin` and spawns
    `win_rawprint.exe "<queue name>" <temp .bin>` via the baked queue name
    (same as `win-rawprint-transport.ts`); 15 s timeout per job; **win32
    only**.
  - `win_rawprint.exe` is resolved with the production rules
    (`WIN_RAWPRINT_PATH` env → cwd → `cwd/bin/` → `cwd/prebuilt/` → next to
    `process.execPath`).
- **Prints immediately on run** — there is no dry-run and no confirm gate.
  Running the script means printing, and the header comment leads with a loud
  banner:
  ```
  !!! PAPER STORM WARNING !!!
  Running this script IMMEDIATELY prints every baked job to the real
  printers. There is no dry-run. Do not run during service, and tell the
  kitchen before a probe run.
  ```
- **Sequential and resilient**: jobs print one at a time; a failed job is
  logged as `FAIL` and the run **continues** — a dead printer must not stop
  the other jobs. Exit code 0 when every job printed, 1 when one or more
  failed, 2 defensively if the payload is empty in transit (the baker never
  writes an empty script).
- On site, the script does **no DB I/O** — network/spooler I/O only. It runs
  with no server, no SQLite, no ledger.

## 9. How to run

Bake on the dev machine (from repo root; after worktree bootstrap so
`.env.worktree` / `SPICYHOME_DB` is set):

```sh
# kitchen tickets: every open order with items -> every active kitchen printer
bazel run //apps/server:bake_print_probe -- --format kitchen

# receipt: most recent paid order with printable ZATCA QR -> active receipt printers
bazel run //apps/server:bake_print_probe -- --format receipt

# receipt: every eligible paid order, with drawer kick
bazel run //apps/server:bake_print_probe -- --format receipt --all --kick-drawer

# open-order receipt: every open order with items -> active receipt printers
bazel run //apps/server:bake_print_probe -- --format open_order

# credit note: most recent refund with printable ZATCA credit-note QR
bazel run //apps/server:bake_print_probe -- --format credit_note

# credit note: all refunds of a specific order
bazel run //apps/server:bake_print_probe -- --format credit_note --order 42

# diagnostic test ticket: every active printer
bazel run //apps/server:bake_print_probe -- --format test

# explicit targets / overrides
bazel run //apps/server:bake_print_probe -- --format kitchen --order 7 --printer 2
bazel run //apps/server:bake_print_probe -- --format receipt --db path/to/live.db --out tmp/print-probe/send-receipt.js
```

Copy `tmp/print-probe/send-<format>.js` to the Win7 POS machine, then:

```sh
node send-<format>.js
```

For `windows`-connection printers, `win_rawprint.exe` must be discoverable —
alongside the script, in `bin/`/`prebuilt/`, or via `WIN_RAWPRINT_PATH` — the
same resolution rules as the production server.

## 10. Safety

- **Paper storm risk:** one run = `documents × targetPrinters` physical
  prints. `--format kitchen` with a busy open-orders list and two kitchen
  printers is a double-digit number of tickets in seconds; `--all` on
  `receipt`/`credit_note` multiplies every eligible document by every receipt
  printer. Run it when you want that, not "just to try".
- **Service-hours risk:** kitchen staff and customers will see and react to
  these tickets. Do not run during service, and tell the kitchen before a
  probe run.
- **No dry-run:** the emit script prints the moment it starts, with no confirm
  gate. If you only want to inspect, review the bake plan on the dev machine —
  the CLI logs one `label -> printer` line per job before writing. The
  intended review surface is the live printer; there are no laptop-side
  `.bin` previews by design (§11).
- **Kick-drawer is opt-in only:** `--kick-drawer` must be passed explicitly
  on the bake command line; the default never kicks. The flag is rejected
  outright for `kitchen`/`open_order`/`test`.
- **Empty bake is loud:** a non-zero exit tells you nothing was baked; the
  previous emit script is preserved untouched (§7).

## 11. Non-goals

- **Not** writing ledger events — zero `order_events`, zero order/printer
  mutations. The SQLite connection is opened **read-only**.
- **Not** ADR 0006 send-to-kitchen deltas — the `kitchen` format bakes full
  current lines per open order (the reprint path), not differential item
  mutations.
- **Not** a merge of the Arabic probes — `arabic_probes` (01–06 `.bin`
  files) stays a separate laptop-side charset/raster validation tool for new
  printer models. The bake probe prints all formats — including Arabic
  receipts via the same `ReceiptBuilder` — through real printers; the two
  procedures complement, they do not replace each other
  (`docs/printing/arabic-thermal.md` §5).
- **No laptop-side `.bin` preview artifacts for this tool** — the only
  artifact is the emit script; anything printable goes through the real
  printers.
- **Not** a release/deploy path — no bundle, no version bump, no server
  involvement.

## 12. Code pointers

| Concern                                  | Where                                                                                                                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bake CLI + entry                         | `apps/server/src/modules/printers/bake/cli.ts` — `bazel run //apps/server:bake_print_probe`                                                                                                                                  |
| Job collection (eligibility/filters)     | `apps/server/src/modules/printers/bake/collect.ts` (`BakeFilterError`, per-format collectors)                                                                                                                                |
| Emit script generation + write           | `apps/server/src/modules/printers/bake/emit.ts` (`buildEmitScriptSource`, `writeEmitScript`)                                                                                                                                 |
| Shared bake types + formats              | `apps/server/src/modules/printers/bake/types.ts` (`ProbeFormat`, `BakedPrintJob`, `BakeFilters`)                                                                                                                             |
| Bake DB path resolution                  | `apps/server/src/modules/printers/bake/db-path.ts` (`resolveBakeDbPath`)                                                                                                                                                     |
| Shared buffer helpers (all five formats) | `apps/server/src/modules/printers/print-documents.ts` (`buildKitchenTicketBuffer`, `buildOpenOrderReceiptBuffer`, `buildSimplifiedInvoiceBuffer`, `buildCreditNoteBuffer`, `buildTestTicketBuffer`, `PRINTABLE_QR_STATUSES`) |
| Kitchen ticket builder                   | `apps/server/src/modules/printers/kitchen-ticket-builder.ts` (`KitchenTicketBuilder`)                                                                                                                                        |
| Receipt / credit-note builder            | `apps/server/src/modules/printers/receipt-builder.ts` (`ReceiptBuilder`)                                                                                                                                                     |
| Test ticket builder                      | `apps/server/src/modules/printers/test-ticket-builder.ts` (`TestTicketBuilder`)                                                                                                                                              |
| Production wrappers                      | `printKitchenTickets`, `printReceipt`, `printOpenOrderReceipt`, `printRefundReceipt`, `printTestTicket` in `apps/server/src/modules/printers/print-job.service.ts`                                                           |
| Bazel target                             | `js_binary bake_print_probe` in `apps/server/BUILD.bazel`                                                                                                                                                                    |
| TCP transport                            | `apps/server/src/modules/printers/printer-transport.ts`                                                                                                                                                                      |
| Windows transport                        | `apps/server/src/modules/printers/win-rawprint-transport.ts` (+ `win-rawprint-helpers.ts` for exe resolution)                                                                                                                |
| Analogous probe pattern                  | `scripts/arabic-print-probes.mjs` + `apps/server/src/modules/printers/arabic-probe-bins.ts` + `docs/printing/arabic-thermal.md`                                                                                              |

The baker must call the same `print-documents.ts` helpers the production
paths use — a probe that re-implements layout is a probe that lies.

## 13. Related

- `docs/printing/arabic-thermal.md` — the receipt-side Arabic hardware probe
  procedure (01–06 `.bin` set); probe philosophy ("produce from production
  modules") applies here too, while the artifacts and scope stay separate
  (§11).
- ADR 0006 — send-to-kitchen deltas and the `order_events` ledger this probe
  deliberately bypasses.
