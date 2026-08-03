#!/usr/bin/env node
/**
 * bake-open-kots.mjs — open-orders KOT bake-and-send probe
 *
 * See docs/printing/kitchen-kot-open-orders-probe.md for the full procedure,
 * safety notes (paper storm — read §6 first), and the emit-script contract.
 *
 * Reads the local SQLite DB read-only, builds one ESC/POS kitchen ticket per
 * (open order with items × active kitchen printer) with the server's own
 * KitchenTicketBuilder, and emits a single self-contained Node 18 script at
 * scripts/printing/kitchen/out/send-open-kots.js. Copy that script to the
 * live Win7 POS machine and run it with the portable Node 18:
 *
 *   node send-open-kots.js
 *
 * This wrapper is thin on purpose: it forwards to the dedicated Bazel target,
 * which resolves runfiles (including the better-sqlite3 native addon) and
 * sets TZ=Asia/Riyadh. DB resolution happens inside the module
 * (--db flag > SPICYHOME_DB env > .env.worktree > ./data/spicyhome.db), so
 * nothing needs reimplementing here.
 *
 *   node scripts/printing/kitchen/bake-open-kots.mjs
 *   node scripts/printing/kitchen/bake-open-kots.mjs --db path/to.db --out path/to/out.js
 */
import { execFileSync } from 'node:child_process';

try {
  execFileSync('bazel', ['run', '//apps/server:bake_open_kots', '--', ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
} catch (err) {
  // Preserve the baker's exit code (empty bake / missing DB exits non-zero).
  process.exit(typeof err.status === 'number' ? err.status : 1);
}
