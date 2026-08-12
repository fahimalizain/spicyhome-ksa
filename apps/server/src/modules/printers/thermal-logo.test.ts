import { loadThermalLogo, clearThermalLogoCache, thermalLogoCandidates } from './thermal-logo';
import { existsSync } from 'fs';

describe('thermal-logo', () => {
  beforeEach(() => {
    clearThermalLogoCache();
  });

  it('lists non-empty path candidates', () => {
    const c = thermalLogoCandidates();
    expect(c.length).toBeGreaterThan(3);
    expect(c.some((p) => p.endsWith('logo-thermal.png'))).toBe(true);
  });

  it('loads logo when asset is on disk', () => {
    const anyExists = thermalLogoCandidates().some((p) => existsSync(p));
    expect(anyExists).toBe(true);
    const bmp = loadThermalLogo();
    expect(bmp).not.toBeNull();
    expect(bmp!.width).toBeGreaterThan(0);
    expect(bmp!.height).toBeGreaterThan(0);
    expect(bmp!.width % 8).toBe(0);
    expect(bmp!.bits.length).toBe(bmp!.width * bmp!.height);
  });

  it('caches load result', () => {
    const a = loadThermalLogo();
    const b = loadThermalLogo();
    expect(a).toBe(b);
  });

  it('returns null without throwing when logo missing', () => {
    clearThermalLogoCache();
    expect(() => loadThermalLogo()).not.toThrow();
  });
});
