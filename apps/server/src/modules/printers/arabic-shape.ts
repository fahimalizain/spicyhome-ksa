/**
 * Pure-JS Arabic contextual shaping for thermal receipt printing.
 *
 * Converts logical Arabic text into Arabic Presentation Forms-B
 * (U+FE70–U+FEFF): each Arabic letter becomes its isolated/initial/medial/
 * final form depending on joining context, and lam-alef ligatures are
 * formed in logical structure.
 *
 * Why this module exists:
 *  - W1256/PC864 charset mode has only ONE glyph per base letter, so it can
 *    never join letters — but shaping is still required so the segment-aware
 *    visual order (arabic-bidi.ts) can reverse correctly and so the raster
 *    renderer (arabic-raster.ts) can blit true joined letterforms.
 *  - Shaping happens BEFORE encoding: presentation forms decompose back to
 *    base letters for the charset code-page maps.
 *
 * The algorithm mirrors the well-known `arabic-reshaper` (python) approach:
 * joining classes per letter, transparent diacritics, and lam-alef ligature
 * substitution. No runtime dependencies.
 */

// ── Arabic letter joining classes ────────────────────────────────────────────
// Dual-joining letters have 4 forms (isolated/initial/medial/final).
// Right-joining letters have 2 forms (isolated/final) — they only attach to
// the letter BEFORE them and never cause the following letter to take an
// initial/medial form.

/** Letters that join on both sides (have initial/medial forms). */
const DUAL_JOINING = new Set<number>([
  0x0621, // hamza
  0x0626, // yeh with hamza above
  0x0628, // beh
  0x062a, // teh
  0x062b, // theh
  0x062c, // jeem
  0x062d, // hah
  0x062e, // khah
  0x0633, // seen
  0x0634, // sheen
  0x0635, // sad
  0x0636, // dad
  0x0637, // tah
  0x0638, // zah
  0x0639, // ain
  0x063a, // ghain
  0x0641, // feh
  0x0642, // qaf
  0x0643, // kaf
  0x0644, // lam
  0x0645, // meem
  0x0646, // noon
  0x0647, // heh
  0x064a, // yeh
]);

/** Letters that only join to the previous letter (isolated/final forms). */
const RIGHT_JOINING = new Set<number>([
  0x0622, // alef with madda above
  0x0623, // alef with hamza above
  0x0624, // waw with hamza above
  0x0625, // alef with hamza below
  0x0627, // alef
  0x0629, // teh marbuta
  0x062f, // dal
  0x0630, // thal
  0x0631, // reh
  0x0632, // zain
  0x0648, // waw
  0x0649, // alef maksura
]);

/** Harakat / diacritics — transparent for joining, kept in logical order. */
const DIACRITICS = new Set<number>([
  0x064b, // fathatan
  0x064c, // dammatan
  0x064d, // kasratan
  0x064e, // fatha
  0x064f, // damma
  0x0650, // kasra
  0x0651, // shadda
  0x0652, // sukun
]);

/** Tatweel (kashida) — join-causing, kept in base form (harmless on thermal). */
const TATWEEL = 0x0640;

// ── Presentation forms per base letter ───────────────────────────────────────
// [isolated, final, initial, medial] in U+FE70–U+FEFF order.
// Right-joining letters use only [isolated, final].
// Verified against UnicodeData.txt decomposition mappings (Unicode 15.1).
// Note: U+0621 HAMZA has only an isolated presentation form (U+FE80); the
// shaping logic falls back to the isolated form for missing contexts.

const FORMS: Record<number, [number, number?, number?, number?]> = {
  0x0621: [0xfe80], // hamza
  0x0622: [0xfe82, 0xfe81], // alef with madda above
  0x0623: [0xfe84, 0xfe83], // alef with hamza above
  0x0624: [0xfe86, 0xfe85], // waw with hamza above
  0x0625: [0xfe88, 0xfe87], // alef with hamza below
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], // yeh with hamza above
  0x0627: [0xfe8d, 0xfe8e], // alef
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], // beh
  0x0629: [0xfe93, 0xfe94], // teh marbuta
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], // teh
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], // theh
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], // jeem
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], // hah
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], // khah
  0x062f: [0xfea9, 0xfeaa], // dal
  0x0630: [0xfeab, 0xfeac], // thal
  0x0631: [0xfead, 0xfeae], // reh
  0x0632: [0xfeaf, 0xfeb0], // zain
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], // seen
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8], // sheen
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], // sad
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], // dad
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4], // tah
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8], // zah
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc], // ain
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0], // ghain
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], // feh
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8], // qaf
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc], // kaf
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0], // lam
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], // meem
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8], // noon
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], // heh
  0x0648: [0xfeed, 0xfeee], // waw
  0x0649: [0xfeef, 0xfef0], // alef maksura
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4], // yeh
};

// ── Lam-alef ligatures ───────────────────────────────────────────────────────
// ل + alef variants → U+FEF5–U+FEFC. Only isolated and final forms exist
// (alef never joins onward).

const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xfef5, 0xfef6], // لآ
  0x0623: [0xfef7, 0xfef8], // لأ
  0x0625: [0xfef9, 0xfefa], // لإ
  0x0627: [0xfefb, 0xfefc], // لا
};

/**
 * Is `codePoint` an Arabic letter that participates in joining (has
 * contextual presentation forms)? Excludes diacritics and tatweel.
 */
export function isJoinableArabicLetter(codePoint: number): boolean {
  return DUAL_JOINING.has(codePoint) || RIGHT_JOINING.has(codePoint);
}

/** Is `codePoint` an Arabic diacritic (harakat)? */
export function isArabicDiacritic(codePoint: number): boolean {
  return DIACRITICS.has(codePoint);
}

/**
 * Shape Arabic text into presentation forms (contextual forms + lam-alef).
 *
 * - Arabic letters → U+FE70–U+FEFF presentation forms
 * - Lam-alef ligatures are formed in logical structure (لا لأ لإ لآ)
 * - Diacritics pass through unchanged in logical position
 * - Tatweel passes through unchanged
 * - Non-Arabic characters (ASCII, digits, punctuation, spaces) pass through
 * - Already-shaped presentation forms pass through unchanged
 *
 * The output is still in LOGICAL order — call `visualOrderForThermal`
 * (arabic-bidi.ts) afterwards when `visualRtl` is enabled.
 */
export function shapeArabic(input: string): string {
  const cps: number[] = Array.from(input, (ch) => ch.codePointAt(0) as number);
  const out: number[] = [];

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];

    // Lam-alef ligature: ل followed directly by an alef variant.
    if (cp === 0x0644 && i + 1 < cps.length) {
      const next = cps[i + 1];
      const lig = LAM_ALEF[next];
      if (lig !== undefined) {
        const prev = prevJoiningLetter(cps, i - 1);
        const prevJoins = prev != null && DUAL_JOINING.has(prev);
        out.push(prevJoins ? lig[1] : lig[0]); // final form when lam attaches
        i++; // consume the alef
        continue;
      }
    }

    // Diacritics / tatweel / non-Arabic: pass through.
    if (DIACRITICS.has(cp) || cp === TATWEEL) {
      out.push(cp);
      continue;
    }

    const forms = FORMS[cp];
    if (forms === undefined) {
      // Non-Arabic (ASCII, digits, punctuation) or already shaped — pass through.
      out.push(cp);
      continue;
    }

    const prev = prevJoiningLetter(cps, i - 1);
    const next = nextJoiningLetter(cps, i + 1);
    // A letter takes the final/medial form when the PREVIOUS letter is
    // dual-joining (it extends a connection to the right). Right-joining
    // letters (dal, reh, alef, waw...) never extend a connection forward.
    const prevJoins = prev != null && DUAL_JOINING.has(prev);
    // A letter takes the initial/medial form when the NEXT letter accepts a
    // connection from the left — any joining letter, dual or right-joining
    // (e.g. ب ا → بـا : alef accepts the connection, so beh is initial).
    const nextJoins = next != null;
    const isDual = DUAL_JOINING.has(cp);

    // Pick the contextual form, falling back when a letter lacks a specific
    // presentation form (e.g. hamza has only U+FE80). Right-joining letters
    // never take initial/medial forms — isolated and final shapes coincide.
    const form = isDual
      ? nextJoins && prevJoins
        ? (forms[3] ?? forms[2] ?? forms[0]) // medial
        : prevJoins
          ? (forms[1] ?? forms[0]) // final
          : nextJoins
            ? (forms[2] ?? forms[0]) // initial
            : forms[0] // isolated
      : prevJoins
        ? (forms[1] ?? forms[0]) // final (right-joining)
        : forms[0]; // isolated (right-joining)
    out.push(form);
  }

  return String.fromCodePoint(...out);
}

/**
 * Find the previous Arabic letter that participates in joining, skipping
 * transparent diacritics. Returns its code point or null.
 */
function prevJoiningLetter(cps: number[], start: number): number | null {
  for (let i = start; i >= 0; i--) {
    const cp = cps[i];
    if (isArabicDiacritic(cp) || cp === TATWEEL) continue;
    if (isJoinableArabicLetter(cp)) return cp;
    return null; // any other char (Arabic or not) blocks joining
  }
  return null;
}

/**
 * Find the next Arabic letter that participates in joining, skipping
 * transparent diacritics. Returns its code point or null.
 */
function nextJoiningLetter(cps: number[], start: number): number | null {
  for (let i = start; i < cps.length; i++) {
    const cp = cps[i];
    if (isArabicDiacritic(cp) || cp === TATWEEL) continue;
    if (isJoinableArabicLetter(cp)) return cp;
    return null; // any other char (Arabic or not) blocks joining
  }
  return null;
}
