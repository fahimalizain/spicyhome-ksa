import type { PrinterArabicConfig } from '@spicyhome/shared';

/**
 * Arabic byte-encoding helpers for ESC/POS thermal printers.
 *
 * Shared by the receipt builder (ZATCA Arabic lines) and the test-ticket
 * builder (diagnostic probes). Encoding is configured per printer via
 * `PrinterArabicConfig` (encoding + code page + visual RTL flag).
 *
 * NOTE: production printers should set an explicit encoding
 * (pc864 / w1256 / utf8). `none` falls back to UTF-8 bytes so Arabic still
 * reaches capable printers, but that is not a supported production mode.
 */

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
  // Arabic
  if (ARABIC_TO_1256[codePoint] !== undefined) return ARABIC_TO_1256[codePoint];
  return 0x3f; // '?'
}

/** Encode a string to Windows-1256 bytes (Arabic subset). */
export function encodeW1256(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    if (cp === undefined) continue;
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
  if (ARABIC_TO_PC864[codePoint] !== undefined) return ARABIC_TO_PC864[codePoint];
  return 0x3f; // '?'
}

/** Encode a string to PC864 bytes (Arabic subset). */
export function encodePc864(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    if (cp === undefined) continue;
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
 * pipeline (encoding → optional visual-RTL byte reversal).
 *
 * `none` falls back to UTF-8 bytes without a code-page switch so Arabic still
 * lands in the buffer for capable printers; production printers should set
 * pc864 / w1256 / utf8 explicitly.
 */
export function encodeArabicText(config: PrinterArabicConfig, str: string): number[] {
  let bytes: number[];
  switch (config.encoding) {
    case 'utf8':
      bytes = encodeUtf8(str);
      break;
    case 'w1256':
      bytes = encodeW1256(str);
      break;
    case 'pc864':
      bytes = encodePc864(str);
      break;
    case 'none':
    default:
      bytes = encodeUtf8(str);
      break;
  }
  if (config.visualRtl) {
    bytes = reverseBytes(bytes);
  }
  return bytes;
}
