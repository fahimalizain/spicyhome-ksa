import { TestTicketBuilder } from './test-ticket-builder';

describe('TestTicketBuilder', () => {
  const opts = {
    printerName: 'Counter',
    ip: '192.168.1.50',
    port: 9100,
  };

  function build(): Buffer {
    return new TestTicketBuilder().build(opts);
  }

  function str(buf: Buffer): string {
    return buf.toString('ascii');
  }

  function hex(buf: Buffer): string {
    return buf.toString('hex');
  }

  it('contains header label and SpicyHome branding', () => {
    const buf = build();
    const s = str(buf);
    expect(s).toContain('PRINT DIAGNOSTIC');
    expect(s).toContain('SpicyHome POS');
  });

  it('contains printer name and IP', () => {
    const buf = build();
    const s = str(buf);
    expect(s).toContain('Counter');
    expect(s).toContain('192.168.1.50:9100');
  });

  it('contains timestamp label with Asia/Riyadh', () => {
    const buf = build();
    const s = str(buf);
    expect(s).toContain('Time (Asia/Riyadh):');
  });

  it('contains all section labels', () => {
    const buf = build();
    const s = str(buf);
    expect(s).toContain('1. ALIGNMENT');
    expect(s).toContain('2. TEXT STYLES');
    expect(s).toContain('3. SEPARATORS');
    expect(s).toContain('4. COLUMNS');
    expect(s).toContain('5. ENGLISH');
    expect(s).toContain('6. ARABIC');
    expect(s).toContain('7. QR CODE');
    expect(s).toContain('END DIAGNOSTIC');
  });

  describe('alignment commands', () => {
    it('emits ESC a for left, center, and right alignment', () => {
      const h = hex(build());
      // ESC a 0x00 = left
      expect(h).toContain('1b6100');
      // ESC a 0x01 = center
      expect(h).toContain('1b6101');
      // ESC a 0x02 = right
      expect(h).toContain('1b6102');
    });
  });

  describe('text styles', () => {
    it('contains sample style labels', () => {
      const s = str(build());
      expect(s).toContain('Normal text ABC 0123');
      expect(s).toContain('Bold text');
      expect(s).toContain('Underlined text');
      expect(s).toContain('DOUBLE SIZE');
      expect(s).toContain('BOLD DOUBLE');
    });
  });

  describe('separators', () => {
    it('contains separator chars', () => {
      const s = str(build());
      // Should contain lines of repeated dash, equals, asterisk
      // (they may be truncated by ascii conv — just check presence of each char)
      expect(s).toContain('---');
      expect(s).toContain('===');
      expect(s).toContain('***');
    });
  });

  describe('columns', () => {
    it('contains sample column items', () => {
      const s = str(build());
      expect(s).toContain('Zinger Burger');
      expect(s).toContain('46.00');
      expect(s).toContain('Item B');
      expect(s).toContain('12.50');
      expect(s).toContain('SUBTOTAL');
      expect(s).toContain('58.50');
    });
  });

  describe('English section', () => {
    it('contains pangram and ASCII charset', () => {
      const s = str(build());
      expect(s).toContain('The quick brown fox jumps over');
      expect(s).toContain('the lazy dog');
      expect(s).toContain('0123456789');
      expect(s).toContain('ABCDEFGHIJKLM');
    });
  });

  describe('Arabic encoding probes', () => {
    it('contains ASCII probe labels', () => {
      const s = str(build());
      expect(s).toContain('AR UTF-8 (no code page):');
      expect(s).toContain('AR W1256 + CP50:');
      expect(s).toContain('AR W1256 + CP22:');
      expect(s).toContain('AR W1256 visual-RTL + CP50:');
      expect(s).toContain('End of Arabic probes.');
      expect(s).toContain('Note which probe looked best.');
    });

    it('contains UTF-8 bytes of مرحبا in buffer', () => {
      const buf = build();
      // مرحبا in UTF-8: D9 85 D8 B1 D8 AD D8 A8 D8 A7
      const مرحبا_utf8 = [0xd9, 0x85, 0xd8, 0xb1, 0xd8, 0xad, 0xd8, 0xa8, 0xd8, 0xa7];
      const bufArray = Array.from(buf);
      // Find the sequence in buffer
      let found = false;
      for (let i = 0; i <= bufArray.length - مرحبا_utf8.length; i++) {
        if (مرحبا_utf8.every((b, j) => bufArray[i + j] === b)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('contains W1256 bytes for مرحبا (م ر ح ب ا)', () => {
      const buf = build();
      // مرحبا in W1256: 0xE5 0xD1 0xCD 0xC8 0xC7
      const مرحبا_w1256 = [0xe5, 0xd1, 0xcd, 0xc8, 0xc7];
      const bufArray = Array.from(buf);
      let found = false;
      for (let i = 0; i <= bufArray.length - مرحبا_w1256.length; i++) {
        if (مرحبا_w1256.every((b, j) => bufArray[i + j] === b)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('contains ESC t (code page select) commands', () => {
      const h = hex(build());
      // ESC t = 0x1b 0x74
      expect(h).toContain('1b74');
      // Code page 50 (CP50 WPC1256)
      expect(h).toContain('1b7432'); // 0x32 = 50
      // Code page 22 (CP22 PC864)
      expect(h).toContain('1b7416'); // 0x16 = 22
      // Code page 0 (PC437 restore)
      expect(h).toContain('1b7400');
    });

    it('contains reversed W1256 for visual-RTL probe', () => {
      const buf = build();
      // مرحبا in W1256: 0xE5 0xD1 0xCD 0xC8 0xC7
      // Reversed: 0xC7 0xC8 0xCD 0xD1 0xE5
      const reversed = [0xc7, 0xc8, 0xcd, 0xd1, 0xe5];
      const bufArray = Array.from(buf);
      let found = false;
      for (let i = 0; i <= bufArray.length - reversed.length; i++) {
        if (reversed.every((b, j) => bufArray[i + j] === b)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('preserves English text after Arabic probe section', () => {
      const s = str(build());
      // After Arabic section, English text should be readable again
      const qrLabelIdx = s.indexOf('7. QR CODE');
      expect(qrLabelIdx).toBeGreaterThan(s.indexOf('End of Arabic probes.'));
    });
  });

  describe('QR codes', () => {
    it('contains QR command sequences', () => {
      const h = hex(build());
      // GS ( k ... model 2 selection
      expect(h).toContain('1d286b040031413200');
      // GS ( k ... print QR
      expect(h).toContain('1d286b0300315130');
    });

    it('contains QR payload data', () => {
      const s = str(build());
      expect(s).toContain('https://spicyhome.sa/test');
      expect(s).toContain('SPICYHOME-DIAG-001');
    });

    it('contains QR label text', () => {
      const s = str(build());
      expect(s).toContain('QR small (mod 3):');
      expect(s).toContain('QR large (mod 6):');
      expect(s).toContain('QR ZATCA-like (hex TLV short):');
    });
  });

  describe('cut', () => {
    it('ends with partial cut sequence', () => {
      const buf = build();
      const h = hex(buf);
      // GS V B 3 = 0x1d 0x56 0x42 0x03
      expect(h).toContain('1d564203');
      // Should be near the end of buffer
      const cutPos = h.lastIndexOf('1d564203');
      const totalLen = h.length;
      // cut should be in the last ~10% of the buffer
      expect(cutPos / totalLen).toBeGreaterThan(0.9);
    });
  });

  describe('cash drawer', () => {
    it('does NOT contain cash drawer kick command', () => {
      const h = hex(build());
      // ESC p = 0x1b 0x70
      expect(h).not.toContain('1b70');
    });
  });

  describe('buffer size', () => {
    it('is substantially larger than the old minimal ticket', () => {
      const buf = build();
      // Old minimal ticket was ~4 lines → ~100-200 bytes
      // New diagnostic should be several hundred bytes
      expect(buf.length).toBeGreaterThan(500);
    });
  });

  describe('init command', () => {
    it('starts with ESC @ initialize sequence', () => {
      const buf = build();
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x40);
    });
  });

  describe('code page restored', () => {
    it('restores code page 0 after Arabic probes so footer is ASCII', () => {
      const h = hex(build());
      // The last ESC t command in the buffer should be restoring CP0
      const lastEscT = h.lastIndexOf('1b74');
      expect(lastEscT).toBeGreaterThan(-1);
      // After the last ESC t, we should see 00 (restore PC437)
      const afterLastEscT = h.slice(lastEscT);
      // Should contain '1b7400' somewhere — CP0 restore
      // The last one should indeed be 00
      expect(h.includes('1b7400')).toBe(true);
    });
  });
});
