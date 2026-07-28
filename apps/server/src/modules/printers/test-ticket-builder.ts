import { EscPosBuilder, Align, CutType } from './esc-pos-builder';
import { DEFAULT_PRINTER_CONFIG } from '@spicyhome/shared';
import type { PrinterConfig, PrinterArabicConfig } from '@spicyhome/shared';

export interface TestTicketOptions {
  printerName: string;
  ip: string;
  port: number;
  /** Unix epoch seconds — format display in Asia/Riyadh. Defaults to now. */
  printedAt?: number;
  /** Paper width in characters. Default 42 (80mm). */
  paperWidth?: number;
  /** Parsed printer config; defaults to DEFAULT_PRINTER_CONFIG */
  config?: PrinterConfig;
}

// ── Tiny Windows-1256 encoder for Arabic letters U+0600–U+06FF ──────────────
// Only the subset needed for the diagnostic probes. Unmapped chars → '?' (0x3f).

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
  // Arabic presentation forms (isolated forms needed for visual RTL approach)
  0xfe89: 0xed, // alef with hamza above isolated form
  0xfe8d: 0xed, // alef isolated
  0xfe8f: 0xe1, // beh isolated → actually 0xe1 is feh; use standard mappings
  // Not a complete font mapping — only diag probes needed.
};

function encodeW1256Char(codePoint: number): number {
  // Space
  if (codePoint === 0x0020) return 0x20;
  // Numerals (ASCII)
  if (codePoint >= 0x0030 && codePoint <= 0x0039) return codePoint;
  // Arabic
  if (ARABIC_TO_1256[codePoint] !== undefined) return ARABIC_TO_1256[codePoint];
  return 0x3f; // '?'
}

function encodeW1256(str: string): number[] {
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

function encodeUtf8(str: string): number[] {
  return Array.from(Buffer.from(str, 'utf-8'));
}

// ── PC864 encoder: diagnostic-grade IBM PC864 Arabic letter map ───────────
// Covers basic Arabic alphabet (U+0600–U+06FF) used in the sample strings.
// ASCII space, digits, and common punctuation pass through unchanged.
// Unmapped codepoints → '?' (0x3F).
// Reference: IBM code page 864 (DOS Arabic) common variant.
// This is a diagnostic map — minor positional differences vs. a specific
// printer's font ROM are expected. The goal is for the test ticket to
// produce recognisable Arabic on PC864-compatible hardware.

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

function encodePc864(str: string): number[] {
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
function reverseBytes(bytes: number[]): number[] {
  return [...bytes].reverse();
}

// ── Configured-Arabic sample phrase set ────────────────────────────────────
// Chosen to cover common POS vocabulary: greetings, menu items, modifiers,
// numbers, and a pangram-like letter run for visual spot-checks.
// All strings are in Arabic source; file is UTF-8.
// Keep phrases short to fit ~42-char paper width.

const ARABIC_SAMPLES: string[] = [
  '\u0645\u0631\u062D\u0628\u0627', // 1. مرحبا — hello
  '\u0633\u0628\u0627\u064A\u0633\u064A \u0647\u0648\u0645', // 2. سبايسي هوم — Spicy Home
  '\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0637\u0639\u0627\u0645', // 3. قائمة الطعام — menu
  '\u0628\u0631\u062C\u0631 \u062F\u062C\u0627\u062C \u062D\u0627\u0631', // 4. برجر دجاج حار — hot chicken burger
  '\u0645\u0634\u0631\u0648\u0628 \u063A\u0627\u0632\u064A', // 5. مشروب غازي — soft drink
  '\u0628\u0637\u0627\u0637\u0633 \u0645\u0642\u0644\u064A\u0629', // 6. بطاطس مقلية — french fries
  '\u0633\u0644\u0637\u0629 \u062E\u0636\u0631\u0627\u0621', // 7. سلطة خضراء — green salad
  '\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: 1234', // 8. رقم الطلب: 1234 — order number: 1234
  '\u0637\u0627\u0648\u0644\u0629 5', // 9. طاولة 5 — table 5
  '\u0627\u0633\u062A\u0644\u0627\u0645', // 10. استلام — receipt
  '\u0635\u0627\u0644\u0629', // 11. صالة — hall
  '\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A: 46.00', // 12. الإجمالي: 46.00 — total: 46.00
  '\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 ' +
    '\u0627\u0644\u0645\u0636\u0627\u0641\u0629', // 13. ضريبة القيمة المضافة — VAT
  '\u0634\u0643\u0631\u0627 \u0644\u0632\u064A\u0627\u0631\u062A\u0643\u0645', // 14. شكرا لزيارتكم — thanks for visiting
  '\u0645\u062F\u0641\u0648\u0639', // 15. مدفوع — paid
  '\u0645\u0644\u063A\u064A', // 16. ملغي — cancelled
  '\u0645\u0644\u0627\u062D\u0638\u0627\u062A: \u0628\u062F\u0648\u0646 \u0628\u0635\u0644', // 17. ملاحظات: بدون بصل — notes: no onions
  '\u0643\u0645\u064A\u0629 x2', // 18. كمية x2 — quantity x2
  // 19. Pangram-like letter run: mix of common letters (no spaces for compact width)
  '\u0627\u0628\u062A\u062B\u062C\u062D\u062E\u062F\u0630\u0631\u0632' +
    '\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063A\u0641\u0642' +
    '\u0643\u0644\u0645\u0646\u0647\u0648\u064A', // ابتثجحخدذرزسشصضطظعغفقكلمنهوي
];

// ── Builder ──────────────────────────────────────────────────────────────────

export class TestTicketBuilder {
  build(opts: TestTicketOptions): Buffer {
    const printedAt = opts.printedAt ?? Math.floor(Date.now() / 1000);
    const width = opts.paperWidth ?? 42;
    const config = opts.config ?? DEFAULT_PRINTER_CONFIG;
    const eb = new EscPosBuilder(width);

    // ── Header ─────────────────────────────────────────────────────────────
    eb.init();
    eb.align(Align.Center);
    eb.bold(true);
    eb.doubleSize(true);
    eb.text('PRINT DIAGNOSTIC');
    eb.doubleSize(false);
    eb.bold(false);
    eb.text('SpicyHome POS');
    eb.separator('=');

    // ── Meta ────────────────────────────────────────────────────────────────
    eb.align(Align.Left);
    eb.text(`Printer: ${opts.printerName}`);
    eb.text(`IP: ${opts.ip}:${opts.port}`);
    eb.text(`Time (Asia/Riyadh): ${this.formatDateTime(printedAt)}`);
    eb.blankLine();

    // ── 1. ALIGNMENT ────────────────────────────────────────────────────────
    eb.bold(true);
    eb.text('1. ALIGNMENT');
    eb.bold(false);
    eb.align(Align.Left);
    eb.separator('-');
    eb.text('LEFT ALIGN');
    eb.align(Align.Center);
    eb.text('CENTER ALIGN');
    eb.align(Align.Right);
    eb.text('RIGHT ALIGN');
    eb.align(Align.Left);
    eb.blankLine();

    // ── 2. TEXT STYLES ──────────────────────────────────────────────────────
    eb.bold(true);
    eb.text('2. TEXT STYLES');
    eb.bold(false);
    eb.separator('-');

    eb.text('Normal text ABC 0123');

    eb.bold(true);
    eb.text('Bold text');
    eb.bold(false);

    eb.underline(true);
    eb.text('Underlined text');
    eb.underline(false);

    eb.doubleSize(true);
    eb.text('DOUBLE SIZE');
    eb.doubleSize(false);

    eb.bold(true);
    eb.doubleSize(true);
    eb.text('BOLD DOUBLE');
    eb.doubleSize(false);
    eb.bold(false);

    eb.blankLine();

    // ── 3. SEPARATORS ───────────────────────────────────────────────────────
    eb.bold(true);
    eb.text('3. SEPARATORS');
    eb.bold(false);
    eb.separator('-');
    eb.separator('=');
    eb.separator('*');
    eb.blankLine();

    // ── 4. COLUMNS ──────────────────────────────────────────────────────────
    eb.bold(true);
    eb.text('4. COLUMNS');
    eb.bold(false);
    eb.separator('-');

    eb.columns('2x Zinger Burger', '46.00');
    eb.columns('Item B', '12.50');
    eb.columnsWidth('SUBTOTAL', '58.50', 10);
    eb.blankLine();

    // ── 5. ENGLISH / ASCII ──────────────────────────────────────────────────
    eb.bold(true);
    eb.text('5. ENGLISH / ASCII');
    eb.bold(false);
    eb.separator('-');

    eb.text('The quick brown fox jumps over');
    eb.text('the lazy dog. ABCDEFGHIJKLM');
    eb.text('NOPQRSTUVWXYZ abcdefghijklm');
    eb.text('nopqrstuvwxyz');
    eb.text('0123456789 !@#$%&*()_+-=');
    eb.text('[]{}|<>,.?/~`"\'\\:;');
    eb.blankLine();

    // ── 6. ARABIC ENCODING PROBES ───────────────────────────────────────────
    eb.bold(true);
    eb.text('6. ARABIC ENCODING PROBES');
    eb.bold(false);
    eb.text('(Garbled output expected until');
    eb.text(' the right code page is found)');
    eb.separator('-');

    const arPhrase1 = '\u0645\u0631\u062D\u0628\u0627'; // مرحبا
    const arPhrase2 = '\u0633\u0628\u0627\u064A\u0633\u064A \u0647\u0648\u0645'; // سبايسي هوم

    // Probe 1: UTF-8, no code page change
    eb.text('AR UTF-8 (no code page):');
    eb.rawLine(encodeUtf8(arPhrase1));
    eb.rawLine(encodeUtf8(arPhrase2));
    eb.blankLine();

    // Probe 2: W1256 + code page 50 (WPC1256)
    eb.text('AR W1256 + CP50:');
    eb.codePage(50);
    eb.rawLine(encodeW1256(arPhrase1));
    eb.rawLine(encodeW1256(arPhrase2));
    eb.codePage(0); // restore PC437
    eb.blankLine();

    // Probe 3: W1256 + code page 22 (PC864)
    eb.text('AR W1256 + CP22:');
    eb.codePage(22);
    eb.rawLine(encodeW1256(arPhrase1));
    eb.rawLine(encodeW1256(arPhrase2));
    eb.codePage(0); // restore PC437
    eb.blankLine();

    // Probe 4: W1256 visual-RTL hack + CP50
    eb.text('AR W1256 visual-RTL + CP50:');
    eb.codePage(50);
    eb.rawLine(reverseBytes(encodeW1256(arPhrase1)));
    eb.rawLine(reverseBytes(encodeW1256(arPhrase2)));
    eb.codePage(0); // restore PC437
    eb.blankLine();

    eb.separator('-');
    eb.text('End of Arabic probes.');
    eb.text('Note which probe looked best.');

    // Ensure code page is back to 0 and align left
    eb.codePage(0);
    eb.align(Align.Left);
    eb.blankLine();

    // ── 7. ARABIC CONFIGURED SETTINGS ──────────────────────────────────────
    if (config.arabic.encoding !== 'none') {
      this.buildSection7ArabicConfigured(eb, config.arabic);
    }

    // ── 8. QR CODE ──────────────────────────────────────────────────────────
    eb.bold(true);
    eb.text('8. QR CODE');
    eb.bold(false);
    eb.separator('-');

    eb.align(Align.Center);
    eb.text('QR small (mod 3):');
    eb.qrCode('https://spicyhome.sa/test', 3);
    eb.blankLine();

    eb.text('QR large (mod 6):');
    eb.qrCode('SPICYHOME-DIAG-001', 6);
    eb.blankLine();

    eb.text('QR ZATCA-like (hex TLV short):');
    const tlvPayload =
      'tag01SpicyHome POS tag02' +
      '310122233344445 tag0330' +
      '01234567891234 tag04202' +
      '4-07-28T12:00:00+03:00';
    eb.qrCode(tlvPayload, 4);
    eb.blankLine();

    eb.align(Align.Left);
    eb.blankLine();

    // ── Footer ───────────────────────────────────────────────────────────────
    eb.separator('=');
    eb.align(Align.Center);
    eb.text('END DIAGNOSTIC');
    eb.text('If Arabic is garbled, note');
    eb.text('which probe looked best.');
    eb.feed(4);
    eb.cut(CutType.Partial);

    return eb.getBuffer();
  }

  // ── Section 7: Arabic Configured Settings ──────────────────────────────────

  private buildSection7ArabicConfigured(eb: EscPosBuilder, arabic: PrinterArabicConfig): void {
    // Ensure CP0 for ASCII labels
    eb.codePage(0);

    eb.bold(true);
    eb.text('7. ARABIC CONFIGURED SETTINGS');
    eb.bold(false);
    eb.text(
      `encoding=${arabic.encoding} codePage=${arabic.codePage} visualRtl=${arabic.visualRtl}`,
    );
    eb.separator('-');

    if (arabic.encoding === 'none') {
      eb.text('Arabic disabled (encoding=none).');
      eb.text('Configure in Admin > Printers after');
      eb.text('reviewing section 6 probes.');
    } else {
      // Switch code page for the Arabic body when needed.
      // PC864 / W1256 always need a code page. UTF-8 only if codePage != 0.
      const needCP = arabic.encoding !== 'utf8' || arabic.codePage !== 0;
      if (needCP) {
        eb.codePage(arabic.codePage);
      }

      for (const s of ARABIC_SAMPLES) {
        const bytes = this.encodeArabic(arabic, s);
        if (bytes.length > 0) {
          eb.rawLine(bytes);
        }
      }

      // Restore CP0
      if (needCP) {
        eb.codePage(0);
      }
    }

    eb.separator('-');
    eb.text('End of configured Arabic.');
    eb.text('Restore CP0.');
    eb.codePage(0);
    eb.blankLine();
  }

  /**
   * Encode a UTF-8 Arabic string → byte array using the configured encoding
   * pipeline (encoding → optional visual-RTL byte reversal).
   */
  private encodeArabic(config: PrinterArabicConfig, str: string): number[] {
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
      default:
        return [];
    }
    if (config.visualRtl) {
      bytes = reverseBytes(bytes);
    }
    return bytes;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private formatDateTime(unixSec: number): string {
    const d = new Date(unixSec * 1000);
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      return fmt.format(d);
    } catch {
      const pad = (n: number) => String(n).padStart(2, '0');
      return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      );
    }
  }
}
