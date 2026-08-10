/**
 * bake/db-path.ts — resolve the bake-time SQLite DB path.
 *
 * Precedence (first match wins):
 *   1. --db CLI flag
 *   2. SPICYHOME_DB env var
 *   3. SPICYHOME_DB parsed from .env.worktree (workspace root, then cwd)
 *   4. ./data/spicyhome.db
 *
 * Relative paths resolve against BUILD_WORKSPACE_DIRECTORY || cwd (same idea
 * as packages/db/src/migrate.ts resolveDbPath).
 */

import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join } from 'path';

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
