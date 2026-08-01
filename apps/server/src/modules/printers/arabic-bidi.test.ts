import {
  isArabicCodePoint,
  isArabicChar,
  isLtrCodePoint,
  splitArabicRuns,
  visualOrderForThermal,
} from './arabic-bidi';
import { shapeArabic } from './arabic-shape';

const MARHABA = '\u0645\u0631\u062D\u0628\u0627'; // مرحبا
const FAATOURA =
  '\u0641\u0627\u062A\u0648\u0631\u0629 \u0636\u0631\u064A\u0628\u064A\u0629 \u0645\u0628\u0633\u0637\u0629'; // فاتورة ضريبية مبسطة
const ORDER_NUM = '\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: 1234'; // رقم الطلب: 1234
const CORN_SOUP = '5x \u0634\u0648\u0631\u0628\u0629 \u0630\u0631\u0629 46.00'; // 5x شوربة ذرة 46.00

/** Reverse a string by code points (presentation forms are single code points). */
const reverse = (s: string): string => Array.from(s).reverse().join('');

describe('arabic-bidi', () => {
  describe('isArabicCodePoint / isArabicChar', () => {
    it('detects Arabic block, presentation forms, and Arabic digits', () => {
      expect(isArabicChar('\u0628')).toBe(true); // beh
      expect(isArabicChar('\ufedf')).toBe(true); // lam initial (PF-B)
      expect(isArabicChar('\u0661')).toBe(true); // Arabic-Indic digit ١
      expect(isArabicChar('b')).toBe(false);
      expect(isArabicChar('5')).toBe(false);
      expect(isArabicChar(' ')).toBe(false);
      expect(isArabicChar(':')).toBe(false);
      expect(isArabicCodePoint(0x0628)).toBe(true);
      expect(isArabicCodePoint(0xfe8f)).toBe(true);
      expect(isArabicCodePoint(0x41)).toBe(false);
    });
  });

  describe('isLtrCodePoint', () => {
    it('classifies ASCII letters, European digits, and Latin-1 letters as LTR', () => {
      expect(isLtrCodePoint(0x41)).toBe(true); // A
      expect(isLtrCodePoint(0x7a)).toBe(true); // z
      expect(isLtrCodePoint(0x30)).toBe(true); // 0
      expect(isLtrCodePoint(0x39)).toBe(true); // 9
      expect(isLtrCodePoint(0xe9)).toBe(true); // é
      expect(isLtrCodePoint(0x20)).toBe(false); // space
      expect(isLtrCodePoint(0x3a)).toBe(false); // colon
      expect(isLtrCodePoint(0xd7)).toBe(false); // × symbol
      expect(isLtrCodePoint(0x0628)).toBe(false); // Arabic beh
    });
  });

  describe('splitArabicRuns', () => {
    it('splits a mixed line into Arabic and non-Arabic runs', () => {
      const runs = splitArabicRuns('5x \u0645\u0631\u062D\u0628\u0627 46.00');
      expect(runs).toEqual(['5x ', MARHABA, ' 46.00']);
    });

    it('keeps a pure non-Arabic string as one run', () => {
      expect(splitArabicRuns('Order 1234')).toEqual(['Order 1234']);
    });

    it('keeps a pure Arabic string as one run', () => {
      expect(splitArabicRuns(MARHABA)).toEqual([MARHABA]);
    });

    it('absorbs neutrals between two Arabic strongs into ONE Arabic run', () => {
      expect(splitArabicRuns(FAATOURA)).toEqual([FAATOURA]);
    });

    it('absorbs neutrals between two LTR strongs into the LTR run', () => {
      expect(splitArabicRuns('Order: 123')).toEqual(['Order: 123']);
    });

    it('attaches boundary neutrals to the LTR side, not the Arabic side', () => {
      expect(splitArabicRuns(ORDER_NUM)).toEqual([
        '\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628', // رقم الطلب
        ': 1234',
      ]);
      expect(splitArabicRuns('5x \u0645\u0631\u062D\u0628\u0627')).toEqual(['5x ', MARHABA]);
    });

    it('keeps leading and trailing neutrals as their own non-Arabic runs', () => {
      expect(splitArabicRuns(' \u0645\u0631\u062D\u0628\u0627 ')).toEqual([' ', MARHABA, ' ']);
    });

    it('preserves all characters when splitting', () => {
      const input = ORDER_NUM;
      expect(splitArabicRuns(input).join('')).toBe(input);
    });
  });

  describe('visualOrderForThermal', () => {
    it('returns logical order when visualRtl is false', () => {
      const shaped = shapeArabic(MARHABA);
      expect(visualOrderForThermal(shaped, false)).toBe(shaped);
    });

    it('reverses a pure Arabic run when visualRtl is true', () => {
      const shaped = shapeArabic(MARHABA);
      const ordered = visualOrderForThermal(shaped, true);
      expect(reverse(ordered)).toBe(shaped);
    });

    it('reverses a single Arabic word', () => {
      const shaped = shapeArabic(MARHABA);
      expect(visualOrderForThermal(shaped, true)).toBe(reverse(shaped));
    });

    it('keeps "5x " before the reversed Arabic segment', () => {
      const shaped = shapeArabic('5x ' + MARHABA);
      const ordered = visualOrderForThermal(shaped, true);
      // Exact form: LTR prefix kept, Arabic reversed as one run.
      expect(ordered).toBe('5x ' + reverse(shapeArabic(MARHABA)));
      // Sanity: a naive whole-string reverse would start with ابحرم — assert not.
      expect(ordered.startsWith('\u0627\u0628\u062D\u0631\u0645')).toBe(false);
    });

    it('reverses a whole multi-word Arabic phrase as ONE run', () => {
      const shaped = shapeArabic(FAATOURA);
      const ordered = visualOrderForThermal(shaped, true);
      // Full reverse of the whole phrase including internal spaces.
      expect(ordered).toBe(reverse(shaped));
    });

    it('reverses multi-word Arabic as one run and keeps ": 1234" intact', () => {
      const shaped = shapeArabic(ORDER_NUM);
      const ordered = visualOrderForThermal(shaped, true);
      // Word order inside the Arabic phrase is corrected (one run):
      expect(ordered).toBe(
        reverse(shapeArabic('\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628')) + ': 1234',
      );
      // Digits stay 1234 in byte order (not 4321).
      expect(ordered.endsWith(': 1234')).toBe(true);
      expect(ordered.endsWith(': 4321')).toBe(false);
    });

    it('keeps prefix and price while reversing a multi-word Arabic item name', () => {
      const shaped = shapeArabic(CORN_SOUP);
      const ordered = visualOrderForThermal(shaped, true);
      expect(ordered).toBe(
        '5x ' +
          reverse(shapeArabic('\u0634\u0648\u0631\u0628\u0629 \u0630\u0631\u0629')) +
          ' 46.00',
      );
    });

    it('handles trailing Arabic after digits', () => {
      const shaped = shapeArabic('\u0637\u0627\u0648\u0644\u0629 5'); // طاولة 5
      const ordered = visualOrderForThermal(shaped, true);
      expect(ordered.startsWith('5')).toBe(false); // Arabic run reversed first
      expect(ordered).toBe(reverse(shapeArabic('\u0637\u0627\u0648\u0644\u0629')) + ' 5');
      expect(ordered.endsWith(' 5')).toBe(true);
    });

    it('reverses presentation forms as a unit (never mid-glyph)', () => {
      // Shapes are single code points — reversing the run must not split them.
      const shaped = shapeArabic('\u0628\u0627\u0644\u0644\u0647'); // بالله
      const ordered = visualOrderForThermal(shaped, true);
      const cps = Array.from(ordered, (c) => c.codePointAt(0) as number);
      for (const cp of cps) {
        expect(cp >= 0xfe70 && cp <= 0xfeff).toBe(true);
      }
    });

    it('handles empty string', () => {
      expect(visualOrderForThermal('', true)).toBe('');
    });
  });
});
