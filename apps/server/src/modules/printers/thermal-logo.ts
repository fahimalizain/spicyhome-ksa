/**
 * Load the pre-rendered 1-bit thermal logo PNG for ESC/POS receipts.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { decodeMonoPng, type MonoBitmap } from './mono-png';

export type { MonoBitmap };

const cache = new Map<string, MonoBitmap | null>();

function logoFileName(size: 240 | 192): string {
  return size === 192 ? 'logo-thermal-192.png' : 'logo-thermal.png';
}

/** Candidate absolute paths for the logo asset. */
export function thermalLogoCandidates(size: 240 | 192 = 240): string[] {
  const file = logoFileName(size);
  const cwd = process.cwd();
  const here = __dirname;
  return [
    // Packaged: cwd = server/
    join(cwd, 'assets', file),
    // Packaged: cwd = package root
    join(cwd, 'server', 'assets', file),
    // Monorepo root
    join(cwd, 'apps', 'server', 'assets', file),
    // Bazel / jest often cwd = apps/server
    join(cwd, 'assets', file),
    // Compiled: .../src/modules/printers → apps/server/assets
    join(here, '..', '..', '..', 'assets', file),
    // bazel-bin/apps/server/src/modules/printers → apps/server/assets (source tree)
    join(here, '..', '..', '..', '..', 'assets', file),
    join(here, '..', '..', '..', '..', '..', 'apps', 'server', 'assets', file),
  ];
}

/**
 * Load and decode the thermal logo. Returns null if missing or invalid.
 * Successful loads are cached for the process lifetime.
 */
export function loadThermalLogo(opts?: { size?: 240 | 192 }): MonoBitmap | null {
  const size = opts?.size ?? 240;
  const key = String(size);
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }

  for (const p of thermalLogoCandidates(size)) {
    try {
      if (!existsSync(p)) continue;
      const buf = readFileSync(p);
      const bmp = decodeMonoPng(buf);
      cache.set(key, bmp);
      return bmp;
    } catch {
      // try next candidate
    }
  }

  cache.set(key, null);
  return null;
}

/** Test helper — clear module cache. */
export function clearThermalLogoCache(): void {
  cache.clear();
}
