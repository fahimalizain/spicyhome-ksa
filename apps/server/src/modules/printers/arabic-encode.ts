import type { PrinterArabicConfig } from '@spicyhome/shared';
import { shapeArabic } from './arabic-shape';
import { visualOrderForThermal } from './arabic-bidi';

// Re-export the pipeline stages so callers can shape/order independently
// (e.g. raster probes, test tickets) without importing internals directly.
export { shapeArabic, isJoinableArabicLetter } from './arabic-shape';
export {
  isArabicCodePoint,
  isArabicChar,
  splitArabicRuns,
  visualOrderForThermal,
} from './arabic-bidi';

/**
 * Arabic byte-encoding helpers for ESC/POS thermal printers.
 *
 * Shared by the receipt builder (ZATCA Arabic lines) and the test-ticket
 * builder (diagnostic probes). Encoding is configured per printer via
 * `PrinterArabicConfig` (encoding + code page + visual RTL flag).
 *
 * Pipeline (see AGENTS.md / arabic print pipeline):
 *   1. `shapeArabic(str)`        — contextual forms + lam-alef → U+FE70–U+FEFF
 *   2. `visualOrderForThermal()` — segment-aware run reversal when visualRtl
 *   3. encode via the code-page maps (presentation forms decompose to base
 *      letters first, so the existing W1256/PC864 maps keep working)
 *
 * NOTE: production printers should set an explicit encoding
 * (pc864 / w1256 / utf8). `none` falls back to UTF-8 bytes so Arabic still
 * reaches capable printers, but that is not a supported production mode.
 */

// ── Presentation form → base Arabic letter ───────────────────────────────────
// After `shapeArabic()` the input is mostly U+FE70–U+FEFF. The W1256/PC864
// maps only cover base letters U+0600–U+06FF, so presentation forms must
// decompose back to their base letter before code-page encoding.
// Derived from UnicodeData.txt decomposition mappings (Unicode 15.1).

const PRESENTATION_FORM_TO_BASE: Record<number, number> = {
  // U+FE70–U+FE7F: diacritic forms → base harakat (kept as base letters)
  0xfe70: 0x064b,
  0xfe71: 0x064b,
  0xfe72: 0x064c,
  0xfe74: 0x064d,
  0xfe76: 0x064e,
  0xfe77: 0x064e,
  0xfe78: 0x064f,
  0xfe79: 0x064f,
  0xfe7a: 0x0650,
  0xfe7b: 0x0650,
  0xfe7c: 0x0651,
  0xfe7d: 0x0651,
  0xfe7e: 0x0652,
  0xfe7f: 0x0652,
  // U+FE80–U+FEF4: letters
  0xfe80: 0x0621, // hamza
  0xfe81: 0x0622,
  0xfe82: 0x0622, // alef madda (final/isolated)
  0xfe83: 0x0623,
  0xfe84: 0x0623, // alef hamza above (final/isolated)
  0xfe85: 0x0624,
  0xfe86: 0x0624, // waw hamza (final/isolated)
  0xfe87: 0x0625,
  0xfe88: 0x0625, // alef hamza below (final/isolated)
  0xfe89: 0x0626,
  0xfe8a: 0x0626,
  0xfe8b: 0x0626,
  0xfe8c: 0x0626, // yeh hamza
  0xfe8d: 0x0627,
  0xfe8e: 0x0627, // alef
  0xfe8f: 0x0628,
  0xfe90: 0x0628,
  0xfe91: 0x0628,
  0xfe92: 0x0628, // beh
  0xfe93: 0x0629,
  0xfe94: 0x0629, // teh marbuta
  0xfe95: 0x062a,
  0xfe96: 0x062a,
  0xfe97: 0x062a,
  0xfe98: 0x062a, // teh
  0xfe99: 0x062b,
  0xfe9a: 0x062b,
  0xfe9b: 0x062b,
  0xfe9c: 0x062b, // theh
  0xfe9d: 0x062c,
  0xfe9e: 0x062c,
  0xfe9f: 0x062c,
  0xfea0: 0x062c, // jeem
  0xfea1: 0x062d,
  0xfea2: 0x062d,
  0xfea3: 0x062d,
  0xfea4: 0x062d, // hah
  0xfea5: 0x062e,
  0xfea6: 0x062e,
  0xfea7: 0x062e,
  0xfea8: 0x062e, // khah
  0xfea9: 0x062f,
  0xfeaa: 0x062f, // dal
  0xfeab: 0x0630,
  0xfeac: 0x0630, // thal
  0xfead: 0x0631,
  0xfeae: 0x0631, // reh
  0xfeaf: 0x0632,
  0xfeb0: 0x0632, // zain
  0xfeb1: 0x0633,
  0xfeb2: 0x0633,
  0xfeb3: 0x0633,
  0xfeb4: 0x0633, // seen
  0xfeb5: 0x0634,
  0xfeb6: 0x0634,
  0xfeb7: 0x0634,
  0xfeb8: 0x0634, // sheen
  0xfeb9: 0x0635,
  0xfeba: 0x0635,
  0xfebb: 0x0635,
  0xfebc: 0x0635, // sad
  0xfebd: 0x0636,
  0xfebe: 0x0636,
  0xfebf: 0x0636,
  0xfec0: 0x0636, // dad
  0xfec1: 0x0637,
  0xfec2: 0x0637,
  0xfec3: 0x0637,
  0xfec4: 0x0637, // tah
  0xfec5: 0x0638,
  0xfec6: 0x0638,
  0xfec7: 0x0638,
  0xfec8: 0x0638, // zah
  0xfec9: 0x0639,
  0xfeca: 0x0639,
  0xfecb: 0x0639,
  0xfecc: 0x0639, // ain
  0xfecd: 0x063a,
  0xfece: 0x063a,
  0xfecf: 0x063a,
  0xfed0: 0x063a, // ghain
  0xfed1: 0x0641,
  0xfed2: 0x0641,
  0xfed3: 0x0641,
  0xfed4: 0x0641, // feh
  0xfed5: 0x0642,
  0xfed6: 0x0642,
  0xfed7: 0x0642,
  0xfed8: 0x0642, // qaf
  0xfed9: 0x0643,
  0xfeda: 0x0643,
  0xfedb: 0x0643,
  0xfedc: 0x0643, // kaf
  0xfedd: 0x0644,
  0xfede: 0x0644,
  0xfedf: 0x0644,
  0xfee0: 0x0644, // lam
  0xfee1: 0x0645,
  0xfee2: 0x0645,
  0xfee3: 0x0645,
  0xfee4: 0x0645, // meem
  0xfee5: 0x0646,
  0xfee6: 0x0646,
  0xfee7: 0x0646,
  0xfee8: 0x0646, // noon
  0xfee9: 0x0647,
  0xfeea: 0x0647,
  0xfeeb: 0x0647,
  0xfeec: 0x0647, // heh
  0xfeed: 0x0648,
  0xfeee: 0x0648, // waw
  0xfeef: 0x0649,
  0xfef0: 0x0649, // alef maksura
  0xfef1: 0x064a,
  0xfef2: 0x064a,
  0xfef3: 0x064a,
  0xfef4: 0x064a, // yeh
  // Lam-alef ligatures → lam + alef base. The lam-alef ligature is a single
  // presentation glyph; encoding to a charset code page can only reproduce
  // it as two base letters (lam + alef) — acceptable for charset mode.
  0xfef5: 0x0622,
  0xfef6: 0x0622, // لآ
  0xfef7: 0x0623,
  0xfef8: 0x0623, // لأ
  0xfef9: 0x0625,
  0xfefa: 0x0625, // لإ
  0xfefb: 0x0627,
  0xfefc: 0x0627, // لا
};

/**
 * Decompose a presentation form code point to its base Arabic letter.
 * Returns the input unchanged when it is not a presentation form.
 */
export function presentationFormToBase(codePoint: number): number {
  return PRESENTATION_FORM_TO_BASE[codePoint] ?? codePoint;
}

// ── Lam-alef ligature → two base letters (charset mode) ──────────────────────
// Charset code pages (W1256/PC864) cannot represent the lam-alef ligature as
// one glyph, and mapping it to alef alone would DROP the lam. Emit lam + alef
// instead so charset output reads لا as two letters. The raster path uses the
// true ligature glyph from the atlas.

const LAM_ALEF_TO_BASE: Record<number, [number, number]> = {
  0xfef5: [0x0644, 0x0622], // لآ
  0xfef6: [0x0644, 0x0622],
  0xfef7: [0x0644, 0x0623], // لأ
  0xfef8: [0x0644, 0x0623],
  0xfef9: [0x0644, 0x0625], // لإ
  0xfefa: [0x0644, 0x0625],
  0xfefb: [0x0644, 0x0627], // لا
  0xfefc: [0x0644, 0x0627],
};

// ── Windows-1256 encoder for Arabic letters U+0600–U+06FF ────────────────────
// Only the subset needed for Arabic text. Unmapped chars → '?' (0x3f).

const ARABIC_TO_1256: Record<number, number> = {
  // Hebrew block in W1256 is unused here; map the Arabic block
  0x0621: 0xc1, // hamza
  0x0622: 0xc2, // alef with madda above
  0x0623: 0xc3, // alef with hamza above
  0x0624: 0xc4, // waw with hamza above
  0x0625: 0xc5, // alef with hamza below
  0x0626: 0xc6, // yeh with hamza above
  0x0627: 0xc7, // alef
  0x0628: 0xc8, // beh
  0x0629: 0xc9, // teh marbuta
  0x062a: 0xca, // teh
  0x062b: 0xcb, // theh
  0x062c: 0xcc, // jeem
  0x062d: 0xcd, // hah
  0x062e: 0xce, // khah
  0x062f: 0xcf, // dal
  0x0630: 0xd0, // thal
  0x0631: 0xd1, // reh
  0x0632: 0xd2, // zain
  0x0633: 0xd3, // seen
  0x0634: 0xd4, // sheen
  0x0635: 0xd5, // sad
  0x0636: 0xd6, // dad
  0x0637: 0xd7, // tah
  0x0638: 0xd8, // zah
  0x0639: 0xd9, // ain
  0x063a: 0xda, // ghain
  0x0640: 0xe0, // tatweel (kashida)
  0x0641: 0xe1, // feh
  0x0642: 0xe2, // qaf
  0x0643: 0xe3, // kaf
  0x0644: 0xe4, // lam
  0x0645: 0xe5, // meem
  0x0646: 0xe6, // noon
  0x0647: 0xe7, // heh
  0x0648: 0xe8, // waw
  0x0649: 0xe9, // alef maksura
  0x064a: 0xea, // yeh
  0x064b: 0xeb, // fathatan
  0x064c: 0xec, // dammatan
  0x064d: 0xed, // kasratan
  0x064e: 0xee, // fatha
  0x064f: 0xef, // damma
  0x0650: 0xf0, // kasra
  0x0651: 0xf1, // shadda
  0x0652: 0xf2, // sukun
};

function encodeW1256Char(codePoint: number): number {
  // Space
  if (codePoint === 0x0020) return 0x20;
  // Printable ASCII (W1256 is a superset of ASCII — e.g. "2x " prefixes)
  if (codePoint >= 0x0021 && codePoint <= 0x007e) return codePoint;
  // Arabic presentation forms decompose to base letters
  const base = presentationFormToBase(codePoint);
  if (ARABIC_TO_1256[base] !== undefined) return ARABIC_TO_1256[base];
  return 0x3f; // '?'
}

/** Encode a string to Windows-1256 bytes (Arabic subset). */
export function encodeW1256(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    if (cp === undefined) continue;
    // Lam-alef ligatures cannot be represented in W1256 — split to ل + alef.
    const split = LAM_ALEF_TO_BASE[cp];
    if (split) {
      out.push(encodeW1256Char(split[0]), encodeW1256Char(split[1]));
      i++;
      continue;
    }
    out.push(encodeW1256Char(cp));
    // Skip low surrogate if we consumed a full code point
    if (cp > 0xffff) i++;
  }
  return out;
}

/** Encode a string to UTF-8 bytes. */
export function encodeUtf8(str: string): number[] {
  return Array.from(Buffer.from(str, 'utf-8'));
}

// ── PC864 encoder: IBM PC864 (DOS Arabic) map ─────────────────────────────────
// Covers the basic Arabic alphabet (U+0600–U+06FF). ASCII space, digits, and
// common punctuation pass through unchanged. Unmapped codepoints → '?' (0x3F).
// This is a diagnostic-grade map — minor positional differences vs. a specific
// printer's font ROM are expected.

const ARABIC_TO_PC864: Record<number, number> = {
  // Hamza group — scattered across 0x9F–0xA6
  0x0621: 0x9f, // ء hamza
  0x0623: 0xa2, // أ alef with hamza above
  0x0625: 0xa5, // إ alef with hamza below
  0x0626: 0xa6, // ئ yeh with hamza above
  // Core Arabic block — contiguous-ish from 0xAC
  0x0627: 0xac, // ا alef
  0x0628: 0xae, // ب beh
  0x0629: 0xaf, // ة teh marbuta
  0x062a: 0xb0, // ت teh
  0x062b: 0xb1, // ث theh
  0x062c: 0xb2, // ج jeem
  0x062d: 0xb3, // ح hah
  0x062e: 0xb4, // خ khah
  0x062f: 0xb5, // د dal
  0x0630: 0xb6, // ذ thal
  0x0631: 0xb7, // ر reh
  0x0632: 0xb8, // ز zain
  0x0633: 0xb9, // س seen
  0x0634: 0xba, // ش sheen
  0x0635: 0xbb, // ص sad
  0x0636: 0xbc, // ض dad
  0x0637: 0xbe, // ط tah
  0x0638: 0xbf, // ظ zah
  0x0639: 0xc0, // ع ain
  0x063a: 0xc1, // غ ghain
  0x0641: 0xc2, // ف feh
  0x0642: 0xc3, // ق qaf
  0x0643: 0xc4, // ك kaf
  0x0644: 0xc5, // ل lam
  0x0645: 0xc6, // م meem
  0x0646: 0xc7, // ن noon
  0x0647: 0xc8, // ه heh
  0x0648: 0xc9, // و waw
  0x0649: 0xca, // ى alef maksura
  0x064a: 0xcb, // ي yeh
};

function encodePc864Char(codePoint: number): number {
  if (codePoint === 0x0020) return 0x20;
  if (codePoint >= 0x0030 && codePoint <= 0x0039) return codePoint;
  // ASCII punctuation and common symbols used in samples: : . x
  if (codePoint >= 0x0021 && codePoint <= 0x007e) return codePoint;
  // Arabic presentation forms decompose to base letters
  const base = presentationFormToBase(codePoint);
  if (ARABIC_TO_PC864[base] !== undefined) return ARABIC_TO_PC864[base];
  return 0x3f; // '?'
}

/** Encode a string to PC864 bytes (Arabic subset). */
export function encodePc864(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    if (cp === undefined) continue;
    // Lam-alef ligatures cannot be represented in PC864 — split to ل + alef.
    const split = LAM_ALEF_TO_BASE[cp];
    if (split) {
      out.push(encodePc864Char(split[0]), encodePc864Char(split[1]));
      i++;
      continue;
    }
    out.push(encodePc864Char(cp));
    if (cp > 0xffff) i++;
  }
  return out;
}

/**
 * Reverse byte array (generic visual-RTL helper).
 * Returns a new array — does not mutate input.
 */
export function reverseBytes(bytes: number[]): number[] {
  return [...bytes].reverse();
}

/**
 * Encode a UTF-8 Arabic string → byte array using the configured encoding
 * pipeline:
 *   1. `shapeArabic()` — contextual forms + lam-alef ligatures
 *   2. `visualOrderForThermal()` — segment-aware run reversal (visualRtl)
 *   3. encode via the code-page maps (presentation forms decompose to base
 *      letters first)
 *
 * `none` falls back to UTF-8 bytes without a code-page switch so Arabic still
 * lands in the buffer for capable printers; production printers should set
 * pc864 / w1256 / utf8 explicitly.
 */
export function encodeArabicText(config: PrinterArabicConfig, str: string): number[] {
  // Shape first so contextual forms are chosen in logical structure; the
  // visual-order pass then reverses whole runs (never mid-glyph).
  const shaped = shapeArabic(str);
  const ordered = visualOrderForThermal(shaped, config.visualRtl);

  let bytes: number[];
  switch (config.encoding) {
    case 'w1256':
      bytes = encodeW1256(ordered);
      break;
    case 'pc864':
      bytes = encodePc864(ordered);
      break;
    case 'utf8':
    case 'none':
    default:
      bytes = encodeUtf8(ordered);
      break;
  }
  return bytes;
}
