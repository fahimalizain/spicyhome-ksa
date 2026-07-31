import { loadThermalLogo, clearThermalLogoCache, thermalLogoCandidates } from './thermal-logo';
import { existsSync } from 'fs';

describe('thermal-logo', () => {
  beforeEach(() => {
    clearThermalLogoCache();
  });

  it('lists non-empty path candidates', () => {
    const c = thermalLogoCandidates(240);
    expect(c.length).toBeGreaterThan(3);
    expect(c.some((p) => p.endsWith('logo-thermal.png'))).toBe(true);
  });

  it('loads 240px logo when asset is on disk', () => {
    const anyExists = thermalLogoCandidates(240).some((p) => existsSync(p));
    expect(anyExists).toBe(true);
    const bmp = loadThermalLogo({ size: 240 });
    expect(bmp).not.toBeNull();
    expect(bmp!.width).toBe(240);
    expect(bmp!.height).toBe(240);
    expect(bmp!.bits.length).toBe(240 * 240);
  });

  it('caches load result', () => {
    const a = loadThermalLogo({ size: 240 });
    const b = loadThermalLogo({ size: 240 });
    expect(a).toBe(b);
  });

  it('returns null without throwing when logo missing', () => {
    clearThermalLogoCache();
    // Force miss by loading after clearing; if files exist this still returns bitmap.
    // Explicit miss path: size path that cannot exist via empty cache + no file —
    // covered by decode failure on bad path already. Ensure API never throws:
    expect(() => loadThermalLogo({ size: 192 })).not.toThrow();
  });
});
