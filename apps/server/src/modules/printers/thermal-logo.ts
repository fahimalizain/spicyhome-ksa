/**
 * Load the pre-rendered 1-bit thermal logo PNG for ESC/POS receipts.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { decodeMonoPng, type MonoBitmap } from './mono-png';

export type { MonoBitmap };

const LOGO_FILE = 'logo-thermal.png';

let cache: MonoBitmap | null | undefined;

/** Candidate absolute paths for the logo asset. */
export function thermalLogoCandidates(): string[] {
  const cwd = process.cwd();
  const here = __dirname;
  return [
    // Packaged: cwd = server/
    join(cwd, 'assets', LOGO_FILE),
    // Packaged: cwd = package root
    join(cwd, 'server', 'assets', LOGO_FILE),
    // Monorepo root
    join(cwd, 'apps', 'server', 'assets', LOGO_FILE),
    // Bazel / jest often cwd = apps/server
    join(cwd, 'assets', LOGO_FILE),
    // Compiled: .../src/modules/printers → apps/server/assets
    join(here, '..', '..', '..', 'assets', LOGO_FILE),
    // bazel-bin/apps/server/src/modules/printers → apps/server/assets (source tree)
    join(here, '..', '..', '..', '..', 'assets', LOGO_FILE),
    join(here, '..', '..', '..', '..', '..', 'apps', 'server', 'assets', LOGO_FILE),
  ];
}

/**
 * Load and decode the thermal logo. Returns null if missing or invalid.
 * Successful loads are cached for the process lifetime.
 */
export function loadThermalLogo(): MonoBitmap | null {
  if (cache !== undefined) {
    return cache;
  }

  for (const p of thermalLogoCandidates()) {
    try {
      if (!existsSync(p)) continue;
      const buf = readFileSync(p);
      const bmp = decodeMonoPng(buf);
      cache = bmp;
      return bmp;
    } catch {
      // try next candidate
    }
  }

  cache = null;
  return null;
}

/** Test helper — clear module cache. */
export function clearThermalLogoCache(): void {
  cache = undefined;
}
