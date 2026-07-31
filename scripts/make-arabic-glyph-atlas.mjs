#!/usr/bin/env node
/**
 * make-arabic-glyph-atlas.mjs — SpicyHome POS Arabic raster glyph atlas
 *
 * Renders the glyph set needed by `apps/server/src/modules/printers/
 * arabic-raster.ts` into a committed JSON atlas:
 *
 *   apps/server/assets/arabic-glyph-atlas.json
 *
 * The atlas lets the server rasterize Arabic receipt lines (joined
 * letterforms via GS v 0 raster bit images) WITHOUT any runtime dependency
 * (no canvas, no sharp, no harfbuzz, no native modules — Node 18 safe).
 *
 * Font: Tajawal Regular — SIL OPEN FONT LICENSE 1.1 (OFL)
 *   https://github.com/google/fonts/tree/main/ofl/tajawal
 *   Copyright 2016 The Tajawal Project Authors (https://github.com/aismail/tajawal)
 *   This program is free software: you can redistribute it and/or modify it
 *   under the terms of the SIL Open Font License 1.1. The OFL license text is
 *   at https://openfontlicense.org (bundled: OFL-1.1).
 *
 * Tajawal was chosen over Amiri / Noto Naskh because its compact modern
 * metrics (max ascender ~0.83em, max descender ~0.38em) fit a ~32px thermal
 * cell at a readable font size. Tajawal does not ship the *isolated*
 * presentation forms — the server-side renderer falls back to the base
 * Arabic letter for those (the base glyph IS the isolated shape in modern
 * fonts).
 *
 * Only dev-time tools are used (same pattern as scripts/make-thermal-logo.mjs):
 * opentype.js is installed into a throwaway cache under the OS temp dir and
 * the font is downloaded to the same cache — the repository package.json /
 * lockfile are never touched.
 *
 * Rasterization: opentype path outlines are flattened to line segments and
 * filled with an even-odd point-in-polygon test at 2x2 supersampling
 * (threshold >= 50% coverage). All pure JS — no canvas.
 *
 * Usage:
 *   node scripts/make-arabic-glyph-atlas.mjs
 *
 * Tuning knobs (env, all optional):
 *   ATLAS_CELL_H=32        cell height in dots
 *   ATLAS_FONT_SIZE=26     initial font size in dots (auto-scaled to fit)
 *   ATLAS_SS=2             supersampling factor (1 = center point only)
 *   ATLAS_ASCII=1          print a coarse ASCII preview of sample glyphs
 *   ATLAS_SKIP_DOWNLOAD=1  use an existing cached font, no network
 *
 * Outputs:
 *   apps/server/assets/arabic-glyph-atlas.json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'apps/server/assets/arabic-glyph-atlas.json');
const CACHE_DIR = join(tmpdir(), 'spicyhome-arabic-atlas-deps');
const FONT_FILE = join(CACHE_DIR, 'Tajawal-Regular.ttf');
const FONT_URL =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/tajawal/Tajawal-Regular.ttf';
const FONT_LICENSE =
  'SIL Open Font License 1.1 (OFL) — Tajawal, Copyright 2016 The Tajawal Project Authors (https://github.com/aismail/tajawal)';

const CELL_H = parseInt(process.env.ATLAS_CELL_H ?? '32', 10);
const INITIAL_FONT_SIZE = parseFloat(process.env.ATLAS_FONT_SIZE ?? '26');
const SS = parseInt(process.env.ATLAS_SS ?? '2', 10);

// ── Glyph coverage ───────────────────────────────────────────────────────────
// What the server needs after shapeArabic() + visual ordering:
//  - printable ASCII 0x20–0x7E (labels, digits, "5x ", prices)
//  - Arabic base block: letters + harakat + tatweel + Arabic-Indic digits
//  - Arabic Presentation Forms-B U+FE70–U+FEFC (shaping output)

function coverage() {
  const cps = [];
  for (let cp = 0x20; cp <= 0x7e; cp++) cps.push(cp);
  for (let cp = 0x0600; cp <= 0x0652; cp++) cps.push(cp);
  for (let cp = 0x0660; cp <= 0x066d; cp++) cps.push(cp);
  cps.push(0x0670); // superscript alef
  for (let cp = 0xfe70; cp <= 0xfefc; cp++) cps.push(cp);
  return cps;
}

// ── Font loading (dev-time only, never a repo dependency) ────────────────────

function loadOpentype() {
  try {
    return createRequire(import.meta.url)('opentype.js');
  } catch {
    if (!existsSync(join(CACHE_DIR, 'node_modules', 'opentype.js'))) {
      mkdirSync(CACHE_DIR, { recursive: true });
      execFileSync('npm', ['install', 'opentype.js', '--no-save', '--no-audit', '--no-fund'], {
        cwd: CACHE_DIR,
        stdio: 'inherit',
      });
    }
    return createRequire(join(CACHE_DIR, 'index.js'))('opentype.js');
  }
}

function ensureFont() {
  if (existsSync(FONT_FILE)) return;
  if (process.env.ATLAS_SKIP_DOWNLOAD) {
    throw new Error(`font cache missing: ${FONT_FILE} (rerun without ATLAS_SKIP_DOWNLOAD)`);
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`downloading ${FONT_URL}`);
  execFileSync('curl', ['-sL', '--max-time', '120', FONT_URL, '-o', FONT_FILE], {
    stdio: 'inherit',
  });
}

// ── Rasterizer (pure JS, no canvas) ──────────────────────────────────────────

/** Flatten an opentype path (M/L/C/Q/Z) into line segments in font units. */
function flattenPath(path) {
  const segs = [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M':
        curX = startX = cmd.x;
        curY = startY = cmd.y;
        break;
      case 'L':
        segs.push([curX, curY, cmd.x, cmd.y]);
        curX = cmd.x;
        curY = cmd.y;
        break;
      case 'C': {
        const n = 16;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const s = 1 - t;
          const x =
            s * s * s * curX + 3 * s * s * t * cmd.x1 + 3 * s * t * t * cmd.x2 + t * t * t * cmd.x;
          const y =
            s * s * s * curY + 3 * s * s * t * cmd.y1 + 3 * s * t * t * cmd.y2 + t * t * t * cmd.y;
          segs.push([curX, curY, x, y]);
          curX = x;
          curY = y;
        }
        break;
      }
      case 'Q': {
        const n = 8;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const s = 1 - t;
          const x = s * s * curX + 2 * s * t * cmd.x1 + t * t * cmd.x;
          const y = s * s * curY + 2 * s * t * cmd.y1 + t * t * cmd.y;
          segs.push([curX, curY, x, y]);
          curX = x;
          curY = y;
        }
        break;
      }
      case 'Z':
        segs.push([curX, curY, startX, startY]);
        curX = startX;
        curY = startY;
        break;
      default:
        break;
    }
  }
  return segs;
}

/** Even-odd point-in-polygon test over flattened segments (font units). */
function pointInSegs(segs, x, y) {
  let inside = false;
  for (const [x0, y0, x1, y1] of segs) {
    if (y0 === y1) continue;
    if (y0 > y !== y1 > y) {
      const xAtY = x0 + ((y - y0) * (x1 - x0)) / (y1 - y0);
      if (xAtY > x) inside = !inside;
    }
  }
  return inside;
}

/**
 * Render one glyph into a CELL_H × w bitmap (1 = ink) at the given scale
 * (pixels per font unit). Returns { w, rows } where rows are CELL_H hex
 * strings (MSB-first, 4 bits per hex digit).
 */
function renderGlyph(segments, bbox, scale, baseline) {
  const x1 = bbox.x1;
  const x2 = bbox.x2;
  const px0 = Math.floor(x1 * scale);
  const px1 = Math.ceil(x2 * scale);
  const w = Math.max(0, px1 - px0);
  const bpl = Math.ceil(w / 4) * 4;
  const rows = [];

  const samples = SS * SS;
  const half = 0.5 / SS;

  for (let row = 0; row < CELL_H; row++) {
    let hex = '';
    const yPix = row;
    for (let d = 0; d < bpl / 4; d++) {
      let nibble = 0;
      for (let b = 0; b < 4; b++) {
        const xPix = px0 + d * 4 + b;
        if (xPix >= px0 + w) continue;
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            // Pixel center in font units; y flips (raster y grows downward).
            const fx = (xPix + half + sx / SS) / scale;
            const fy = (baseline - (yPix + half + sy / SS)) / scale;
            if (pointInSegs(segments, fx, fy)) hits++;
          }
        }
        if (hits / samples >= 0.5) nibble |= 0x8 >> b;
      }
      hex += nibble.toString(16);
    }
    rows.push(hex);
  }
  return { w, rows };
}

// ── Atlas build ──────────────────────────────────────────────────────────────

const opentype = loadOpentype();
ensureFont();
const font = opentype.parse(readFileSync(FONT_FILE).buffer);

const scale0 = INITIAL_FONT_SIZE / font.unitsPerEm;
const cps = coverage();

// Pass 1: gather per-glyph segments + bbox at the initial scale to size the
// font so the tallest glyph fits the cell.
console.log(`coverage: ${cps.length} code points, cell ${CELL_H}px, ss ${SS}x`);

/** Load glyph data for a code point. Returns null when unmapped/notdef. */
function glyphData(cp) {
  const ch = String.fromCodePoint(cp);
  const gi = font.charToGlyphIndex(ch);
  const glyph = font.glyphs.get(gi);
  if (!glyph || gi === 0) return null;
  // Blank glyphs (space, ZWJ...) are valid: keep them with their advance.
  return { glyph, gi };
}

// Measure every glyph at initial size; compute required scale.
let maxY2 = 0; // tallest top (font units, positive up from baseline)
let minY1 = Infinity; // deepest bottom (negative down from baseline)
const data = new Map();
for (const cp of cps) {
  const d = glyphData(cp);
  if (!d) continue;
  const hasPath = !!d.glyph.path && d.glyph.path.commands.length > 0;
  let bbox = null;
  if (hasPath) {
    bbox = d.glyph.path.getBoundingBox();
    if (bbox.y2 > maxY2) maxY2 = bbox.y2;
    if (bbox.y1 < minY1) minY1 = bbox.y1;
  }
  data.set(cp, { ...d, bbox, hasPath });
}

// Scale so top + bottom padding both fit in the cell.
const pad = 1; // 1px padding above/below
const scale = Math.min(scale0, (CELL_H - 2 * pad) / Math.max(0.001, maxY2 - minY1));
const baseline = Math.min(CELL_H - pad - Math.floor(-minY1 * scale) - 1, CELL_H - 2);
console.log(
  `font size ${(scale * font.unitsPerEm).toFixed(1)}px, tallest ${(maxY2 * scale).toFixed(1)}px, ` +
    `deepest ${(-minY1 * scale).toFixed(1)}px, baseline ${baseline}`,
);

if (baseline <= 0) {
  throw new Error(`baseline ${baseline} out of range — reduce ATLAS_CELL_H or ATLAS_FONT_SIZE`);
}

const glyphs = [];
let missing = 0;
for (const cp of cps) {
  const d = data.get(cp);
  let advance = 0;
  let rendered = null;
  if (d) {
    // advanceWidth is in font units; scale = pixels per font unit.
    advance = d.glyph.advanceWidth * scale;
    if (advance <= 0 && cp === 0x20) advance = 0.24 * scale * font.unitsPerEm; // space fallback
    if (d.hasPath) {
      rendered = renderGlyph(flattenPath(d.glyph.path), d.bbox, scale, baseline);
    }
  } else {
    missing++;
  }
  glyphs.push({
    c: cp,
    a: Math.round(advance * 10) / 10,
    ...(rendered ? rendered : { w: 0, rows: [] }),
  });
}

// Trim fully-white right columns for compactness (post-pass).
for (const g of glyphs) {
  if (!g.rows || g.rows.length === 0 || g.w === 0) continue;
  let used = 0;
  for (let x = 0; x < g.w; x++) {
    let ink = false;
    for (let y = 0; y < CELL_H; y++) {
      const digit = g.rows[y][Math.floor(x / 4)];
      const bit = (parseInt(digit, 16) >> (3 - (x % 4))) & 1;
      if (bit) {
        ink = true;
        break;
      }
    }
    if (ink) used = x + 1;
  }
  if (used < g.w) {
    const newBpl = Math.ceil(used / 4) * 4;
    g.w = used;
    g.rows = g.rows.map((r) => r.slice(0, newBpl / 4));
  }
}

const atlas = {
  meta: {
    generator: 'scripts/make-arabic-glyph-atlas.mjs',
    font: 'Tajawal Regular',
    license: FONT_LICENSE,
    cellHeight: CELL_H,
    baseline,
    scale: Math.round(scale * 1000) / 1000,
    coverage:
      'ASCII 0x20-0x7E, Arabic 0x0600-0x0652/0x0660-0x066D/0x0670, Arabic Presentation Forms-B 0xFE70-0xFEFC',
    notes:
      'rows are CELL_H hex strings, MSB-first, 4 bits per hex digit; w = used bitmap width; a = advance in dots',
  },
  glyphs,
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(atlas));
console.log(
  `wrote ${OUT_FILE} (${(Buffer.byteLength(JSON.stringify(atlas)) / 1024).toFixed(1)} KB, ${glyphs.length} glyphs, ${missing} unmapped)`,
);

// ── Verification / preview ────────────────────────────────────────────────────

if (process.env.ATLAS_ASCII) {
  const preview = (cp) => {
    const g = glyphs.find((x) => x.c === cp);
    if (!g) return '(missing)';
    let s = '';
    for (let y = 0; y < CELL_H; y += 2) {
      let line = '';
      for (let x = 0; x < g.w; x += 1) {
        const digit = g.rows[y][Math.floor(x / 4)];
        const bit = digit === undefined ? 0 : (parseInt(digit, 16) >> (3 - (x % 4))) & 1;
        line += bit ? '#' : '.';
      }
      s += line + '\n';
    }
    return s;
  };
  for (const cp of [0x0645, 0x0631, 0xfe93, 0xfefb, 0x41, 0x31]) {
    console.log(`U+${cp.toString(16).toUpperCase()} (adv ${glyphs.find((g) => g.c === cp)?.a}):`);
    console.log(preview(cp));
  }
}

console.log('done.');
