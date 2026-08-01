/**
 * Segment-aware visual ordering for LTR thermal printer heads.
 *
 * Thermal printers render bytes left-to-right regardless of directionality.
 * When `visualRtl` is enabled we must present Arabic in VISUAL order: the
 * bytes the printer consumes read right-to-left on paper.
 *
 * A naive whole-string byte reversal corrupts mixed content:
 *   "5x مرحبا"  →  "ابحرم x5"   (WRONG — digits and Latin flipped too)
 *
 * Instead we split the (already shaped) string into maximal runs of Arabic
 * vs non-Arabic characters and reverse ONLY the Arabic runs:
 *   "5x مرحبا"  →  "5x " + reverse("مرحبا")
 *   "رقم الطلب: 1234" → reverse("رقم الطلب") + ": 1234"
 *
 * Runs are built with Unicode-style NEUTRAL ABSORPTION (space/tab/punctuation
 * between two strong characters of the same direction join that run), so a
 * multi-word Arabic phrase stays ONE run and reverses as a whole:
 *   "فاتورة ضريبية مبسطة" → reverse("فاتورة ضريبية مبسطة")   // one run
 * Neutrals on an Arabic/LTR boundary attach to the LTR side, so prices and
 * qty prefixes survive intact:
 *   "رقم الطلب: 1234" → ["رقم الطلب", ": 1234"]              // digits kept
 *
 * Non-Arabic runs (Latin, digits, spaces, punctuation) keep their logical
 * order. Call this AFTER `shapeArabic()` so presentation forms are reversed
 * as a unit.
 */

/** Arabic code point ranges treated as "Arabic runs" for visual ordering. */
export function isArabicCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0600 && codePoint <= 0x06ff) || // Arabic block (incl. diacritics, tatweel)
    (codePoint >= 0x0750 && codePoint <= 0x077f) || // Arabic Supplement
    (codePoint >= 0xfb50 && codePoint <= 0xfdff) || // Arabic Presentation Forms-A
    (codePoint >= 0xfe70 && codePoint <= 0xfeff) // Arabic Presentation Forms-B
  );
}

/**
 * Strong-LTR code point ranges: ASCII letters, European digits, and
 * Latin-1 letters (× U+00D7 and ÷ U+00F7 are symbols, not letters).
 * European digits are STRONG here — never neutrals.
 */
export function isLtrCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x30 && codePoint <= 0x39) || // European digits 0-9
    (codePoint >= 0x41 && codePoint <= 0x5a) || // A-Z
    (codePoint >= 0x61 && codePoint <= 0x7a) || // a-z
    (codePoint >= 0xc0 &&
      codePoint <= 0xff && // Latin-1 letters
      codePoint !== 0xd7 &&
      codePoint !== 0xf7)
  );
}

/** Is a single character (code point at `index`) part of an Arabic run? */
export function isArabicChar(ch: string): boolean {
  return isArabicCodePoint(ch.codePointAt(0) as number);
}

/**
 * Direction class of a code point: strong Arabic, strong LTR, or neutral
 * (space, tab, punctuation — including Arabic punctuation ، ؛ ؟).
 */
type DirectionClass = 'ar' | 'ltr' | 'neutral';

function classifyCodePoint(codePoint: number): DirectionClass {
  if (isArabicCodePoint(codePoint)) return 'ar';
  if (isLtrCodePoint(codePoint)) return 'ltr';
  return 'neutral';
}

/**
 * Split a string into maximal runs for visual ordering.
 *
 * Direction classes: strong Arabic (AR), strong LTR (Latin/digits), and
 * neutral (space, tab, punctuation). Neutrals are absorbed into a strong
 * run like the Unicode bidi algorithm does (N between R and R → R):
 *  - neutral sequence between two AR strongs → joins the Arabic run, so
 *    multi-word phrases stay ONE run ("فاتورة ضريبية مبسطة" reverses whole)
 *  - neutral sequence between two LTR strongs → joins the LTR run
 *  - neutral sequence between AR and LTR → attaches to the LTR side
 *    (": 1234" stays with the digits, "5x " stays with the prefix)
 *  - leading/trailing neutrals keep their own non-Arabic run (so a leading
 *    space before Arabic stays at the left edge of the printed line)
 *
 * The returned runs keep their original order and preserve all characters.
 */
export function splitArabicRuns(input: string): string[] {
  const chars = Array.from(input);
  if (chars.length === 0) return [];

  interface Segment {
    text: string;
    cls: DirectionClass;
  }

  // Pass 1: maximal runs of equal direction class.
  const segs: Segment[] = [];
  for (const ch of chars) {
    const cls = classifyCodePoint(ch.codePointAt(0) as number);
    const last = segs[segs.length - 1];
    if (last && last.cls === cls) {
      last.text += ch;
    } else {
      segs.push({ text: ch, cls });
    }
  }

  // Pass 2: neutral absorption. `prev` is the last merged strong segment
  // (merged neutrals never leave two neutrals adjacent), `next` the raw
  // following segment — classes strictly alternate in `segs`.
  const merged: Segment[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.cls !== 'neutral') {
      merged.push(seg);
      continue;
    }
    const prev = merged[merged.length - 1];
    const next = segs[i + 1];
    if (prev && next && prev.cls === next.cls) {
      // Neutral between two strongs of the SAME direction → one run.
      prev.text += seg.text + next.text;
      i++; // `next` was absorbed into `prev`; skip it
    } else if (prev && next) {
      // Neutral on an AR/LTR boundary → attach to the LTR side.
      if (prev.cls === 'ltr') {
        prev.text += seg.text;
      } else {
        next.text = seg.text + next.text;
      }
    } else {
      // Leading/trailing neutral — keep its own (non-Arabic) run.
      merged.push(seg);
    }
  }
  return merged.map((s) => s.text);
}

/**
 * Reorder shaped text for an LTR thermal head: reverse each Arabic run,
 * leave non-Arabic runs in place. When `visualRtl` is false this is the
 * identity transform (logical order).
 */
export function visualOrderForThermal(input: string, visualRtl: boolean): string {
  if (!visualRtl) return input;
  let out = '';
  for (const run of splitArabicRuns(input)) {
    // The first code point decides the run's direction: after neutral
    // absorption a strong run never starts with a neutral, and standalone
    // leading/trailing neutral runs are non-Arabic by construction.
    if (isArabicChar(run)) {
      out += Array.from(run).reverse().join('');
    } else {
      out += run;
    }
  }
  return out;
}
