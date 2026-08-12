import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { decodeMonoPng } from './mono-png';
import { thermalLogoCandidates } from './thermal-logo';

function findLogoPath(): string | null {
  for (const p of thermalLogoCandidates()) {
    if (existsSync(p)) return p;
  }
  // Direct fallbacks for local jest without bazel runfiles layout
  const extras = [
    join(process.cwd(), 'apps/server/assets', 'logo-thermal.png'),
    join(__dirname, '../../../../assets', 'logo-thermal.png'),
    join(__dirname, '../../../assets', 'logo-thermal.png'),
  ];
  for (const p of extras) {
    if (existsSync(p)) return p;
  }
  return null;
}

describe('decodeMonoPng', () => {
  it('decodes logo-thermal.png as monochrome', () => {
    const p = findLogoPath();
    expect(p).not.toBeNull();
    const bmp = decodeMonoPng(readFileSync(p!));
    expect(bmp.width).toBeGreaterThan(0);
    expect(bmp.height).toBeGreaterThan(0);
    expect(bmp.width % 8).toBe(0);
    expect(bmp.bits.length).toBe(bmp.width * bmp.height);

    let black = 0;
    let white = 0;
    for (let i = 0; i < bmp.bits.length; i++) {
      if (bmp.bits[i]) black++;
      else white++;
    }
    expect(black).toBeGreaterThan(100);
    expect(white).toBeGreaterThan(100);
  });

  it('rejects non-PNG input', () => {
    expect(() => decodeMonoPng(Buffer.from('not a png'))).toThrow(/signature/);
  });
});
