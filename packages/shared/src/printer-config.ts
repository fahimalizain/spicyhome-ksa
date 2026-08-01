import { z } from 'zod';

/**
 * Arabic encoding configuration for thermal printers.
 *
 * Hardware truth (validated 2026-08 on Epson via Windows raw / win_rawprint):
 *  - `w1256` + codePage 50 + `visualRtl` + `renderMode: raster` is the
 *    production-quality path (joined letters, correct bidi).
 *  - Charset mode with the same encoding gives correct reading order but
 *    isolated glyphs (W1256 has one glyph per letter — no joining).
 *  - `pc864`/22 remains an option for other printers; run the 01–06 probes
 *    (docs/printing/arabic-thermal.md) before enabling Arabic on new hardware.
 *  - `none` — no Arabic encoding (ASCII sanitize only).
 */

export const ArabicEncoding = {
  NONE: 'none',
  UTF8: 'utf8',
  PC864: 'pc864',
  W1256: 'w1256',
} as const;

export type ArabicEncoding = (typeof ArabicEncoding)[keyof typeof ArabicEncoding];

export const printerArabicConfigSchema = z.object({
  /** How to encode Arabic Unicode -> bytes before send */
  encoding: z.enum(['none', 'utf8', 'pc864', 'w1256']).default('none'),
  /** ESC t n code-page index (0-255). Vendor-specific; Epson-like PC864 is often 22. */
  codePage: z.number().int().min(0).max(255).default(0),
  /** Reverse glyph order for LTR thermal heads (visual RTL). */
  visualRtl: z.boolean().default(false),
  /**
   * How to render Arabic lines on receipt/refund prints:
   * - `charset` — shaped + segment-bidi reordered bytes via ESC t code page
   *   (letters do not join; correct reading order, isolated glyph forms)
   * - `raster`  — shaped text rendered to a monochrome bitmap (GS v 0) so
   *   Arabic letters join properly (requires the committed glyph atlas)
   */
  renderMode: z.enum(['charset', 'raster']).default('charset'),
});

export type PrinterArabicConfig = z.infer<typeof printerArabicConfigSchema>;

export const printerConfigSchema = z.object({
  arabic: printerArabicConfigSchema.default({}),
});

export type PrinterConfig = z.infer<typeof printerConfigSchema>;

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  arabic: {
    encoding: 'none',
    codePage: 0,
    visualRtl: false,
    renderMode: 'charset',
  },
};

/**
 * Parse raw input into a validated PrinterConfig. Throws on invalid data.
 *
 * Handles:
 *  - null / undefined / '' -> defaults
 *  - string -> JSON.parse then schema parse
 *  - object -> schema parse directly
 */
export function parsePrinterConfig(raw: unknown): PrinterConfig {
  if (raw === null || raw === undefined || raw === '') {
    return printerConfigSchema.parse({});
  }

  if (typeof raw === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw Object.assign(new Error(`Invalid printer config JSON: ${message}`), { cause: err });
    }
    return printerConfigSchema.parse(parsed);
  }

  return printerConfigSchema.parse(raw);
}

/**
 * Safe parse — never throws. Returns defaults on any failure.
 * Use on DB read paths so a corrupt row does not crash list endpoints.
 */
export function safeParsePrinterConfig(raw: unknown): PrinterConfig {
  try {
    return parsePrinterConfig(raw);
  } catch {
    return DEFAULT_PRINTER_CONFIG;
  }
}

/**
 * Validate and serialize a printer config to canonical JSON string.
 */
export function serializePrinterConfig(config: unknown): string {
  const parsed = printerConfigSchema.parse(config);
  return JSON.stringify(parsed);
}
