import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { decodeMonoPng } from './mono-png';
import { thermalLogoCandidates } from './thermal-logo';

function findLogoPath(size: 240 | 192 = 240): string | null {
  for (const p of thermalLogoCandidates(size)) {
    if (existsSync(p)) return p;
  }
  // Direct fallbacks for local jest without bazel runfiles layout
  const extras = [
    join(
      process.cwd(),
      'apps/server/assets',
      size === 192 ? 'logo-thermal-192.png' : 'logo-thermal.png',
    ),
    join(
      __dirname,
      '../../../../assets',
      size === 192 ? 'logo-thermal-192.png' : 'logo-thermal.png',
    ),
    join(__dirname, '../../../assets', size === 192 ? 'logo-thermal-192.png' : 'logo-thermal.png'),
  ];
  for (const p of extras) {
    if (existsSync(p)) return p;
  }
  return null;
}

describe('decodeMonoPng', () => {
  it('decodes logo-thermal.png as 240×240 monochrome', () => {
    const p = findLogoPath(240);
    expect(p).not.toBeNull();
    const bmp = decodeMonoPng(readFileSync(p!));
    expect(bmp.width).toBe(240);
    expect(bmp.height).toBe(240);
    expect(bmp.bits.length).toBe(240 * 240);

    let black = 0;
    let white = 0;
    for (let i = 0; i < bmp.bits.length; i++) {
      if (bmp.bits[i]) black++;
      else white++;
    }
    expect(black).toBeGreaterThan(100);
    expect(white).toBeGreaterThan(100);
  });

  it('decodes logo-thermal-192.png as 192×192 monochrome', () => {
    const p = findLogoPath(192);
    expect(p).not.toBeNull();
    const bmp = decodeMonoPng(readFileSync(p!));
    expect(bmp.width).toBe(192);
    expect(bmp.height).toBe(192);
  });

  it('rejects non-PNG input', () => {
    expect(() => decodeMonoPng(Buffer.from('not a png'))).toThrow(/signature/);
  });
});
