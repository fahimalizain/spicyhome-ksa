import {
  loadArabicGlyphAtlas,
  clearArabicGlyphAtlasCache,
  arabicAtlasCandidates,
  renderArabicLineToMonoBitmap,
  renderArabicLineFromLogical,
  renderLeftRightLineFromLogical,
} from './arabic-raster';
import { shapeArabic, visualOrderForThermal } from './arabic-encode';
import type { PrinterArabicConfig } from '@spicyhome/shared';

const RASTER_CONFIG: PrinterArabicConfig = {
  encoding: 'w1256',
  codePage: 50,
  visualRtl: true,
  renderMode: 'raster',
};

function inkCount(bits: Uint8Array): number {
  let n = 0;
  for (const b of bits) if (b) n++;
  return n;
}

describe('arabic-raster', () => {
  beforeEach(() => {
    clearArabicGlyphAtlasCache();
  });

  it('finds the committed atlas on disk', () => {
    expect(arabicAtlasCandidates().some((p) => p.endsWith('arabic-glyph-atlas.json'))).toBe(true);
  });

  it('loads the committed glyph atlas', () => {
    const atlas = loadArabicGlyphAtlas();
    expect(atlas).not.toBeNull();
    expect(atlas!.meta.cellHeight).toBeGreaterThan(0);
    expect(atlas!.glyphs.length).toBeGreaterThan(200);
  });

  it('renders a non-empty bitmap for مرحبا with ink pixels', () => {
    const atlas = loadArabicGlyphAtlas();
    const shaped = shapeArabic('\u0645\u0631\u062D\u0628\u0627');
    const ordered = visualOrderForThermal(shaped, true);
    const bmp = renderArabicLineToMonoBitmap(ordered, { maxWidthDots: 384 });
    expect(bmp).not.toBeNull();
    expect(bmp!.width).toBe(384);
    expect(bmp!.height).toBe(atlas!.meta.cellHeight);
    expect(bmp!.bits.length).toBe(384 * atlas!.meta.cellHeight);
    expect(inkCount(bmp!.bits)).toBeGreaterThan(50);
  });

  it('renders a compact bitmap when maxWidthDots is small', () => {
    const shaped = shapeArabic('\u0645\u0631\u062D\u0628\u0627');
    const bmp = renderArabicLineToMonoBitmap(visualOrderForThermal(shaped, true), {
      maxWidthDots: 128,
    });
    expect(bmp!.width).toBe(128);
    expect(inkCount(bmp!.bits)).toBeGreaterThan(0);
  });

  it('renderArabicLineFromLogical does shape + visual + raster', () => {
    const bmp = renderArabicLineFromLogical(
      '5x \u0634\u0648\u0631\u0628\u0629 \u0630\u0631\u0629',
      RASTER_CONFIG,
    );
    expect(bmp).not.toBeNull();
    expect(inkCount(bmp!.bits)).toBeGreaterThan(50);
  });

  it('renders mixed lines with ASCII digits and punctuation', () => {
    const bmp = renderArabicLineFromLogical(
      '\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: 1234',
      RASTER_CONFIG,
    );
    expect(bmp).not.toBeNull();
    expect(inkCount(bmp!.bits)).toBeGreaterThan(50);
  });

  it('renders lam-alef ligatures', () => {
    const bmp = renderArabicLineFromLogical('\u0644\u0627 \u0644\u0644\u0647', RASTER_CONFIG);
    expect(bmp).not.toBeNull();
    expect(inkCount(bmp!.bits)).toBeGreaterThan(30);
  });

  it('centers content inside maxWidthDots when align=center', () => {
    const left = renderArabicLineFromLogical('\u0645\u0631\u062D\u0628\u0627', RASTER_CONFIG, {
      maxWidthDots: 384,
      align: 'left',
    })!;
    const center = renderArabicLineFromLogical('\u0645\u0631\u062D\u0628\u0627', RASTER_CONFIG, {
      maxWidthDots: 384,
      align: 'center',
    })!;
    // Centered content must not touch the left edge.
    const firstInkLeft = (bmp: { bits: Uint8Array; width: number; height: number }) => {
      for (let x = 0; x < bmp.width; x++) {
        for (let y = 0; y < bmp.height; y++) {
          if (bmp.bits[y * bmp.width + x]) return x;
        }
      }
      return -1;
    };
    const firstInkCenter = firstInkLeft(center);
    expect(firstInkCenter).toBeGreaterThan(firstInkLeft(left));
  });

  it('right-aligns content when align=right', () => {
    const right = renderArabicLineFromLogical('\u0645\u0631\u062D\u0628\u0627', RASTER_CONFIG, {
      maxWidthDots: 384,
      align: 'right',
    })!;
    let lastInk = -1;
    for (let x = right.width - 1; x >= 0; x--) {
      for (let y = 0; y < right.height; y++) {
        if (right.bits[y * right.width + x]) {
          lastInk = x;
          break;
        }
      }
      if (lastInk >= 0) break;
    }
    // Ink should reach near the right edge (within a few dots of advance slack).
    expect(lastInk).toBeGreaterThan(384 - 40);
  });

  it('renderLeftRightLineFromLogical pins Arabic to the right edge', () => {
    const bmp = renderLeftRightLineFromLogical(
      '2  Zinger Burger',
      '\u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631',
      RASTER_CONFIG,
      { maxWidthDots: 504 },
    )!;
    expect(bmp).not.toBeNull();
    let lastInk = -1;
    for (let x = bmp.width - 1; x >= 0; x--) {
      for (let y = 0; y < bmp.height; y++) {
        if (bmp.bits[y * bmp.width + x]) {
          lastInk = x;
          break;
        }
      }
      if (lastInk >= 0) break;
    }
    expect(lastInk).toBeGreaterThan(504 - 40);
    // Left side also has ink (qty/EN)
    let firstInk = -1;
    for (let x = 0; x < bmp.width; x++) {
      for (let y = 0; y < bmp.height; y++) {
        if (bmp.bits[y * bmp.width + x]) {
          firstInk = x;
          break;
        }
      }
      if (firstInk >= 0) break;
    }
    expect(firstInk).toBeGreaterThanOrEqual(0);
    expect(firstInk).toBeLessThan(100);
  });

  it('renders the empty string as a blank bitmap', () => {
    const bmp = renderArabicLineToMonoBitmap('', { maxWidthDots: 384 });
    expect(bmp).not.toBeNull();
    expect(inkCount(bmp!.bits)).toBe(0);
  });

  it('renders ASCII-only lines through the atlas', () => {
    const bmp = renderArabicLineToMonoBitmap('TOTAL: 51.75', { maxWidthDots: 384 });
    expect(bmp).not.toBeNull();
    expect(inkCount(bmp!.bits)).toBeGreaterThan(20);
  });

  it('skips unknown glyphs without throwing', () => {
    const bmp = renderArabicLineToMonoBitmap('\u4e2d\u6587', { maxWidthDots: 384 });
    expect(bmp).not.toBeNull(); // blank but valid
    expect(inkCount(bmp!.bits)).toBe(0);
  });
});
