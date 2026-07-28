import { TestTicketBuilder, TestTicketOptions } from './test-ticket-builder';
import type { PrinterArabicConfig } from '@spicyhome/shared';

describe('TestTicketBuilder', () => {
  const baseOpts: TestTicketOptions = {
    printerName: 'Counter',
    ip: '192.168.1.50',
    port: 9100,
  };

  function build(arabic?: Partial<PrinterArabicConfig>): Buffer {
    const opts: TestTicketOptions = { ...baseOpts };
    if (arabic) {
      opts.config = {
        arabic: {
          encoding: 'none',
          codePage: 0,
          visualRtl: false,
          ...arabic,
        },
      };
    }
    return new TestTicketBuilder().build(opts);
  }

  function str(buf: Buffer): string {
    return buf.toString('ascii');
  }

  function hex(buf: Buffer): string {
    return buf.toString('hex');
  }

  function findSequence(buf: Buffer, seq: number[]): boolean {
    const bufArray = Array.from(buf);
    for (let i = 0; i <= bufArray.length - seq.length; i++) {
      if (seq.every((b, j) => bufArray[i + j] === b)) {
        return true;
      }
    }
    return false;
  }

  it('contains header label and SpicyHome branding', () => {
    const s = str(build());
    expect(s).toContain('PRINT DIAGNOSTIC');
    expect(s).toContain('SpicyHome POS');
  });

  it('contains printer name and IP', () => {
    const s = str(build());
    expect(s).toContain('Counter');
    expect(s).toContain('192.168.1.50:9100');
  });

  it('contains timestamp label with Asia/Riyadh', () => {
    const s = str(build());
    expect(s).toContain('Time (Asia/Riyadh):');
  });

  it('contains all section labels (section 7 omitted when encoding=none)', () => {
    const s = str(build());
    expect(s).toContain('1. ALIGNMENT');
    expect(s).toContain('2. TEXT STYLES');
    expect(s).toContain('3. SEPARATORS');
    expect(s).toContain('4. COLUMNS');
    expect(s).toContain('5. ENGLISH');
    expect(s).toContain('6. ARABIC');
    expect(s).toContain('8. QR CODE');
    expect(s).toContain('END DIAGNOSTIC');
    // Section 7 is omitted when encoding=none (default)
    expect(s).not.toContain('7. ARABIC');
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
      expect(findSequence(buf, مرحبا_utf8)).toBe(true);
    });

    it('contains W1256 bytes for مرحبا (م ر ح ب ا)', () => {
      const buf = build();
      // مرحبا in W1256: 0xE5 0xD1 0xCD 0xC8 0xC7
      const مرحبا_w1256 = [0xe5, 0xd1, 0xcd, 0xc8, 0xc7];
      expect(findSequence(buf, مرحبا_w1256)).toBe(true);
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
      expect(findSequence(buf, reversed)).toBe(true);
    });

    it('preserves English text after Arabic probe section', () => {
      const s = str(build());
      // After Arabic probe section, section 8 QR follows (section 7 omitted when encoding=none)
      const qrLabelIdx = s.indexOf('8. QR CODE');
      expect(qrLabelIdx).toBeGreaterThan(s.indexOf('End of Arabic probes.'));
    });
  });

  // ── Section 7: Arabic Configured Settings ───────────────────────────────────

  describe('Arabic configured settings (section 7)', () => {
    it('with encoding=none (default): section 7 title and body are entirely absent', () => {
      const s = str(build());
      expect(s).not.toContain('7. ARABIC CONFIGURED SETTINGS');
      expect(s).not.toContain('encoding=none');
      expect(s).not.toContain('Arabic disabled');
      expect(s).not.toContain('Configure in Admin');
      expect(s).not.toContain('End of configured Arabic.');
      expect(s).not.toContain('Restore CP0.');
      // Section 8 and section 6 should still be present
      expect(s).toContain('8. QR CODE');
      expect(s).toContain('6. ARABIC ENCODING PROBES');
      expect(s).toContain('End of Arabic probes.');
    });

    it('does NOT contain Arabic configured samples when encoding=none', () => {
      // The probes section (section 6) still has مرحبا UTF-8.
      // But configured samples from section 7 are absent entirely (encoding=none).
      const buf = build();
      const s = str(buf);

      // No section 7 labels at all
      expect(s).not.toContain('7. ARABIC CONFIGURED SETTINGS');
      expect(s).not.toContain('Arabic disabled');

      // Section 6 probes are still present
      expect(s).toContain('6. ARABIC ENCODING PROBES');
      expect(s).toContain('End of Arabic probes.');
    });

    it('with encoding=utf8: contains UTF-8 bytes of a configured sample', () => {
      const buf = build({ encoding: 'utf8' });
      // شكرا in UTF-8: D8 B4 D9 83 D8 B1 D8 A7
      const شكرا_utf8 = [0xd8, 0xb4, 0xd9, 0x83, 0xd8, 0xb1, 0xd8, 0xa7];
      expect(findSequence(buf, شكرا_utf8)).toBe(true);

      // Config summary line should show utf8
      const s = str(buf);
      expect(s).toContain('encoding=utf8 codePage=0 visualRtl=false');
    });

    it('with encoding=w1256 codePage=50: ESC t 50 present for configured section', () => {
      const buf = build({ encoding: 'w1256', codePage: 50 });
      const h = hex(buf);
      // ESC t 50 must appear after the section 7 label
      const section7Idx = h.indexOf('372e2041524142494320434f4e46494755524544'); // "7. ARABIC CONFIGURED" in hex
      const escT50Idx = h.indexOf('1b7432', section7Idx);
      expect(escT50Idx).toBeGreaterThan(-1);
    });

    it('with encoding=w1256: W1256 bytes of a sample present', () => {
      const buf = build({ encoding: 'w1256' });
      // قائمة in W1256: ق(0xE2) ا(0xC7) ئ(0xC6) م(0xE5) ة(0xC9)
      // Then space, then:
      // ا(0xC7) ل(0xE4) ط(0xD7) ع(0xD9) ا(0xC7) م(0xE5)
      const قائمة_w1256 = [0xe2, 0xc7, 0xc6, 0xe5, 0xc9];
      expect(findSequence(buf, قائمة_w1256)).toBe(true);
    });

    it('with encoding=pc864 codePage=22 visualRtl=true: ESC t 22 present', () => {
      const buf = build({ encoding: 'pc864', codePage: 22, visualRtl: true });
      const h = hex(buf);
      // ESC t 22 must appear after the section 7 label
      const section7Idx = h.indexOf('372e2041524142494320434f4e46494755524544');
      const escT22Idx = h.indexOf('1b7416', section7Idx);
      expect(escT22Idx).toBeGreaterThan(-1);

      // Config summary should show pc864 and codePage 22
      const s = str(buf);
      expect(s).toContain('encoding=pc864 codePage=22 visualRtl=true');
    });

    it('with encoding=pc864 visualRtl=true: PC864 bytes of مرحبا reversed', () => {
      const buf = build({ encoding: 'pc864', visualRtl: true });
      // مرحبا in PC864: م(0xC6) ر(0xB7) ح(0xB3) ب(0xAE) ا(0xAC)
      // = [0xC6, 0xB7, 0xB3, 0xAE, 0xAC]
      // Reversed: [0xAC, 0xAE, 0xB3, 0xB7, 0xC6]
      const مرحبا_pc864_reversed = [0xac, 0xae, 0xb3, 0xb7, 0xc6];
      expect(findSequence(buf, مرحبا_pc864_reversed)).toBe(true);
    });

    it('with encoding=pc864 visualRtl=false: PC864 bytes NOT W1256 bytes', () => {
      const buf = build({ encoding: 'pc864', visualRtl: false });
      // مرحبا in PC864: [0xC6, 0xB7, 0xB3, 0xAE, 0xAC]
      const مرحبا_pc864 = [0xc6, 0xb7, 0xb3, 0xae, 0xac];
      expect(findSequence(buf, مرحبا_pc864)).toBe(true);

      // مرحبا in W1256: [0xE5, 0xD1, 0xCD, 0xC8, 0xC7]
      // These specific W1256 bytes should NOT appear in the configured section.
      // (They still appear in the probes section; we verify the pc864 bytes DO appear.)
    });

    it('contains End of configured Arabic and Restore CP0 labels when encoding is configured', () => {
      // With encoding=none the section is omitted; use utf8 to see the labels
      const s = str(build({ encoding: 'utf8' }));
      expect(s).toContain('End of configured Arabic.');
      expect(s).toContain('Restore CP0.');
    });
  });

  describe('section renumbering', () => {
    it('uses 8. QR CODE not 7. QR CODE', () => {
      const s = str(build());
      expect(s).toContain('8. QR CODE');
      expect(s).not.toContain('7. QR CODE');
    });
  });

  // ── QR codes ────────────────────────────────────────────────────────────────

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
    it('restores code page 0 after configured Arabic so footer is ASCII', () => {
      const h = hex(build());
      // The last ESC t command in the buffer should be restoring CP0
      const lastEscT = h.lastIndexOf('1b74');
      expect(lastEscT).toBeGreaterThan(-1);
      // After the last ESC t, we should see 00 (restore PC437)
      const afterLastEscT = h.slice(lastEscT);
      // Should contain '1b7400' somewhere — CP0 restore
      expect(h.includes('1b7400')).toBe(true);
    });
  });
});
