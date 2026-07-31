import {
  encodeArabicText,
  encodeUtf8,
  encodeW1256,
  encodePc864,
  reverseBytes,
} from './arabic-encode';
import type { PrinterArabicConfig } from '@spicyhome/shared';

const MARHABA = '\u0645\u0631\u062D\u0628\u0627'; // مرحبا — hello

// UTF-8: D9 85 D8 B1 D8 AD D8 A8 D8 A7
const MARHABA_UTF8 = [0xd9, 0x85, 0xd8, 0xb1, 0xd8, 0xad, 0xd8, 0xa8, 0xd8, 0xa7];
// W1256: م(0xE5) ر(0xD1) ح(0xCD) ب(0xC8) ا(0xC7)
const MARHABA_W1256 = [0xe5, 0xd1, 0xcd, 0xc8, 0xc7];
// PC864: م(0xC6) ر(0xB7) ح(0xB3) ب(0xAE) ا(0xAC)
const MARHABA_PC864 = [0xc6, 0xb7, 0xb3, 0xae, 0xac];

function config(partial: Partial<PrinterArabicConfig>): PrinterArabicConfig {
  return { encoding: 'none', codePage: 0, visualRtl: false, ...partial };
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

    it('keeps ASCII printable punctuation', () => {
      expect(encodePc864('x2:')).toEqual([0x78, 0x32, 0x3a]);
    });

    it('maps unmapped codepoints to ?', () => {
      expect(encodePc864('\u0100')).toEqual([0x3f]);
    });
  });

  describe('reverseBytes', () => {
    it('reverses byte order without mutating input', () => {
      const input = [1, 2, 3];
      expect(reverseBytes(input)).toEqual([3, 2, 1]);
      expect(input).toEqual([1, 2, 3]);
    });
  });

  describe('encodeArabicText', () => {
    it('encoding=none falls back to UTF-8 bytes (no code page)', () => {
      expect(encodeArabicText(config({ encoding: 'none' }), MARHABA)).toEqual(MARHABA_UTF8);
    });

    it('encoding=utf8 emits UTF-8 bytes', () => {
      expect(encodeArabicText(config({ encoding: 'utf8' }), MARHABA)).toEqual(MARHABA_UTF8);
    });

    it('encoding=w1256 emits W1256 bytes', () => {
      expect(encodeArabicText(config({ encoding: 'w1256' }), MARHABA)).toEqual(MARHABA_W1256);
    });

    it('encoding=pc864 emits PC864 bytes', () => {
      expect(encodeArabicText(config({ encoding: 'pc864' }), MARHABA)).toEqual(MARHABA_PC864);
    });

    it('applies visualRtl byte reversal after encoding', () => {
      expect(encodeArabicText(config({ encoding: 'w1256', visualRtl: true }), MARHABA)).toEqual(
        [...MARHABA_W1256].reverse(),
      );
      expect(encodeArabicText(config({ encoding: 'pc864', visualRtl: true }), MARHABA)).toEqual(
        [...MARHABA_PC864].reverse(),
      );
    });

    it('keeps ASCII prefixes and prices intact in mixed strings', () => {
      // "2x " prefix + Arabic name + ASCII digits — all encoders pass ASCII through
      const mixed = `2x ${MARHABA} 46.00`;
      const w1256 = encodeArabicText(config({ encoding: 'w1256' }), mixed);
      expect(w1256.slice(0, 3)).toEqual([0x32, 0x78, 0x20]); // "2x "
      expect(w1256.slice(3, 8)).toEqual(MARHABA_W1256);
      expect(w1256.slice(8)).toEqual(Array.from(Buffer.from(' 46.00', 'ascii')));
    });

    it('handles empty string', () => {
      expect(encodeArabicText(config({ encoding: 'pc864' }), '')).toEqual([]);
    });
  });
});
