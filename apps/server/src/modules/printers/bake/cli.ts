/**
 * bake/cli.ts — bake-print-probe CLI entry (js_binary entry point).
 *
 * Reads the local SQLite DB read-only, collects baked print jobs for the
 * requested format, and writes a single self-contained Node 18 emit script
 * that prints every baked buffer immediately when run on the live Win7 POS
 * machine.
 *
 * Usage:
 *   bazel run //apps/server:bake_print_probe -- --format kitchen [--db path] [--out path]
 *
 * Zero writes to the DB: no order_events, no order/printer mutations, no
 * ledger state. This is a probe — not a real send-to-kitchen.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join, resolve } from 'path';
import * as schema from '@spicyhome/db';
import { collectPrintJobs } from './collect';
import { resolveBakeDbPath } from './db-path';
import { buildEmitScriptSource, writeEmitScript } from './emit';
import { PROBE_FORMATS, type ProbeFormat } from './types';

export interface BakeProbeCliArgs {
  format: ProbeFormat;
  db?: string;
  out?: string;
  orderIds: number[];
  refundIds: number[];
  printerIds: number[];
  dayOpeningIds: number[];
  limit?: number;
  all: boolean;
  kickDrawer: boolean;
}

/** Parse the post-`slice(2)` argv. Throws Error on unknown/missing/invalid args. */
export function parseBakeProbeCliArgs(argv: string[]): BakeProbeCliArgs {
  const parsed: BakeProbeCliArgs = {
    format: '' as ProbeFormat,
    orderIds: [],
    refundIds: [],
    printerIds: [],
    dayOpeningIds: [],
    all: false,
    kickDrawer: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const takeValue = (): string => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[++i];
    };
    switch (arg) {
      case '--format':
        parsed.format = takeValue() as ProbeFormat;
        break;
      case '--db':
        parsed.db = takeValue();
        break;
      case '--out':
        parsed.out = takeValue();
        break;
      case '--order':
        parsed.orderIds.push(parseId(takeValue(), '--order'));
        break;
      case '--refund':
        parsed.refundIds.push(parseId(takeValue(), '--refund'));
        break;
      case '--printer':
        parsed.printerIds.push(parseId(takeValue(), '--printer'));
        break;
      case '--day-opening-id':
        parsed.dayOpeningIds.push(parseId(takeValue(), '--day-opening-id'));
        break;
      case '--limit':
        parsed.limit = parseLimit(takeValue());
        break;
      case '--all':
        parsed.all = true;
        break;
      case '--kick-drawer':
        parsed.kickDrawer = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.format) {
    throw new Error(`Missing required --format <name>. Valid formats: ${PROBE_FORMATS.join(', ')}`);
  }
  if (!PROBE_FORMATS.includes(parsed.format)) {
    throw new Error(
      `Unknown format '${parsed.format}'. Valid formats: ${PROBE_FORMATS.join(', ')}`,
    );
  }
  return parsed;
}

function parseId(raw: string, flag: string): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid value for ${flag}: '${raw}' is not a number`);
  return n;
}

function parseLimit(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    throw new Error(`Invalid value for --limit: '${raw}' must be a positive integer`);
  }
  return n;
}

/**
 * CLI entry: parse, resolve DB, collect jobs, write the emit script. Returns
 * the process exit code (0 success, 1 failure/empty bake). When the bake is
 * empty — or an explicit filter hard-fails — it exits 1 and never
 * writes/overwrites the emit script.
 */
export function bakePrintProbeCli(argv: string[]): number {
  const env = process.env;
  const cwd = process.cwd();
  const root = env.BUILD_WORKSPACE_DIRECTORY || cwd;

  let sqlite: Database.Database | null = null;
  try {
    const args = parseBakeProbeCliArgs(argv.slice(2));

    const dbPath = resolveBakeDbPath({ dbFlag: args.db, env, cwd });
    console.log(`bake-print-probe: format '${args.format}', reading ${dbPath} (read-only)`);

    sqlite = new Database(dbPath, { readonly: true });
    const db = drizzle(sqlite, { schema });

    const result = collectPrintJobs(db, args.format, {
      orderIds: args.orderIds.length > 0 ? args.orderIds : undefined,
      refundIds: args.refundIds.length > 0 ? args.refundIds : undefined,
      printerIds: args.printerIds.length > 0 ? args.printerIds : undefined,
      dayOpeningIds: args.dayOpeningIds.length > 0 ? args.dayOpeningIds : undefined,
      limit: args.limit,
      all: args.all,
      kickDrawer: args.kickDrawer,
    });

    for (const note of result.notes) {
      console.log(`  note: ${note}`);
    }

    if (result.jobs.length === 0) {
      console.error(
        `bake-print-probe: no jobs for format '${args.format}' — not writing the emit script.`,
      );
      return 1;
    }

    const outPath = args.out
      ? resolve(root, args.out)
      : join(root, 'tmp', 'print-probe', `send-${args.format}.js`);

    console.log(`Plan (${result.jobs.length} job(s)):`);
    for (const job of result.jobs) {
      console.log(`  ${job.label} -> ${job.printer.printerName}`);
    }

    const source = buildEmitScriptSource(result.jobs, args.format);
    writeEmitScript(outPath, source);
    console.log(
      `Emit script written to ${outPath} (${result.jobs.length} job(s), format '${args.format}').`,
    );
    return 0;
  } catch (err) {
    console.error(`bake-print-probe failed: ${(err as Error).message}`);
    return 1;
  } finally {
    if (sqlite) sqlite.close();
  }
}

declare const require: { main?: unknown };

const isMain = typeof require !== 'undefined' && require.main === module;

if (isMain) {
  process.exit(bakePrintProbeCli(process.argv));
}
