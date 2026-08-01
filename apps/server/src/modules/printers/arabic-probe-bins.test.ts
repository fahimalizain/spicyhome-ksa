import { mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { buildArabicProbeBins, writeArabicProbeBins, arabicProbeReadme } from './arabic-probe-bins';
import { encodeW1256 } from './arabic-encode';

describe('arabic-probe-bins', () => {
  it('builds all six probe bins in order', () => {
    const bins = buildArabicProbeBins();
    expect(bins.map((b) => b.name)).toEqual([
      '01-baseline-w1256-blind-rtl.bin',
      '02-charset-w1256-cp50-shaped-bidi.bin',
      '03-raster-shaped-bidi.bin',
      '04-mixed-item-line.bin',
      '05-mixed-item-line-raster.bin',
      '06-lam-alef.bin',
    ]);
  });

  it('each bin is a complete ESC/POS job', () => {
    for (const bin of buildArabicProbeBins()) {
      const buf = bin.buffer;
      // ESC @ init
      expect(buf[0]).toBe(0x1b);
      expect(buf[1]).toBe(0x40);
      // ASCII label present (first two chars of the file name, e.g. "01")
      expect(buf.toString('ascii')).toContain(bin.name.slice(0, 2));
      // Ends with a partial cut (GS V B 3)
      expect(buf.subarray(buf.length - 4).toString('hex')).toBe('1d564203');
    }
  });

  it('charset probes select code page 50 (ESC t 50)', () => {
    const bins = buildArabicProbeBins();
    const h = bins[1].buffer.toString('hex'); // 02 charset
    expect(h).toContain('1b7432'); // ESC t 50
    expect(h).toContain('1b7400'); // restore PC437
  });

  it('raster probes contain GS v 0 commands', () => {
    const bins = buildArabicProbeBins();
    const h = bins[2].buffer.toString('hex'); // 03 raster
    expect(h).toContain('1d7630'); // GS v 0
    // Raster probe should contain many raster images (one per sample line)
    expect(h.split('1d7630').length - 1).toBeGreaterThanOrEqual(6);
  });

  it('baseline probe simulates the old blind whole-string reversal', () => {
    const bins = buildArabicProbeBins();
    const buf = bins[0].buffer;
    const bytes = Array.from(buf);
    // The old behavior: reversed W1256 bytes of مرحبا appear somewhere.
    const reversed = [...encodeW1256('\u0645\u0631\u062D\u0628\u0627')].reverse();
    for (let i = 0; i <= bytes.length - reversed.length; i++) {
      if (reversed.every((b, j) => bytes[i + j] === b)) {
        return; // found
      }
    }
    throw new Error('reversed W1256 bytes not found in baseline probe');
  });

  it('mixed-item probes keep the qty "x" in the right segment order', () => {
    const bins = buildArabicProbeBins();
    // 04 is charset: '2x ' should appear as ASCII bytes (0x32 0x78 0x20).
    const h = bins[3].buffer.toString('hex');
    expect(h).toContain('327820'); // "2x "
    expect(h).toContain('317820'); // "1x "
    expect(h).toContain('337820'); // "3x "
  });

  it('README documents the win_rawprint command', () => {
    const readme = arabicProbeReadme();
    expect(readme).toContain('win_rawprint.exe');
    expect(readme).toContain('02-charset-w1256-cp50-shaped-bidi.bin');
    expect(readme).toContain('node scripts/arabic-print-probes.mjs');
  });

  it('writes bins to a directory when WRITE_ARABIC_PROBES=1 (tmp/arabic-probes)', () => {
    const env = process.env.WRITE_ARABIC_PROBES;
    if (env !== '1') {
      return; // opt-in: bazel test --test_env=WRITE_ARABIC_PROBES=1 or via the script
    }
    const cwd = process.cwd();
    const outDir = resolve(join(cwd, 'tmp', 'arabic-probes'));
    mkdirSync(outDir, { recursive: true });
    const written = writeArabicProbeBins(outDir);
    expect(written.length).toBe(7); // 6 bins + README
    expect(written.every((f) => f.startsWith(outDir))).toBe(true);
  });
});
