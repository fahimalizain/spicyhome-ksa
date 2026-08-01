import { shapeArabic, isJoinableArabicLetter, isArabicDiacritic } from './arabic-shape';

describe('arabic-shape', () => {
  it('shapes مرحبا into contextual presentation forms', () => {
    // م (initial, next ر accepts) ر (final) ح (initial, joins ب) ب (medial,
    // joins ا) ا (final) — verified against python arabic-reshaper
    expect(shapeArabic('\u0645\u0631\u062D\u0628\u0627')).toBe('\ufee3\ufeae\ufea3\ufe92\ufe8e');
  });

  it('forms the lam-alef ligature for لا', () => {
    expect(shapeArabic('\u0644\u0627')).toBe('\ufefb'); // isolated
  });

  it('forms lam-alef variants لأ لإ لآ', () => {
    expect(shapeArabic('\u0644\u0623')).toBe('\ufef7'); // لأ
    expect(shapeArabic('\u0644\u0625')).toBe('\ufef9'); // لإ
    expect(shapeArabic('\u0644\u0622')).toBe('\ufef5'); // لآ
  });

  it('uses the final lam-alef form when the lam attaches to a previous letter', () => {
    // بلا: beh initial (joins lam) + final lam-alef ligature
    expect(shapeArabic('\u0628\u0644\u0627')).toBe('\ufe91\ufefc');
  });

  it('shapes بالله with medial lam', () => {
    // ب (initial) ا (final) ل (initial, prev=ا right-joining) ل (medial) ه (final)
    expect(shapeArabic('\u0628\u0627\u0644\u0644\u0647')).toBe('\ufe91\ufe8e\ufedf\ufee0\ufeea');
  });

  it('shapes لله with initial + medial lam', () => {
    expect(shapeArabic('\u0644\u0644\u0647')).toBe('\ufedf\ufee0\ufeea');
  });

  it('shapes أحمد with a medial meem', () => {
    // أ (isolated) ح (initial, joins م) م (medial, joins د) د (final)
    expect(shapeArabic('\u0623\u062D\u0645\u062F')).toBe('\ufe84\ufea3\ufee4\ufeaa');
  });

  it('keeps non-Arabic characters unchanged', () => {
    expect(shapeArabic('5x Burger 46.00')).toBe('5x Burger 46.00');
    expect(shapeArabic('Hello, world!')).toBe('Hello, world!');
  });

  it('shapes only the Arabic run in mixed strings', () => {
    const shaped = shapeArabic('5x \u0645\u0631\u062D\u0628\u0627');
    expect(shaped.startsWith('5x ')).toBe(true);
    expect(shaped.slice(3)).toBe('\ufee3\ufeae\ufea3\ufe92\ufe8e');
  });

  it('passes diacritics through in logical position', () => {
    // ب + fatha: beh isolated (next is transparent mark) + fatha unchanged
    expect(shapeArabic('\u0628\u064E')).toBe('\ufe8f\u064e');
  });

  it('passes tatweel through unchanged', () => {
    expect(shapeArabic('\u0640')).toBe('\u0640');
  });

  it('passes already-shaped presentation forms through', () => {
    expect(shapeArabic('\ufedf\ufee0')).toBe('\ufedf\ufee0');
  });

  it('shapes شوربة ذرة (common menu word)', () => {
    // ش (initial, joins و) و (final) ر (isolated) ب (initial, joins ة)
    // ة (final) space ذ ر ة (all isolated — dal/reh never join)
    expect(shapeArabic('\u0634\u0648\u0631\u0628\u0629 \u0630\u0631\u0629')).toBe(
      '\ufeb7\ufeee\ufead\ufe91\ufe94 \ufeab\ufead\ufe93',
    );
  });

  it('shapes the full alphabet pangram', () => {
    const pangram =
      '\u0627\u0628\u062A\u062B\u062C\u062D\u062E\u062F\u0630\u0631\u0632' +
      '\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063A\u0641\u0642' +
      '\u0643\u0644\u0645\u0646\u0647\u0648\u064A';
    // Every letter shapes to a presentation form (never falls back to base).
    const shaped = shapeArabic(pangram);
    expect(shaped.length).toBe(pangram.length);
    for (const ch of shaped) {
      const cp = ch.codePointAt(0) as number;
      expect(cp >= 0xfe70 && cp <= 0xfeff).toBe(true);
    }
  });

  it('handles empty string', () => {
    expect(shapeArabic('')).toBe('');
  });

  it('reports joining classes', () => {
    expect(isJoinableArabicLetter(0x0628)).toBe(true); // beh — dual
    expect(isJoinableArabicLetter(0x0627)).toBe(true); // alef — right-joining
    expect(isJoinableArabicLetter(0x0020)).toBe(false); // space
    expect(isArabicDiacritic(0x064e)).toBe(true); // fatha
    expect(isArabicDiacritic(0x0628)).toBe(false);
  });
});
