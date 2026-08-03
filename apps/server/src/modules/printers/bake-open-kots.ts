/**
 * Open-orders KOT baker — bake-and-send hardware probe (docs/printing/
 * kitchen-kot-open-orders-probe.md).
 *
 * Reads the local SQLite DB **read-only**, builds one ESC/POS kitchen ticket
 * per (open order with items x active kitchen printer) using the real
 * `KitchenTicketBuilder` (the same builder `printKitchenTickets` uses), and
 * emits a single self-contained Node 18 script that prints every baked buffer
 * immediately when run on the live Win7 POS machine.
 *
 * Zero writes: no order_events, no order/printer mutations, no ledger state.
 * This is a probe — not a real send-to-kitchen.
 *
 * Pure module (no NestJS) so it can be driven two ways:
 *   1. `bazel run //apps/server:bake_open_kots`
 *      `bazel run //apps/server:bake_open_kots -- --db path/to.db --out path/to/out.js`
 *      (js_binary entry; this module carries the CLI main)
 *   2. jest: `bazel test //apps/server:test --test_filter=bake-open-kots`
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { deliveryPartners, orderItems, orders, printers, tables, users } from '@spicyhome/db';
import { PrinterRole } from '@spicyhome/shared';
import { KitchenTicketBuilder } from './kitchen-ticket-builder';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// ── Types ────────────────────────────────────────────────────────────────────

/** Connection target baked into the emit script, straight from the printers row. */
export interface BakedKotPrinterTarget {
  printerId: number;
  printerName: string; // printers.name — also printed in the ticket header
  connectionType: 'tcp' | 'windows';
  ip: string;
  port: number;
  windowsPrinterName: string | null;
}

/** One baked ESC/POS job: a single ticket buffer for a single target printer. */
export interface BakedKotJob {
  orderId: number;
  documentId: string;
  printer: BakedKotPrinterTarget;
  /** ESC/POS bytes from KitchenTicketBuilder.build() */
  buffer: Buffer;
}

export interface BakeOpenKotsResult {
  jobs: BakedKotJob[];
  /** Open orders skipped because they had zero order_items. */
  skippedEmptyOrderIds: number[];
  kitchenPrinterCount: number;
  /** Total open orders, including the empty ones that were skipped. */
  openOrderCount: number;
}

export type BakeDb = BetterSQLite3Database<typeof schema>;

// ── Collect ──────────────────────────────────────────────────────────────────

/**
 * Collect one baked kitchen ticket per (open order with items x active
 * kitchen printer), mirroring `printKitchenTickets` header resolution in
 * print-job.service.ts (documentId fallback, table join, created-by name,
 * delivery partner title, item snapshots).
 *
 * Read-only: only ever SELECTs. Never INSERT/UPDATE/DELETE.
 */
export function collectOpenKotJobs(db: BakeDb): BakeOpenKotsResult {
  const openOrders = db
    .select()
    .from(orders)
    .where(eq(orders.status, 'open'))
    .orderBy(orders.id)
    .all();
  const kitchenPrinters = db
    .select()
    .from(printers)
    .where(and(eq(printers.role, PrinterRole.KITCHEN), eq(printers.isActive, 1)))
    .orderBy(printers.id)
    .all();

  const jobs: BakedKotJob[] = [];
  const skippedEmptyOrderIds: number[] = [];

  for (const order of openOrders) {
    // Full current lines from order_items — mirrors the reprint path, not the
    // differential deltas of ADR 0006 send-to-kitchen.
    const oiRows = db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(orderItems.id)
      .all();
    if (oiRows.length === 0) {
      skippedEmptyOrderIds.push(order.id);
      continue;
    }

    const header = resolveKotHeader(db, order);
    const items = oiRows.map((oi) => ({
      qty: oi.qty,
      name: oi.itemName,
      notes: oi.notes,
      unitPriceHalalas: oi.unitPriceHalalas,
      totalHalalas: oi.totalHalalas,
    }));

    for (const printer of kitchenPrinters) {
      // Build per printer so each ticket's header names its own station —
      // exactly like printKitchenTickets does.
      const buffer = new KitchenTicketBuilder().build({
        documentId: header.documentId,
        printerName: printer.name,
        createdAt: order.createdAt,
        orderType: order.type as 'dine_in' | 'takeaway',
        tableName: header.tableName,
        deliveryPartnerTitle: header.deliveryPartnerTitle,
        deliveryExternalRef: order.deliveryExternalRef ?? undefined,
        orderNotes: order.notes,
        createdByName: header.createdByName,
        totalHalalas: order.totalHalalas,
        items,
      });
      jobs.push({
        orderId: order.id,
        documentId: header.documentId,
        printer: {
          printerId: printer.id,
          printerName: printer.name,
          connectionType: printer.connectionType as 'tcp' | 'windows',
          ip: printer.ip,
          port: printer.port,
          windowsPrinterName: printer.windowsPrinterName,
        },
        buffer,
      });
    }
  }

  return {
    jobs,
    skippedEmptyOrderIds,
    kitchenPrinterCount: kitchenPrinters.length,
    openOrderCount: openOrders.length,
  };
}

/** Header fields resolved exactly like printKitchenTickets (per order, once). */
function resolveKotHeader(
  db: BakeDb,
  order: typeof orders.$inferSelect,
): {
  documentId: string;
  tableName?: string;
  createdByName?: string;
  deliveryPartnerTitle?: string;
} {
  // Prefer the ZATCA document id; fall back to the internal reference as
  // last resort (same pattern as receipts and printKitchenTickets).
  const documentId = order.documentId?.length ? order.documentId : `Order-${order.orderNo}`;

  let tableName: string | undefined;
  if (order.tableId != null) {
    const tbl = db.select().from(tables).where(eq(tables.id, order.tableId)).get();
    tableName = tbl?.name ?? undefined;
  }

  let createdByName: string | undefined;
  if (order.createdBy != null) {
    const user = db.select().from(users).where(eq(users.id, order.createdBy)).get();
    const name = user?.name?.trim();
    createdByName = name ? name : undefined;
  }

  let deliveryPartnerTitle: string | undefined;
  if (order.deliveryPartnerId) {
    const partner = db
      .select({ title: deliveryPartners.title })
      .from(deliveryPartners)
      .where(eq(deliveryPartners.id, order.deliveryPartnerId))
      .get();
    deliveryPartnerTitle = partner?.title ?? undefined;
  }

  return { documentId, tableName, createdByName, deliveryPartnerTitle };
}

// ── Emit script generation ───────────────────────────────────────────────────

/**
 * Build the full source of the Node 18-compatible emit script.
 *
 * The script prints immediately when run: every baked buffer is sent to its
 * printer (TCP raw socket or win_rawprint.exe spooler). It is plain
 * CommonJS with only Node builtins — no TypeScript, no server modules.
 */
export function buildEmitScriptSource(jobs: BakedKotJob[]): string {
  const payload = jobs.map((job) => ({
    orderId: job.orderId,
    documentId: job.documentId,
    printer: {
      printerId: job.printer.printerId,
      printerName: job.printer.printerName,
      connectionType: job.printer.connectionType,
      ip: job.printer.ip,
      port: job.printer.port,
      windowsPrinterName: job.printer.windowsPrinterName,
    },
    bufferB64: job.buffer.toString('base64'),
  }));

  // Embed as JSON.parse('<escaped json>') so tests can round-trip the payload
  // and so the script never needs `require('./jobs.json')` at runtime.
  const jsonLiteral = JSON.stringify(payload).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return `/**
 * Generated by bake-open-kots (apps/server/src/modules/printers/bake-open-kots.ts).
 * Do not edit by hand — regenerate with: bazel run //apps/server:bake_open_kots
 *
 * Requires Node 18+ (runs on the Win7 POS machine with the bundled portable
 * Node 18). Single file, no dependencies beyond Node builtins
 * (net, fs, path, os, child_process).
 *
 * Baked ${jobs.length} job(s): one per (open order with items x active kitchen printer).
 *
 * !!! PAPER STORM WARNING !!!
 * Running this script IMMEDIATELY prints every baked kitchen ticket to the
 * real kitchen printers. There is no dry-run. Do not run during service, and
 * tell the kitchen before a probe run.
 *
 * Exit code: 0 when every job printed; 1 when one or more jobs failed
 * (printing continues past failures — a dead printer must not stop the other
 * tickets); 2 defensively when the payload is empty (the baker never writes
 * an empty script).
 */
'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// Baked payload: one entry per (open order with items x kitchen printer).
const BAKED_JOBS = JSON.parse('${jsonLiteral}');

/**
 * Resolve win_rawprint.exe with the same rules as the production server
 * (win-rawprint-helpers.ts): WIN_RAWPRINT_PATH env, cwd, cwd/bin/,
 * cwd/prebuilt/, then next to process.execPath. Returns the full path or null.
 */
function resolveWinRawprintPath() {
  const envPath = process.env.WIN_RAWPRINT_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const relCandidates = [
    'win_rawprint.exe',
    path.join('bin', 'win_rawprint.exe'),
    path.join('prebuilt', 'win_rawprint.exe'),
  ];

  const cwd = process.cwd();
  for (let i = 0; i < relCandidates.length; i++) {
    const full = path.join(cwd, relCandidates[i]);
    if (fs.existsSync(full)) return full;
  }

  const execDir = path.dirname(process.execPath);
  for (let i = 0; i < relCandidates.length; i++) {
    const full = path.join(execDir, relCandidates[i]);
    if (fs.existsSync(full)) return full;
  }

  return null;
}

/** Human-readable target for logs: "192.168.1.51:9100" or the queue name. */
function describeTarget(printer) {
  if (printer.connectionType === 'windows') {
    return printer.windowsPrinterName || 'windows queue';
  }
  return printer.ip + ':' + printer.port;
}

/**
 * Send one baked buffer to a TCP raw printer (:9100). Resolves when the
 * socket closed cleanly; rejects on error/timeout.
 */
function printTcp(job, timeoutMs) {
  return new Promise(function (resolvePromise, rejectPromise) {
    const socket = new net.Socket();
    let timer = null;
    let settled = false;

    function fail(err) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.destroy();
      rejectPromise(err);
    }

    timer = setTimeout(function () {
      fail(new Error('TCP timeout after ' + timeoutMs + 'ms'));
    }, timeoutMs);

    socket.once('error', fail);
    socket.once('close', function () {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise();
    });

    socket.connect(job.printer.port, job.printer.ip, function () {
      socket.write(job.buffer);
      socket.end();
    });
  });
}

/**
 * Send one baked buffer to a Windows spooler queue via win_rawprint.exe:
 * write a temp .bin, spawn the exe with the queue name + path, await exit,
 * remove the temp file. win32 only — the Windows spooler cannot be driven
 * from another OS.
 */
function printWindows(job, timeoutMs) {
  return new Promise(function (resolvePromise, rejectPromise) {
    if (process.platform !== 'win32') {
      rejectPromise(new Error('windows connection target requires running on win32'));
      return;
    }
    if (!job.printer.windowsPrinterName) {
      rejectPromise(new Error('windows connection target is missing windowsPrinterName'));
      return;
    }
    const exe = resolveWinRawprintPath();
    if (!exe) {
      rejectPromise(
        new Error(
          'win_rawprint.exe not found — set WIN_RAWPRINT_PATH or place it next to ' +
            'this script, in bin/, or in prebuilt/',
        ),
      );
      return;
    }

    const tmpFile = path.join(
      os.tmpdir(),
      'send-open-kots-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.bin',
    );

    fs.writeFile(tmpFile, job.buffer, function (writeErr) {
      if (writeErr) {
        rejectPromise(writeErr);
        return;
      }
      const child = spawn(exe, [job.printer.windowsPrinterName, tmpFile], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      let settled = false;

      const timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        child.kill();
        fs.unlink(tmpFile, function () {});
        rejectPromise(new Error('win_rawprint.exe timed out after ' + timeoutMs + 'ms'));
      }, timeoutMs);

      child.stderr.on('data', function (chunk) {
        stderr += chunk.toString();
      });

      child.on('error', function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fs.unlink(tmpFile, function () {});
        rejectPromise(new Error('win_rawprint.exe spawn failed: ' + err.message));
      });

      child.on('close', function (code) {
        fs.unlink(tmpFile, function () {});
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolvePromise();
          return;
        }
        rejectPromise(
          new Error('win_rawprint.exe exited with ' + (stderr.trim() || String(code))),
        );
      });
    });
  });
}

async function main() {
  // Decode baked buffers once, up front.
  for (let i = 0; i < BAKED_JOBS.length; i++) {
    BAKED_JOBS[i].buffer = Buffer.from(BAKED_JOBS[i].bufferB64, 'base64');
  }

  console.log('send-open-kots: ' + BAKED_JOBS.length + ' baked kitchen ticket(s)');
  console.log('Plan:');
  for (let i = 0; i < BAKED_JOBS.length; i++) {
    const job = BAKED_JOBS[i];
    console.log(
      '  ' +
        (i + 1) +
        '. ' +
        job.documentId +
        ' -> ' +
        job.printer.printerName +
        ' (' +
        job.printer.connectionType +
        ' ' +
        describeTarget(job.printer) +
        ')',
    );
  }

  if (BAKED_JOBS.length === 0) {
    // Defensive: the baker never writes an empty script, but if the payload
    // was gutted in transit we must not silently print nothing successfully.
    console.error('No baked jobs found — nothing to print.');
    process.exitCode = 2;
    return;
  }

  // Print sequentially; keep going when a job fails. Exit non-zero at the end
  // if anything failed, so the caller knows the probe was incomplete.
  let failures = 0;
  for (let i = 0; i < BAKED_JOBS.length; i++) {
    const job = BAKED_JOBS[i];
    const target = describeTarget(job.printer);
    try {
      if (job.printer.connectionType === 'windows') {
        await printWindows(job, 15000);
      } else {
        await printTcp(job, 5000);
      }
      console.log('OK   ' + job.documentId + ' -> ' + job.printer.printerName + ' (' + target + ')');
    } catch (err) {
      failures++;
      console.error(
        'FAIL ' +
          job.documentId +
          ' -> ' +
          job.printer.printerName +
          ' (' +
          target +
          '): ' +
          (err && err.message ? err.message : String(err)),
      );
    }
  }

  if (failures > 0) {
    console.error(failures + ' of ' + BAKED_JOBS.length + ' job(s) failed.');
    process.exitCode = 1;
  } else {
    console.log('All ' + BAKED_JOBS.length + ' baked ticket(s) printed.');
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main().catch(function (err) {
    console.error('send-open-kots failed:', err && err.message ? err.message : String(err));
    process.exitCode = 1;
  });
}
`;
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Write the emit script to disk, creating parent directories on demand.
 * Callers must only call this when `jobs.length > 0` — an empty script must
 * never overwrite a previous good one (empty bake = loud failure, see probe
 * doc §6).
 */
export function writeEmitScript(outPath: string, source: string): void {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, source, 'utf8');
}

// ── DB path resolution ───────────────────────────────────────────────────────

export interface ResolveBakeDbPathOptions {
  /** Value of the --db CLI flag. */
  dbFlag?: string;
  /** Environment to read (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /** Working directory to resolve relative paths against (defaults to process.cwd()). */
  cwd?: string;
  /**
   * Injected contents of .env.worktree (for tests). When undefined the real
   * file is read from disk when needed.
   */
  envWorktreeContents?: string;
}

/**
 * Resolve the bake-time DB path. Precedence (first match wins):
 *   1. --db CLI flag
 *   2. SPICYHOME_DB env var
 *   3. SPICYHOME_DB parsed from .env.worktree (workspace root, then cwd)
 *   4. ./data/spicyhome.db
 * Relative paths resolve against BUILD_WORKSPACE_DIRECTORY || cwd (same idea
 * as packages/db/src/migrate.ts resolveDbPath).
 */
export function resolveBakeDbPath(opts: ResolveBakeDbPathOptions = {}): string {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const root = env.BUILD_WORKSPACE_DIRECTORY || cwd;

  let raw: string | undefined;
  if (opts.dbFlag) {
    raw = opts.dbFlag;
  } else if (env.SPICYHOME_DB) {
    raw = env.SPICYHOME_DB;
  } else {
    raw = readEnvWorktreeValue(root, cwd, opts.envWorktreeContents);
  }
  if (!raw) raw = './data/spicyhome.db';

  if (isAbsolute(raw)) return raw;
  return join(root, raw);
}

/**
 * Parse the value of SPICYHOME_DB out of .env.worktree-style contents.
 * Returns undefined when the key is absent. Values may be bare or quoted.
 */
export function parseEnvWorktreeContents(contents: string): string | undefined {
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (key !== 'SPICYHOME_DB') continue;
    let value = line.slice(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    return value || undefined;
  }
  return undefined;
}

/** Read SPICYHOME_DB from .env.worktree (root dir, then cwd), if present. */
function readEnvWorktreeValue(
  root: string,
  cwd: string,
  injectedContents: string | undefined,
): string | undefined {
  if (injectedContents !== undefined) return parseEnvWorktreeContents(injectedContents);
  for (const dir of [root, cwd]) {
    const file = join(dir, '.env.worktree');
    if (existsSync(file)) {
      return parseEnvWorktreeContents(readFileSync(file, 'utf8'));
    }
  }
  return undefined;
}

// ── CLI main (compiled as CJS; slice 3 wires the js_binary) ──────────────────

export interface BakeCliArgs {
  db?: string;
  out?: string;
}

/** Minimal argv scan for `--db <path>` and `--out <path>`. */
export function parseBakeCliArgs(argv: string[]): BakeCliArgs {
  const args: BakeCliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db' && i + 1 < argv.length) {
      args.db = argv[i + 1];
      i++;
    } else if (argv[i] === '--out' && i + 1 < argv.length) {
      args.out = argv[i + 1];
      i++;
    }
  }
  return args;
}

/**
 * CLI entry: resolve DB, bake, write the emit script. Returns the process
 * exit code (0 success, 1 failure/empty bake). When the bake is empty — no
 * open orders with items, or no active kitchen printers — it exits non-zero
 * and never writes/overwrites the emit script.
 */
export function bakeOpenKotsCli(argv: string[]): number {
  const { db: dbFlag, out: outFlag } = parseBakeCliArgs(argv.slice(2));
  const env = process.env;
  const cwd = process.cwd();
  const root = env.BUILD_WORKSPACE_DIRECTORY || cwd;

  let sqlite: Database.Database | null = null;
  try {
    const dbPath = resolveBakeDbPath({ dbFlag, env, cwd });
    console.log(`Baking open-orders KOTs from ${dbPath} (read-only)`);

    sqlite = new Database(dbPath, { readonly: true });
    const db = drizzle(sqlite, { schema });
    const result = collectOpenKotJobs(db);

    console.log(
      `Open orders: ${result.openOrderCount}, skipped empty: ${result.skippedEmptyOrderIds.length}, ` +
        `kitchen printers: ${result.kitchenPrinterCount}, jobs: ${result.jobs.length}`,
    );
    if (result.skippedEmptyOrderIds.length > 0) {
      console.log(`Skipped empty order ids: ${result.skippedEmptyOrderIds.join(', ')}`);
    }

    if (result.jobs.length === 0) {
      console.error(
        'bake-open-kots: no jobs (no open orders with items) — not writing the emit script.',
      );
      return 1;
    }
    if (result.kitchenPrinterCount === 0) {
      console.error('bake-open-kots: no active kitchen printers — not writing the emit script.');
      return 1;
    }

    const outPath = outFlag
      ? resolve(root, outFlag)
      : join(root, 'tmp', 'kitchen-kot', 'send-open-kots.js');
    const source = buildEmitScriptSource(result.jobs);
    writeEmitScript(outPath, source);
    console.log(`Emit script written to ${outPath} (${result.jobs.length} job(s)).`);
    console.log('Copy it to the Win7 POS machine and run: node send-open-kots.js');
    return 0;
  } catch (err) {
    console.error(`bake-open-kots failed: ${(err as Error).message}`);
    return 1;
  } finally {
    if (sqlite) sqlite.close();
  }
}

declare const require: { main?: unknown };

const isMain = typeof require !== 'undefined' && require.main === module;

if (isMain) {
  process.exit(bakeOpenKotsCli(process.argv));
}
