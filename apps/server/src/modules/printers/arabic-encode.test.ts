import {
  encodeArabicText,
  encodeUtf8,
  encodeW1256,
  encodePc864,
  reverseBytes,
  presentationFormToBase,
  shapeArabic,
  visualOrderForThermal,
} from './arabic-encode';
import type { PrinterArabicConfig } from '@spicyhome/shared';

const MARHABA = '\u0645\u0631\u062D\u0628\u0627'; // مرحبا — hello

// UTF-8: D9 85 D8 B1 D8 AD D8 A8 D8 A7
const MARHABA_UTF8 = [0xd9, 0x85, 0xd8, 0xb1, 0xd8, 0xad, 0xd8, 0xa8, 0xd8, 0xa7];
// W1256: م(0xE5) ر(0xD1) ح(0xCD) ب(0xC8) ا(0xC7)
const MARHABA_W1256 = [0xe5, 0xd1, 0xcd, 0xc8, 0xc7];
// PC864: م(0xC6) ر(0xB7) ح(0xB3) ب(0xAE) ا(0xAC)
const MARHABA_PC864 = [0xc6, 0xb7, 0xb3, 0xae, 0xac];

// Shaped مرحبا = م(initial FEE3) ر(final FEAE) ح(initial FEA3) ب(medial FE92) ا(final FE8E)
const MARHABA_SHAPED = '\ufee3\ufeae\ufea3\ufe92\ufe8e';

function config(partial: Partial<PrinterArabicConfig>): PrinterArabicConfig {
  return { encoding: 'none', codePage: 0, visualRtl: false, renderMode: 'charset', ...partial };
}

describe('arabic-encode', () => {
  describe('encodeUtf8', () => {
    it('encodes Arabic to UTF-8 bytes', () => {
      expect(encodeUtf8(MARHABA)).toEqual(MARHABA_UTF8);
    });

    it('passes ASCII through unchanged', () => {
      expect(encodeUtf8('2x Burger')).toEqual(Array.from(Buffer.from('2x Burger', 'ascii')));
    });
  });

  describe('encodeW1256', () => {
    it('encodes Arabic letters to Windows-1256 bytes', () => {
      expect(encodeW1256(MARHABA)).toEqual(MARHABA_W1256);
    });

    it('encodes presentation forms via base-letter decomposition', () => {
      // Shaped input is presentation forms; they decompose to base letters.
      expect(encodeW1256(MARHABA_SHAPED)).toEqual(MARHABA_W1256);
    });

    it('splits lam-alef ligatures into lam + alef bytes', () => {
      // لا (FEFB) → ل(0xE4) + ا(0xC7)
      expect(encodeW1256('\ufefb')).toEqual([0xe4, 0xc7]);
      expect(encodeW1256('\ufefc')).toEqual([0xe4, 0xc7]);
    });

    it('keeps ASCII printable text (incl. letters like x in "2x ")', () => {
      expect(encodeW1256('2x Burger')).toEqual(Array.from(Buffer.from('2x Burger', 'ascii')));
    });

    it('maps unmapped non-ASCII codepoints to ?', () => {
      // U+0100 (Latin A with macron) is outside the Arabic map
      expect(encodeW1256('\u0100')).toEqual([0x3f]);
    });
  });

  describe('encodePc864', () => {
    it('encodes Arabic letters to PC864 bytes', () => {
      expect(encodePc864(MARHABA)).toEqual(MARHABA_PC864);
    });

    it('encodes presentation forms via base-letter decomposition', () => {
      expect(encodePc864(MARHABA_SHAPED)).toEqual(MARHABA_PC864);
    });

    it('keeps ASCII printable punctuation', () => {
      expect(encodePc864('x2:')).toEqual([0x78, 0x32, 0x3a]);
    });

    it('maps unmapped codepoints to ?', () => {
      expect(encodePc864('\u0100')).toEqual([0x3f]);
    });
  });

  describe('presentationFormToBase', () => {
    it('maps presentation forms to their base letters', () => {
      expect(presentationFormToBase(0xfe8f)).toBe(0x0628); // beh isolated
      expect(presentationFormToBase(0xfe92)).toBe(0x0628); // beh medial
      expect(presentationFormToBase(0xfefb)).toBe(0x0627); // lam-alef → alef
      expect(presentationFormToBase(0x0628)).toBe(0x0628); // base passes through
      expect(presentationFormToBase(0x41)).toBe(0x41); // ASCII passes through
    });
  });

  describe('reverseBytes', () => {
    it('reverses byte order without mutating input', () => {
      const input = [1, 2, 3];
      expect(reverseBytes(input)).toEqual([3, 2, 1]);
      expect(input).toEqual([1, 2, 3]);
    });
  });

  describe('shapeArabic + visualOrderForThermal exports', () => {
    it('are re-exported from the encode module', () => {
      expect(typeof shapeArabic).toBe('function');
      expect(typeof visualOrderForThermal).toBe('function');
    });
  });

  describe('encodeArabicText', () => {
    it('encoding=none falls back to UTF-8 bytes of the SHAPED text', () => {
      expect(encodeArabicText(config({ encoding: 'none' }), MARHABA)).toEqual(
        encodeUtf8(MARHABA_SHAPED),
      );
    });

    it('encoding=utf8 emits UTF-8 bytes of the SHAPED text', () => {
      expect(encodeArabicText(config({ encoding: 'utf8' }), MARHABA)).toEqual(
        encodeUtf8(MARHABA_SHAPED),
      );
    });

    it('encoding=w1256 emits W1256 bytes (shaped → base)', () => {
      expect(encodeArabicText(config({ encoding: 'w1256' }), MARHABA)).toEqual(MARHABA_W1256);
    });

    it('encoding=pc864 emits PC864 bytes (shaped → base)', () => {
      expect(encodeArabicText(config({ encoding: 'pc864' }), MARHABA)).toEqual(MARHABA_PC864);
    });

    it('applies segment-aware visual RTL (pure Arabic = same as byte reversal)', () => {
      expect(encodeArabicText(config({ encoding: 'w1256', visualRtl: true }), MARHABA)).toEqual(
        [...MARHABA_W1256].reverse(),
      );
      expect(encodeArabicText(config({ encoding: 'pc864', visualRtl: true }), MARHABA)).toEqual(
        [...MARHABA_PC864].reverse(),
      );
    });

    it('keeps ASCII prefixes and prices intact with visualRtl (no whole-string reverse)', () => {
      const mixed = `2x ${MARHABA} 46.00`;
      const bytes = encodeArabicText(config({ encoding: 'w1256', visualRtl: true }), mixed);
      // "2x " stays at the START (old naive reversal would flip it).
      expect(bytes.slice(0, 3)).toEqual([0x32, 0x78, 0x20]);
      // Arabic segment is reversed internally.
      expect(bytes.slice(3, 8)).toEqual([...MARHABA_W1256].reverse());
      // " 46.00" stays at the END, digits in order.
      expect(bytes.slice(8)).toEqual(Array.from(Buffer.from(' 46.00', 'ascii')));
      // The old bug: '00.64 ' + reversed + ' x2' — must not happen.
      expect(bytes).not.toEqual([
        ...Array.from(Buffer.from(' 46.00', 'ascii')).reverse(),
        ...[...MARHABA_W1256].reverse(),
        ...Array.from(Buffer.from('x2 ', 'ascii')).reverse(),
      ]);
    });

    it('keeps digit byte order for "رقم الطلب: 1234" with visualRtl', () => {
      const bytes = encodeArabicText(
        config({ encoding: 'w1256', visualRtl: true }),
        '\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: 1234',
      );
      // Digits must appear as 0x31 0x32 0x33 0x34 in order.
      expect(bytes.slice(-4)).toEqual([0x31, 0x32, 0x33, 0x34]);
    });

    it('encodes لا as lam + alef bytes (charset cannot join)', () => {
      expect(encodeArabicText(config({ encoding: 'w1256' }), '\u0644\u0627')).toEqual([0xe4, 0xc7]);
      expect(encodeArabicText(config({ encoding: 'pc864' }), '\u0644\u0627')).toEqual([0xc5, 0xac]);
    });

    it('emits shaped presentation forms as UTF-8 with visualRtl', () => {
      const expected = encodeUtf8(visualOrderForThermal(MARHABA_SHAPED, true));
      expect(encodeArabicText(config({ encoding: 'utf8', visualRtl: true }), MARHABA)).toEqual(
        expected,
      );
    });

    it('handles empty string', () => {
      expect(encodeArabicText(config({ encoding: 'pc864' }), '')).toEqual([]);
      expect(encodeArabicText(config({ encoding: 'w1256', visualRtl: true }), '')).toEqual([]);
    });
  });
});
