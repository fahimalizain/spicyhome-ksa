#!/usr/bin/env node
/**
 * arabic-print-probes.mjs — generate Arabic ESC/POS probe .bin files
 *
 * Writes complete ESC/POS jobs under tmp/arabic-probes/ that you copy to a
 * Windows machine and print via:
 *
 *   win_rawprint.exe "Printer Name" path\to\probe.bin
 *
 * The probe binaries are produced by the SERVER's own modules
 * (apps/server/src/modules/printers/arabic-probe-bins.ts) so the probes
 * always match production shaping/bidi/raster code. This script builds and
 * runs the dedicated Bazel target, which resolves runfiles (including the
 * committed glyph atlas) correctly:
 *
 *   node scripts/arabic-print-probes.mjs
 *
 * Equivalent manual command:
 *   bazel run //apps/server:arabic_probes -- tmp/arabic-probes
 *
 * Output (gitignored tmp/):
 *   tmp/arabic-probes/01-baseline-w1256-blind-rtl.bin
 *   tmp/arabic-probes/02-charset-w1256-cp50-shaped-bidi.bin
 *   tmp/arabic-probes/03-raster-shaped-bidi.bin
 *   tmp/arabic-probes/04-mixed-item-line.bin
 *   tmp/arabic-probes/05-mixed-item-line-raster.bin
 *   tmp/arabic-probes/06-lam-alef.bin
 *   tmp/arabic-probes/README.md
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_DIR = resolve(process.argv[2] ?? 'tmp/arabic-probes');
mkdirSync(OUT_DIR, { recursive: true });

console.log(`Generating Arabic probe bins into ${OUT_DIR} ...`);
execFileSync('bazel', ['run', '//apps/server:arabic_probes', '--', OUT_DIR], {
  stdio: 'inherit',
});

console.log('\nDone. Print on Windows, e.g.:');
console.log('  win_rawprint.exe "Epson TM-T20" 02-charset-w1256-cp50-shaped-bidi.bin');
