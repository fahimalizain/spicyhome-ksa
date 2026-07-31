import { EscPosBuilder, Align, CutType } from './esc-pos-builder';

describe('EscPosBuilder', () => {
  describe('init', () => {
    it('emits ESC @ (initialize) as first command', () => {
      const eb = new EscPosBuilder();
      eb.init();
      const buf = eb.getBuffer();
      // ESC @ = 0x1b 0x40
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x40);
    });
  });

  describe('align', () => {
    it('emits ESC a for left alignment', () => {
      const eb = new EscPosBuilder();
      eb.align(Align.Left);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x61);
      expect(buf[2]).toBe(0x00);
    });

    it('emits ESC a for center alignment', () => {
      const eb = new EscPosBuilder();
      eb.align(Align.Center);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x61);
      expect(buf[2]).toBe(0x01);
    });

    it('emits ESC a for right alignment', () => {
      const eb = new EscPosBuilder();
      eb.align(Align.Right);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x61);
      expect(buf[2]).toBe(0x02);
    });
  });

  describe('bold', () => {
    it('emits ESC E 1 for bold on', () => {
      const eb = new EscPosBuilder();
      eb.bold(true);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x45);
      expect(buf[2]).toBe(0x01);
    });
  });

  describe('doubleSize', () => {
    it('emits GS ! 0x11 for double size on', () => {
      const eb = new EscPosBuilder();
      eb.doubleSize(true);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1d);
      expect(buf[1]).toBe(0x21);
      expect(buf[2]).toBe(0x11);
    });

    it('emits GS ! 0x00 for double size off', () => {
      const eb = new EscPosBuilder();
      eb.doubleSize(false);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1d);
      expect(buf[1]).toBe(0x21);
      expect(buf[2]).toBe(0x00);
    });
  });

  describe('text', () => {
    it('appends text with LF', () => {
      const eb = new EscPosBuilder();
      eb.text('Hello');
      const buf = eb.getBuffer();
      const str = buf.toString('ascii');
      expect(str).toContain('Hello');
      expect(buf[buf.length - 1]).toBe(0x0a); // LF
    });
  });

  describe('columns', () => {
    it('right-aligns money amounts at paper edge', () => {
      const eb = new EscPosBuilder(42);
      eb.columns('2x Zinger Burger', '46.00');
      const buf = eb.getBuffer();
      const str = buf.toString('ascii').trim();

      // Right amount should be at end minus LF
      expect(str.endsWith('46.00')).toBe(true);
      // Total line length should be exactly 42 + LF
      expect(buf.length).toBe(42 + 1);
    });

    it('pads left text to fill available space', () => {
      const eb = new EscPosBuilder(42);
      eb.columns('Item A', '12.50');
      const str = eb.getBuffer().toString('ascii');

      // Verify the last chars before LF are the right amount
      const trimmed = str.trimEnd();
      expect(trimmed.endsWith('12.50')).toBe(true);

      // Check the line doesn't exceed paper width
      const lines = trimmed.split('\n');
      expect(lines[0].length).toBe(42);
    });

    it('truncates long item names', () => {
      const eb = new EscPosBuilder(42);
      eb.columns('A Very Long Item Name That Exceeds The Available Space By Far', '1.00');
      const str = eb.getBuffer().toString('ascii');
      const trimmed = str.trimEnd();
      const lines = trimmed.split('\n');
      expect(lines[0].length).toBe(42);
      expect(lines[0].endsWith('1.00')).toBe(true);
    });
  });

  describe('columnsWidth', () => {
    it('places right column at correct position for totals', () => {
      const eb = new EscPosBuilder(42);
      eb.columnsWidth('SUBTOTAL (excl. VAT)', '100.00', 10);
      const str = eb.getBuffer().toString('ascii');
      const trimmed = str.trimEnd();
      expect(trimmed.endsWith('    100.00')).toBe(true);
      expect(trimmed.length).toBe(42);
    });
  });

  describe('separator', () => {
    it('draws a full-width separator line', () => {
      const eb = new EscPosBuilder(42);
      eb.separator('-');
      const str = eb.getBuffer().toString('ascii');
      const lines = str.split('\n');
      // First line is the separator
      expect(lines[0].length).toBe(42);
      expect(lines[0]).toBe('-'.repeat(42));
    });
  });

  describe('feed', () => {
    it('emits ESC d n command', () => {
      const eb = new EscPosBuilder();
      eb.feed(3);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x64);
      expect(buf[2]).toBe(0x03);
    });

    it('clamps lines to 1-255', () => {
      const eb = new EscPosBuilder();
      eb.feed(0);
      expect(eb.getBuffer()[2]).toBe(1);
    });
  });

  describe('cut', () => {
    it('emits GS V 0 for full cut', () => {
      const eb = new EscPosBuilder();
      eb.cut(CutType.Full);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1d);
      expect(buf[1]).toBe(0x56);
      expect(buf[2]).toBe(0x00);
    });

    it('emits GS V B 3 for partial cut', () => {
      const eb = new EscPosBuilder();
      eb.cut(CutType.Partial);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1d);
      expect(buf[1]).toBe(0x56);
      expect(buf[2]).toBe(0x42);
      expect(buf[3]).toBe(0x03);
    });
  });

  describe('qrCode', () => {
    it('emits QR model 2 selection command', () => {
      const eb = new EscPosBuilder();
      eb.qrCode('test');
      const buf = eb.getBuffer();
      const hex = buf.toString('hex');

      // GS ( k 4 0 31 41 2 0 = model 2
      expect(hex).toContain('1d286b040031413200');
      // GS ( k 3 0 31 43 module_size
      expect(hex).toContain('1d286b03003143');
      // GS ( k 3 0 31 45 ec_level
      expect(hex).toContain('1d286b03003145');
      // GS ( k pL pH 31 50 30 data (store QR)
      expect(hex).toContain('315030');
      // GS ( k 3 0 31 51 30 (print QR)
      expect(hex).toContain('1d286b0300315130');
    });

    it('includes the data payload in QR store command', () => {
      const eb = new EscPosBuilder();
      eb.qrCode('ABC123');
      const buf = eb.getBuffer();
      const str = buf.toString('ascii');
      expect(str).toContain('ABC123');
    });
  });

  describe('cashDrawerKick', () => {
    it('emits ESC p command with timing params', () => {
      const eb = new EscPosBuilder();
      eb.cashDrawerKick(0, 60, 240);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x70);
      expect(buf[2]).toBe(0x00); // pin 2
      expect(buf[3]).toBe(60); // on time
      expect(buf[4]).toBe(240); // off time
    });
  });

  describe('paper width', () => {
    it('defaults to 42 chars (80mm)', () => {
      const eb = new EscPosBuilder();
      expect(eb.paperWidth).toBe(42);
    });

    it('accepts custom width', () => {
      const eb = new EscPosBuilder(32);
      expect(eb.paperWidth).toBe(32);
      eb.columns('Item', '10.00');
      const str = eb.getBuffer().toString('ascii');
      const trimmed = str.trimEnd();
      expect(trimmed.length).toBe(32);
    });
  });

  describe('codePage', () => {
    it('emits ESC t n for code page selection', () => {
      const eb = new EscPosBuilder();
      eb.codePage(50);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x74);
      expect(buf[2]).toBe(50);
    });

    it('masks code page to 8 bits', () => {
      const eb = new EscPosBuilder();
      eb.codePage(0x150); // 336 → 0x50 = 80
      const buf = eb.getBuffer();
      expect(buf[2]).toBe(0x50);
    });

    it('restores code page 0 (PC437)', () => {
      const eb = new EscPosBuilder();
      eb.codePage(0);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x74);
      expect(buf[2]).toBe(0x00);
    });
  });

  describe('raw', () => {
    it('appends raw bytes without LF', () => {
      const eb = new EscPosBuilder();
      eb.raw([0xc7, 0xe1, 0xee]); // some W1256 bytes
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0xc7);
      expect(buf[1]).toBe(0xe1);
      expect(buf[2]).toBe(0xee);
      expect(buf.length).toBe(3);
      // No trailing LF
      expect(buf[buf.length - 1]).not.toBe(0x0a);
    });

    it('appends Buffer input', () => {
      const eb = new EscPosBuilder();
      eb.raw(Buffer.from([0xc7, 0xc8]));
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0xc7);
      expect(buf[1]).toBe(0xc8);
    });

    it('appends Uint8Array input', () => {
      const eb = new EscPosBuilder();
      eb.raw(new Uint8Array([0xc7, 0xc8]));
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0xc7);
      expect(buf[1]).toBe(0xc8);
    });

    it('does not sanitize raw bytes (non-ASCII allowed)', () => {
      const eb = new EscPosBuilder();
      // 0x80-0xff range — should pass through unchanged
      eb.raw([0xe5, 0xd1, 0xcd, 0xc8, 0xc7]);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0xe5);
      expect(buf[1]).toBe(0xd1);
      expect(buf[2]).toBe(0xcd);
      expect(buf[3]).toBe(0xc8);
      expect(buf[4]).toBe(0xc7);
      expect(buf.length).toBe(5);
    });
  });

  describe('rawLine', () => {
    it('appends raw bytes with trailing LF', () => {
      const eb = new EscPosBuilder();
      eb.rawLine([0xc7, 0xc8]);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0xc7);
      expect(buf[1]).toBe(0xc8);
      expect(buf[2]).toBe(0x0a); // LF
      expect(buf.length).toBe(3);
    });

    it('does not sanitize bytes', () => {
      const eb = new EscPosBuilder();
      eb.rawLine([0xe5, 0xd1]);
      const buf = eb.getBuffer();
      expect(buf[0]).toBe(0xe5);
      expect(buf[1]).toBe(0xd1);
      expect(buf[2]).toBe(0x0a);
    });
  });

  describe('UTF-8 safety', () => {
    it('strips non-ASCII characters from text', () => {
      const eb = new EscPosBuilder();
      eb.text('Cafe\u0301 Special');
      const str = eb.getBuffer().toString('ascii');
      expect(str).not.toContain('\u0301');
      expect(str).toContain('Cafe');
      expect(str).toContain('Special');
    });
  });

  describe('rasterBitImage', () => {
    it('emits GS v 0 header with correct dimensions', () => {
      const eb = new EscPosBuilder();
      // 8×2: first row all black, second all white
      const bits = new Uint8Array(16);
      for (let i = 0; i < 8; i++) bits[i] = 1;
      eb.rasterBitImage(8, 2, bits);
      const buf = eb.getBuffer();
      // GS v 0 m xL xH yL yH
      expect(buf[0]).toBe(0x1d);
      expect(buf[1]).toBe(0x76);
      expect(buf[2]).toBe(0x30);
      expect(buf[3]).toBe(0x00); // m = normal
      expect(buf[4]).toBe(0x01); // xL = 1 byte/row
      expect(buf[5]).toBe(0x00); // xH
      expect(buf[6]).toBe(0x02); // yL = 2
      expect(buf[7]).toBe(0x00); // yH
      expect(buf[8]).toBe(0xff); // row 0 packed
      expect(buf[9]).toBe(0x00); // row 1 packed
      expect(buf.length).toBe(10);
    });

    it('pads width to multiple of 8', () => {
      const eb = new EscPosBuilder();
      const bits = new Uint8Array(5); // 5×1
      bits[0] = 1;
      bits[4] = 1;
      eb.rasterBitImage(5, 1, bits);
      const buf = eb.getBuffer();
      expect(buf[4]).toBe(0x01); // still 1 byte/row
      // bits: 1 0 0 0 1 0 0 0 → 0b10001000 = 0x88
      expect(buf[8]).toBe(0x88);
    });

    it('throws when bits buffer is too short', () => {
      const eb = new EscPosBuilder();
      expect(() => eb.rasterBitImage(8, 8, new Uint8Array(10))).toThrow(/bits length/);
    });
  });
});
