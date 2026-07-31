/**
 * Arabic print probe binaries (.bin) for Windows raw printing.
 *
 * Generates complete ESC/POS jobs the user copies to a Windows machine and
 * prints with win_rawprint:
 *
 *   win_rawprint.exe "Printer Name" path\to\probe.bin
 *
 * Each bin is a full job: ESC @ init, ASCII label, Arabic payload, feed,
 * partial cut. The payloads exercise both rendering modes:
 *  - charset: shaped + segment-bidi reordered W1256 bytes via ESC t 50
 *  - raster:  shaped text rendered to monochrome bitmaps via GS v 0
 *
 * This module is pure (no NestJS), so it can be driven three ways:
 *   1. `bazel run //apps/server:arabic_probes -- tmp/arabic-probes`
 *      (recommended — the compiled entry point in the server package)
 *   2. `node scripts/arabic-print-probes.mjs` (thin wrapper over bazel run)
 *   3. jest: `WRITE_ARABIC_PROBES=1 bazel test //apps/server:test
 *      --test_output=all --test_arg=arabic-probe-bins` (writes under tmp/)
 *
 * The generator also writes a short tmp/arabic-probes/README.md describing
 * how to print the files on Windows.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { EscPosBuilder, Align, CutType } from './esc-pos-builder';
import { encodeArabicText, reverseBytes, encodeW1256 } from './arabic-encode';
import { renderArabicLineFromLogical } from './arabic-raster';
import type { PrinterArabicConfig } from '@spicyhome/shared';

/** Charset-mode config: W1256 + ESC t 50 + segment-bidi visual RTL. */
const CHARSET_CONFIG: PrinterArabicConfig = {
  encoding: 'w1256',
  codePage: 50,
  visualRtl: true,
  renderMode: 'charset',
};

/** Raster-mode config: same encoding settings, but lines print as bitmaps. */
const RASTER_CONFIG: PrinterArabicConfig = {
  encoding: 'w1256',
  codePage: 50,
  visualRtl: true,
  renderMode: 'raster',
};

/** Sample strings used across probes (logical Unicode). */
const MARHABA = '\u0645\u0631\u062D\u0628\u0627'; // مرحبا
const SPICY_HOME = '\u0633\u0628\u0627\u064A\u0633\u064A \u0647\u0648\u0645'; // سبايسي هوم
const ORDER_NUM = '\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: 1234'; // رقم الطلب: 1234
const INVOICE_TITLE =
  '\u0641\u0627\u062A\u0648\u0631\u0629 \u0636\u0631\u064A\u0628\u064A\u0629 \u0645\u0628\u0633\u0637\u0629'; // فاتورة ضريبية مبسطة
const VAT_LINE =
  '\u0627\u0644\u0645\u0628\u0644\u063A \u0634\u0627\u0645\u0644 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629'; // المبلغ شامل ضريبة القيمة المضافة
const CORN_SOUP = '5x \u0634\u0648\u0631\u0628\u0629 \u0630\u0631\u0629'; // 5x شوربة ذرة
const LAM_ALEF = '\u0644\u0627'; // لا
const FOR_ALLAH = '\u0644\u0644\u0647'; // لله
const BILLAH = '\u0628\u0627\u0644\u0644\u0647'; // بالله

export interface ArabicProbeBin {
  /** File name, e.g. "02-charset-w1256-cp50-shaped-bidi.bin". */
  name: string;
  buffer: Buffer;
}

// ── Probe builders ───────────────────────────────────────────────────────────

/**
 * 01 — baseline: the OLD blind whole-string reversal (kept for regression
 * comparison). Shows why naive reversal is wrong for mixed strings.
 */
function probe01BaselineBlindRtl(): Buffer {
  const eb = new EscPosBuilder(42);
  eb.init();
  eb.align(Align.Left);
  eb.text('01 BASELINE: blind whole-string reverse (OLD behavior)');
  eb.text('Mixed strings show the bug: "5x" and digits flip.');
  eb.separator('-');
  eb.codePage(50);
  for (const s of [MARHABA, CORN_SOUP, ORDER_NUM]) {
    eb.rawLine(reverseBytes(encodeW1256(s)));
  }
  eb.codePage(0);
  eb.separator('-');
  eb.text('End 01.');
  eb.feed(3);
  eb.cut(CutType.Partial);
  return eb.getBuffer();
}

/** 02 — charset mode: shaped + segment-bidi W1256 via ESC t 50. */
function probe02CharsetShapedBidi(): Buffer {
  const eb = new EscPosBuilder(42);
  eb.init();
  eb.align(Align.Left);
  eb.text('02 CHARSET: shaped + segment-bidi, W1256, ESC t 50');
  eb.text('Letters do NOT join (single glyphs), but reading');
  eb.text('order is correct and "5x"/digits stay in place.');
  eb.separator('-');
  eb.codePage(50);
  for (const s of [
    MARHABA,
    SPICY_HOME,
    '5x ' + MARHABA, // 5x مرحبا
    ORDER_NUM,
    INVOICE_TITLE,
    VAT_LINE,
  ]) {
    eb.rawLine(encodeArabicText(CHARSET_CONFIG, s));
  }
  eb.codePage(0);
  eb.separator('-');
  eb.text('End 02.');
  eb.feed(3);
  eb.cut(CutType.Partial);
  return eb.getBuffer();
}

/** 03 — raster mode: same strings, joined letterforms via GS v 0. */
function probe03RasterShapedBidi(): Buffer {
  const eb = new EscPosBuilder(42);
  eb.init();
  eb.align(Align.Left);
  eb.text('03 RASTER: shaped + segment-bidi, GS v 0 bitmaps');
  eb.text('Letters JOIN (true Arabic) if the glyph atlas loads.');
  eb.separator('-');
  for (const s of [MARHABA, SPICY_HOME, CORN_SOUP, ORDER_NUM, INVOICE_TITLE, VAT_LINE]) {
    rasterLine(eb, s);
  }
  eb.separator('-');
  eb.text('End 03.');
  eb.feed(3);
  eb.cut(CutType.Partial);
  return eb.getBuffer();
}

/** 04 — charset mixed item line ("5x شوربة ذرة" style). */
function probe04MixedItemLineCharset(): Buffer {
  const eb = new EscPosBuilder(42);
  eb.init();
  eb.text('04 CHARSET mixed item line: qty + Arabic name');
  eb.separator('-');
  eb.codePage(50);
  for (const s of [
    '2x \u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631', // 2x زنجر برجر
    '1x \u0628\u064A\u0628\u0633\u064A', // 1x بيبسي
    '3x \u0634\u0648\u0631\u0628\u0629 \u0630\u0631\u0629', // 3x شوربة ذرة
    '\u0645\u0644\u0627\u062D\u0638\u0627\u062A: \u0628\u062F\u0648\u0646 \u0628\u0635\u0644', // ملاحظات: بدون بصل
  ]) {
    eb.rawLine(encodeArabicText(CHARSET_CONFIG, s));
  }
  eb.codePage(0);
  eb.separator('-');
  eb.text('End 04.');
  eb.feed(3);
  eb.cut(CutType.Partial);
  return eb.getBuffer();
}

/** 05 — raster mixed item line (same strings as 04). */
function probe05MixedItemLineRaster(): Buffer {
  const eb = new EscPosBuilder(42);
  eb.init();
  eb.text('05 RASTER mixed item line: qty + Arabic name');
  eb.separator('-');
  for (const s of [
    '2x \u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631',
    '1x \u0628\u064A\u0628\u0633\u064A',
    '3x \u0634\u0648\u0631\u0628\u0629 \u0630\u0631\u0629',
    '\u0645\u0644\u0627\u062D\u0638\u0627\u062A: \u0628\u062F\u0648\u0646 \u0628\u0635\u0644',
  ]) {
    rasterLine(eb, s);
  }
  eb.separator('-');
  eb.text('End 05.');
  eb.feed(3);
  eb.cut(CutType.Partial);
  return eb.getBuffer();
}

/** 06 — lam-alef ligatures: charset + raster side by side. */
function probe06LamAlef(): Buffer {
  const eb = new EscPosBuilder(42);
  eb.init();
  eb.text('06 LAM-ALEF ligatures (لا / لله / بالله)');
  eb.separator('-');
  eb.text('charset:');
  eb.codePage(50);
  for (const s of [LAM_ALEF, FOR_ALLAH, BILLAH, '\u0628\u0627\u0644\u0644\u0627\u0647']) {
    eb.rawLine(encodeArabicText(CHARSET_CONFIG, s));
  }
  eb.codePage(0);
  eb.blankLine();
  eb.text('raster (joined):');
  for (const s of [LAM_ALEF, FOR_ALLAH, BILLAH, '\u0628\u0627\u0644\u0644\u0627\u0647']) {
    rasterLine(eb, s);
  }
  eb.separator('-');
  eb.text('End 06.');
  eb.feed(3);
  eb.cut(CutType.Partial);
  return eb.getBuffer();
}

/** Emit one raster Arabic line; prints a marker when the atlas is missing. */
function rasterLine(eb: EscPosBuilder, text: string): void {
  const bmp = renderArabicLineFromLogical(text, RASTER_CONFIG, { maxWidthDots: 384 });
  if (bmp) {
    eb.rasterBitImage(bmp.width, bmp.height, bmp.bits);
    eb.blankLine();
  } else {
    eb.text('[raster atlas missing — charset only]');
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Build all probe bins in order. */
export function buildArabicProbeBins(): ArabicProbeBin[] {
  return [
    { name: '01-baseline-w1256-blind-rtl.bin', buffer: probe01BaselineBlindRtl() },
    { name: '02-charset-w1256-cp50-shaped-bidi.bin', buffer: probe02CharsetShapedBidi() },
    { name: '03-raster-shaped-bidi.bin', buffer: probe03RasterShapedBidi() },
    { name: '04-mixed-item-line.bin', buffer: probe04MixedItemLineCharset() },
    { name: '05-mixed-item-line-raster.bin', buffer: probe05MixedItemLineRaster() },
    { name: '06-lam-alef.bin', buffer: probe06LamAlef() },
  ];
}

/** README written next to the bins so the user knows how to print them. */
export function arabicProbeReadme(): string {
  return `# Arabic print probes (.bin)

Each file is a complete ESC/POS job: ESC @ init, ASCII labels, Arabic
payload (charset bytes or GS v 0 raster bitmaps), feed, partial cut.

Print on Windows with win_rawprint:

    win_rawprint.exe "Epson ..." 02-charset-w1256-cp50-shaped-bidi.bin

(Replace the printer name with the exact Windows queue name.)

Files:
  - 01-baseline-w1256-blind-rtl.bin        OLD whole-string reverse (buggy baseline)
  - 02-charset-w1256-cp50-shaped-bidi.bin  shaped + segment-bidi, W1256, ESC t 50
  - 03-raster-shaped-bidi.bin              same strings as GS v 0 bitmaps (joined)
  - 04-mixed-item-line.bin                 "5x <arabic>" style lines, charset
  - 05-mixed-item-line-raster.bin          same lines as raster bitmaps
  - 06-lam-alef.bin                        لا / لله / بالله — charset + raster

Regenerate with:
    node scripts/arabic-print-probes.mjs
`;
}

/**
 * Write all probe bins + README into a directory (created on demand).
 * Returns the written file names.
 */
export function writeArabicProbeBins(outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const bin of buildArabicProbeBins()) {
    const p = join(outDir, bin.name);
    writeFileSync(p, bin.buffer);
    written.push(p);
  }
  const readmePath = join(outDir, 'README.md');
  writeFileSync(readmePath, arabicProbeReadme());
  written.push(readmePath);
  return written;
}

// ── CLI entry (compiled as CJS; `bazel run //apps/server:arabic_probes`) ─────

declare const require: { main?: unknown };

const isMain = typeof require !== 'undefined' && require.main === module;

if (isMain) {
  // bazel run sets BUILD_WORKSPACE_DIRECTORY to the source tree root; with
  // sandboxing the cwd is the runfiles dir, so resolve against the workspace.
  const base = process.env.BUILD_WORKSPACE_DIRECTORY ?? process.cwd();
  const outDir = resolve(base, process.argv[2] ?? 'tmp/arabic-probes');
  const files = writeArabicProbeBins(outDir);
  console.log(`Arabic probe bins written to ${outDir}:`);
  for (const f of files) console.log(`  ${f}`);
  console.log('Print on Windows: win_rawprint.exe "Printer Name" <file>.bin');
}
