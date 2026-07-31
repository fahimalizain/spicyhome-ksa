#!/usr/bin/env node
/**
 * make-thermal-logo.mjs — SpicyHome POS thermal (ESC/POS) logo generator
 *
 * Converts the colorful Android logo into 1-bit monochrome PNGs suited for
 * 1-bit thermal receipt printers. The previous approach (any saturated color
 * -> black) filled the peppers, flames and leaves into featureless black
 * silhouettes. This version preserves internal detail (chili highlight veins,
 * flame gradations, letterform edges) using a contrast-preserving grayscale
 * mapping plus error-diffusion dithering:
 *
 *   1. Flatten RGBA onto a white background.
 *   2. Perceptual luma (0.299R + 0.587G + 0.114B), then a WARM-COLOR LIFT:
 *      saturated brand colors are pulled darker so they survive the 1-bit
 *      threshold, but the pull scales with luma so gold highlights stay
 *      clearly lighter than the maroon body. The pull is gentle
 *      (0.07 + 0.07 * sat) — not the old "any color -> black".
 *   3. A monotonic tone curve (v/255)^1.2 keeps near-black ink solid
 *      (dark text, maroon body) while spreading midtones toward white so
 *      highlights and flame gradations dither into readable stipple.
 *   4. Floyd–Steinberg error diffusion (threshold 128, 7/16 3/16 5/16 1/16)
 *      converts the gray image to 1 bit. A 4x4 Bayer ordered-dither variant
 *      is also implemented (MTL_DITHER=bayer) but FS preserves local tone
 *      about 2x better, so it is the default.
 *   5. Light cleanup: near-white background (luma > 232, sat < 0.12) is forced
 *      pure white before dithering so margins stay noise-free, and isolated
 *      1px black specks are removed afterwards. No hole-filling — that would
 *      erase the dither texture.
 *
 * Output is a true 1-bit palette PNG (bit depth 1, color type 3), which is
 * the most printer-friendly representation: every pixel is pure black or
 * pure white, and the width is a multiple of 8 so ESC/POS bit packing
 * aligns exactly.
 *
 * Requires pngjs only at dev time. If it is not resolvable from this repo,
 * it is installed into a throwaway cache under the OS temp dir — the
 * repository package.json / lockfile are never touched.
 *
 * Usage:
 *   node scripts/make-thermal-logo.mjs
 *
 * Tuning knobs (env, all optional):
 *   MTL_DITHER=fs|bayer     dither algorithm (default fs)
 *   MTL_PULL_BASE=0.07      warm-lift base (0.30–0.70 in the old sat->black
 *                           scheme; ~0.07 keeps highlights visible)
 *   MTL_PULL_SAT=0.07       warm-lift saturation multiplier
 *   MTL_CURVE=1.2           tone-curve exponent (>1 darkens midtones)
 *   MTL_ASCII=1             print a coarse ASCII preview of each output
 *
 * Outputs:
 *   apps/server/assets/logo-thermal.png       (240x240, primary)
 *   apps/server/assets/logo-thermal-192.png   (192x192, compact variant)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_LOGO = join(ROOT, 'apps/android/app/src/main/res/drawable/logo.png');
const OUT_DIR = join(ROOT, 'apps/server/assets');
const SIZES = [
  { width: 240, file: 'logo-thermal.png' },
  { width: 192, file: 'logo-thermal-192.png' },
];

// Warm-lift / tone-curve tuning (see header docs).
const PULL_BASE = parseFloat(process.env.MTL_PULL_BASE ?? '0.07');
const PULL_SAT = parseFloat(process.env.MTL_PULL_SAT ?? '0.07');
const SAT_GATE = 0.12; // below this saturation a pixel is "neutral" (no warm lift)
const CURVE = parseFloat(process.env.MTL_CURVE ?? '1.2'); // tone curve exponent
const BG_LUMA = 232; // force pure white above this luma...
const BG_SAT = 0.12; // ...only for near-neutral pixels (no dither noise in margins)
const DITHER = process.env.MTL_DITHER ?? 'fs'; // 'fs' (default) | 'bayer'
const THRESHOLD = 128; // FS dither threshold

// ---------------------------------------------------------------------------
// pngjs loading (dev-time only, never a repo dependency)
// ---------------------------------------------------------------------------

function loadPngjs() {
  try {
    return createRequire(import.meta.url)('pngjs');
  } catch {
    // Not installed in this repo: install into a cache dir under the OS temp
    // directory so the repository manifest stays untouched.
    const cacheDir = join(tmpdir(), 'spicyhome-thermal-logo-deps');
    const pkgDir = join(cacheDir, 'node_modules', 'pngjs');
    if (!existsSync(pkgDir)) {
      mkdirSync(cacheDir, { recursive: true });
      execFileSync('npm', ['install', 'pngjs', '--no-save', '--no-audit', '--no-fund'], {
        cwd: cacheDir,
        stdio: 'inherit',
      });
    }
    return createRequire(join(cacheDir, 'index.js'))('pngjs');
  }
}

// ---------------------------------------------------------------------------
// Color pipeline
// ---------------------------------------------------------------------------

/** Flatten RGBA onto a white background; returns an RGB Float32Array. */
function flattenOnWhite({ width, height, data }) {
  const rgb = new Float32Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3] / 255;
    const inv = 1 - a;
    rgb[j] = data[i] * a + 255 * inv;
    rgb[j + 1] = data[i + 1] * a + 255 * inv;
    rgb[j + 2] = data[i + 2] * a + 255 * inv;
  }
  return rgb;
}

/** Area-average (box) downsample; keeps colors intact for later mapping. */
function downsampleRgb(src, srcW, srcH, dstW, dstH) {
  const out = new Float32Array(dstW * dstH * 3);
  const sx = srcW / dstW;
  const sy = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(srcH, Math.ceil((y + 1) * sy));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(srcW, Math.ceil((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const j = (yy * srcW + xx) * 3;
          r += src[j];
          g += src[j + 1];
          b += src[j + 2];
          n++;
        }
      }
      const k = (y * dstW + x) * 3;
      out[k] = r / n;
      out[k + 1] = g / n;
      out[k + 2] = b / n;
    }
  }
  return out;
}

/**
 * Contrast-preserving grayscale: perceptual luma, warm-color lift, tone curve.
 *
 * Saturated brand pixels (sat > SAT_GATE) are pulled toward dark so gold/orange
 * survives 1-bit printing, but the pull is small and luma-scaled, so relative
 * differences survive: maroon chili body -> near black, gold highlights ->
 * medium-dark gray (dithers to ~45% ink), near-white background -> pure white.
 * Dark neutral ink (black text) is left alone; the tone curve
 * (v/255)^CURVE keeps it solid.
 */
function grayMap(rgb, width, height) {
  const g = new Float32Array(width * height);
  for (let i = 0, j = 0; i < width * height; i++, j += 3) {
    const r = rgb[j];
    const gr = rgb[j + 1];
    const b = rgb[j + 2];
    const maxc = Math.max(r, gr, b);
    const minc = Math.min(r, gr, b);
    const l = 0.299 * r + 0.587 * gr + 0.114 * b;
    const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;

    // Near-white background: force pure white so margins stay clean.
    if (l > BG_LUMA && sat < BG_SAT) {
      g[i] = 255;
      continue;
    }

    let v = l;
    if (sat > SAT_GATE && l < 250) {
      const pull = PULL_BASE + PULL_SAT * sat;
      v = l * (1 - pull);
    }
    // Tone curve: dark ink stays solid, midtones spread toward white.
    v = 255 * Math.pow(Math.min(1, Math.max(0, v / 255)), CURVE);
    g[i] = Math.min(255, Math.max(0, v));
  }
  return g;
}

/** Floyd–Steinberg error diffusion, threshold 128. Returns 1 = black ink. */
function floydSteinberg(gray, width, height) {
  const g = new Float32Array(gray); // diffuse in place
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const out = g[i] < THRESHOLD ? 0 : 255; // 0 = black ink printed
      bits[i] = out === 0 ? 1 : 0; // 1 = black ink
      const err = g[i] - out;
      if (x + 1 < width) g[i + 1] += err * (7 / 16);
      if (y + 1 < height) {
        if (x > 0) g[i + width - 1] += err * (3 / 16);
        g[i + width] += err * (5 / 16);
        if (x + 1 < width) g[i + width + 1] += err * (1 / 16);
      }
    }
  }
  return bits;
}

/** 4x4 Bayer ordered dithering (alternative to FS). Returns 1 = black ink. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
function bayerDither(gray, width, height) {
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const m = BAYER4[y & 3][x & 3];
      bits[y * width + x] = gray[y * width + x] < (255 * (m + 0.5)) / 16 ? 1 : 0;
    }
  }
  return bits;
}

/**
 * Light cleanup: remove isolated black pixels (no black 8-neighbor).
 * Kills single-px noise in white fields without erasing dither texture
 * inside the logo (stipple pixels always have neighbors).
 */
function despeckle(bits, width, height) {
  const out = new Uint8Array(bits);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!bits[i]) continue;
      let hasNeighbor = false;
      for (let dy = -1; dy <= 1 && !hasNeighbor; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || (dx === 0 && dy === 0)) continue;
          if (bits[yy * width + xx]) {
            hasNeighbor = true;
            break;
          }
        }
      }
      if (!hasNeighbor) out[i] = 0;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Minimal 1-bit palette PNG encoder (node zlib + CRC32, no dependencies)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encode a 1-bit indexed PNG. Palette: index 0 = white, index 1 = black.
 * Bits are packed MSB-first per scanline with a leading filter byte 0.
 */
function encodeMonoPng(bits, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 3; // color type: indexed
  const plte = Buffer.from([255, 255, 255, 0, 0, 0]);
  const rowBytes = Math.ceil(width / 8);
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) raw[rowStart + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', plte),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Verification: re-decode the file and assert every pixel is pure B/W
// ---------------------------------------------------------------------------

function verifyMonoPng(file, width, height, { PNG }) {
  const png = PNG.sync.read(readFileSync(file));
  if (png.width !== width || png.height !== height) {
    throw new Error(`decode mismatch: expected ${width}x${height}, got ${png.width}x${png.height}`);
  }
  let black = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (r === 0 && g === 0 && b === 0) black++;
    else if (r === 255 && g === 255 && b === 255) {
      // pure white: OK
    } else {
      throw new Error(
        `pixel not pure B/W at ${(i / 4) % width},${Math.floor(i / 4 / width)}: ${r},${g},${b}`,
      );
    }
  }
  return black / (width * height);
}

// ---------------------------------------------------------------------------
// QA helpers (printed to stdout for reproducibility checks)
// ---------------------------------------------------------------------------

/** RMS difference between target gray ink density and dithered ink density. */
function toneError(bits, gray, width, height, step = 12) {
  let se = 0;
  let n = 0;
  const cellW = Math.floor(width / step);
  const cellH = Math.floor(height / step);
  for (let cy = 0; cy < step; cy++) {
    for (let cx = 0; cx < step; cx++) {
      let tgt = 0;
      let actual = 0;
      let cnt = 0;
      for (let y = cy * cellH; y < (cy + 1) * cellH; y++) {
        for (let x = cx * cellW; x < (cx + 1) * cellW; x++) {
          tgt += 255 - gray[y * width + x]; // target ink density
          actual += bits[y * width + x] * 255; // actual ink density
          cnt++;
        }
      }
      se += (actual / cnt - tgt / cnt) ** 2;
      n++;
    }
  }
  return Math.sqrt(se / n);
}

/** % of black pixels in the outer M-px ring of the canvas. */
function marginInk(bits, width, height, m = 12) {
  let black = 0;
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < m || x >= width - m || y < m || y >= height - m) {
        total++;
        if (bits[y * width + x]) black++;
      }
    }
  }
  return total === 0 ? 0 : (100 * black) / total;
}

/** Coarse ASCII preview (debug aid). */
function asciiPreview(bits, width, height, px = 2, py = 3) {
  let s = '';
  for (let y = 0; y < height; y += py) {
    let line = '';
    for (let x = 0; x < width; x += px) {
      let b = 0;
      for (let dy = 0; dy < py && y + dy < height; dy++) {
        for (let dx = 0; dx < px && x + dx < width; dx++) {
          if (bits[(y + dy) * width + x + dx]) b++;
        }
      }
      const frac = b / (px * py);
      line += frac > 0.62 ? '#' : frac > 0.3 ? '+' : frac > 0.05 ? '.' : ' ';
    }
    s += line + '\n';
  }
  return s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { PNG } = loadPngjs();
const source = PNG.sync.read(readFileSync(SRC_LOGO));
const flattened = flattenOnWhite(source);
console.log(`source: ${source.width}x${source.height}`);
console.log(
  `params: dither=${DITHER} pull=${PULL_BASE}+${PULL_SAT}*sat (gate ${SAT_GATE}) curve=${CURVE} bg=${BG_LUMA}/${BG_SAT}`,
);

mkdirSync(OUT_DIR, { recursive: true });

for (const { width, file } of SIZES) {
  const rgb =
    width === source.width
      ? flattened
      : downsampleRgb(flattened, source.width, source.height, width, width);
  const gray = grayMap(rgb, width, width);
  const bits =
    DITHER === 'bayer' ? bayerDither(gray, width, width) : floydSteinberg(gray, width, width);
  const cleaned = despeckle(bits, width, width);
  const blackPct = (100 * cleaned.reduce((sum, v) => sum + v, 0)) / (width * width);
  const err = toneError(cleaned, gray, width, width);
  const margin = marginInk(cleaned, width, width);

  const outPath = join(OUT_DIR, file);
  writeFileSync(outPath, encodeMonoPng(cleaned, width, width));
  const verifiedPct = 100 * verifyMonoPng(outPath, width, width, { PNG });

  console.log(
    `${outPath}: ${width}x${width}, ink ${blackPct.toFixed(2)}%, toneErr ${err.toFixed(1)}, marginInk ${margin.toFixed(2)}% (verified ${verifiedPct.toFixed(2)}%)`,
  );
  if (process.env.MTL_ASCII) console.log(asciiPreview(cleaned, width, width));
}

console.log('done.');
