# Kitchen KOT bake scripts

This directory holds the tooling for the open-orders kitchen-ticket (KOT)
hardware probe: bake real ESC/POS buffers from the local SQLite DB using the
server's own `KitchenTicketBuilder`, and send them to the live kitchen
printers on the Windows 7 POS machine. It is the kitchen-ticket twin of the
Arabic hardware probes (`scripts/arabic-print-probes.mjs`); the full design
lives in `docs/printing/kitchen-kot-open-orders-probe.md`.

## Bake

From the repo root (after worktree bootstrap so `.env.worktree` /
`SPICYHOME_DB` is set):

```sh
node scripts/printing/kitchen/bake-open-kots.mjs
```

Optional overrides:

```sh
node scripts/printing/kitchen/bake-open-kots.mjs --db path/to.db --out path/to/out.js
```

The wrapper just forwards to `bazel run //apps/server:bake_open_kots`, which
resolves runfiles (including the `better-sqlite3` native addon) and sets
`TZ=Asia/Riyadh`. DB resolution happens inside the module: `--db` flag >
`SPICYHOME_DB` env > `.env.worktree` > `./data/spicyhome.db`.

## Default emit

`scripts/printing/kitchen/out/send-open-kots.js` — one baked job per (open
order with items × active kitchen printer), connection targets baked in.

## Send on the Win7 machine

Copy the emit script to the POS machine, then with the portable Node 18:

```sh
node send-open-kots.js
```

Honors each printer's `connectionType`: `tcp` raw socket or
`win_rawprint.exe` (same resolution rules as the production server).

## Warning

- **Paper storm:** one run = openOrders × kitchenPrinters full reprints.
- **No dry-run:** the emit script prints the moment it starts.
- Do not run during service; tell the kitchen before a probe run.
- An empty bake (no open orders with items, or no active kitchen printers)
  exits non-zero and never overwrites a previous emit script.

## Note

`out/` is gitignored — the emit script contains baked base64 buffers and is
regenerated locally per probe; never commit it.
