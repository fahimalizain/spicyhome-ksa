/**
 * Pure ESC/POS byte-buffer builder. No I/O, fully unit-testable.
 *
 * Paper widths (configurable):
 *   80mm = 42 chars (font A) or 48 chars (compressed)
 *   58mm = 32 chars (font A)
 * Default: 42 chars (80mm standard).
 */

export enum Align {
  Left = 0,
  Center = 1,
  Right = 2,
}

export enum CutType {
  Full = 0,
  Partial = 1,
}

const HT = 0x09; // horizontal tab
const LF = 0x0a; // line feed
const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private buf: number[] = [];
  readonly paperWidth: number;

  constructor(paperWidth = 42) {
    this.paperWidth = paperWidth;
  }

  init(): this {
    this.cmd([ESC, 0x40]); // ESC @ — initialize
    return this;
  }

  align(a: Align): this {
    this.cmd([ESC, 0x61, a]); // ESC a n
    return this;
  }

  bold(on: boolean): this {
    this.cmd([ESC, 0x45, on ? 1 : 0]); // ESC E n
    return this;
  }

  /** Double width + double height. */
  doubleSize(on: boolean): this {
    this.cmd([GS, 0x21, on ? 0x11 : 0x00]); // GS ! n (bits: w×2, h×2)
    return this;
  }

  /** Double height only (normal width). One step below full doubleSize. */
  doubleHeight(on: boolean): this {
    this.cmd([GS, 0x21, on ? 0x10 : 0x00]); // GS ! n (h×2)
    return this;
  }

  underline(on: boolean): this {
    this.cmd([ESC, 0x2d, on ? 1 : 0]); // ESC - n
    return this;
  }

  text(line: string): this {
    this.buf.push(...Buffer.from(this.sanitizeText(line), 'ascii'));
    this.buf.push(LF);
    return this;
  }

  /** Append text without trailing LF. */
  textRaw(line: string): this {
    this.buf.push(...Buffer.from(this.sanitizeText(line), 'ascii'));
    return this;
  }

  /** Two-column layout: left aligned, right aligned at column `rightStart`. */
  columns(left: string, right: string): this {
    const w = this.paperWidth;
    const rightAligned = right.padStart(9); // e.g. "   46.00"
    const available = w - rightAligned.length;
    const leftText = this.sanitizeText(left).slice(0, available);
    const line = leftText.padEnd(available, ' ') + rightAligned;
    this.buf.push(...Buffer.from(line, 'ascii'));
    this.buf.push(LF);
    return this;
  }

  /** Two-column: left and right, with a configurable right-column width. */
  columnsWidth(left: string, right: string, rightWidth: number): this {
    const w = this.paperWidth;
    const rightAligned = right.slice(0, rightWidth).padStart(rightWidth);
    const available = w - rightWidth;
    if (available < 0) {
      // Right column alone exceeds paper width — truncate
      this.buf.push(...Buffer.from(rightAligned.slice(0, w), 'ascii'));
      this.buf.push(LF);
      return this;
    }
    const leftText = this.sanitizeText(left).slice(0, available);
    const line = leftText.padEnd(available, ' ') + rightAligned;
    this.buf.push(...Buffer.from(line, 'ascii'));
    this.buf.push(LF);
    return this;
  }

  separator(char = '-', width?: number): this {
    const w = width ?? this.paperWidth;
    const line = char.repeat(Math.min(w, 80));
    this.buf.push(...Buffer.from(line, 'ascii'));
    this.buf.push(LF);
    return this;
  }

  blankLine(): this {
    this.buf.push(LF);
    return this;
  }

  feed(lines = 1): this {
    this.cmd([ESC, 0x64, Math.max(1, Math.min(lines, 255))]); // ESC d n
    return this;
  }

  cut(type: CutType): this {
    if (type === CutType.Partial) {
      // Feed 3 partial-cut-points then partial cut
      this.cmd([GS, 0x56, 0x42, 3]);
    } else {
      this.cmd([GS, 0x56, 0x00]); // GS V 0 — full cut
    }
    return this;
  }

  /** ESC/POS native QR code (model 2). */
  qrCode(data: string, moduleSize = 3, ecLevel = 0x33): this {
    const dataBytes = Buffer.from(data, 'ascii');

    // Select QR model 2
    this.cmd([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);

    // Set module size
    this.cmd([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize]);

    // Set error correction level (0x33=L, 0x34=M, 0x35=Q, 0x36=H)
    this.cmd([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ecLevel]);

    // Store data
    const storeLen = dataBytes.length + 3; // +3 for fn, pk1, pk2 bytes
    const pL = storeLen & 0xff;
    const pH = (storeLen >> 8) & 0xff;
    this.cmd([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]);
    this.buf.push(...dataBytes);

    // Print QR
    this.cmd([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);

    return this;
  }

  /**
   * Select character code table.
   * ESC t n — select code page n (0 = PC437). Used for Arabic encoding probes.
   */
  codePage(n: number): this {
    this.cmd([ESC, 0x74, n & 0xff]);
    return this;
  }

  /**
   * Append raw bytes without sanitization or trailing LF.
   * For encoding probes (Arabic, binary) — use with extreme care.
   * Production `text()` / `columns()` paths must NOT use this.
   */
  raw(bytes: Buffer | Uint8Array | number[]): this {
    this.buf.push(...bytes);
    return this;
  }

  /**
   * Append raw bytes followed by LF — no sanitization.
   * Convenience wrapper around raw() for single-line encoding probes.
   */
  rawLine(bytes: Buffer | Uint8Array | number[]): this {
    this.buf.push(...bytes);
    this.buf.push(LF);
    return this;
  }

  /** Cash drawer kick — ESC p m t1 t2 (m=0 for pin 2, m=1 for pin 5). */
  cashDrawerKick(pin = 0, onTime = 60, offTime = 240): this {
    this.cmd([ESC, 0x70, pin, onTime, offTime]);
    return this;
  }

  /**
   * GS v 0 — print raster bit image (normal density).
   * `bits`: row-major, 1 = black ink. Width is padded to a multiple of 8.
   */
  rasterBitImage(width: number, height: number, bits: Uint8Array): this {
    if (width <= 0 || height <= 0) return this;
    if (bits.length < width * height) {
      throw new Error(
        `rasterBitImage: bits length ${bits.length} < width*height ${width * height}`,
      );
    }

    const paddedW = Math.ceil(width / 8) * 8;
    const bytesPerRow = paddedW / 8;
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = height & 0xff;
    const yH = (height >> 8) & 0xff;

    // GS v 0 m xL xH yL yH
    this.cmd([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]);

    for (let y = 0; y < height; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < width && bits[y * width + x]) {
            byte |= 0x80 >> bit;
          }
        }
        this.buf.push(byte);
      }
    }

    return this;
  }

  getBuffer(): Buffer {
    return Buffer.from(this.buf);
  }

  length(): number {
    return this.buf.length;
  }

  /** Append raw bytes. */
  private cmd(bytes: number[]): void {
    this.buf.push(...bytes);
  }

  /** Strip non-ASCII chars; keep printable ASCII + CR/LF/tab. */
  private sanitizeText(s: string): string {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if ((c >= 0x20 && c <= 0x7e) || c === LF || c === 0x0d || c === HT) {
        out += s[i];
      }
    }
    return out;
  }
}
