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
      expect(buf[3]).toBe(60);   // on time
      expect(buf[4]).toBe(240);  // off time
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
});
