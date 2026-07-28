import {
  printerConfigSchema,
  PrinterConfig,
  DEFAULT_PRINTER_CONFIG,
  parsePrinterConfig,
  safeParsePrinterConfig,
  serializePrinterConfig,
} from './printer-config';

describe('printerConfigSchema', () => {
  it('returns defaults for empty object', () => {
    const result = printerConfigSchema.parse({});
    expect(result).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('returns defaults for {} with missing nested fields', () => {
    const result = printerConfigSchema.parse({ arabic: {} });
    expect(result).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('partial config fills defaults', () => {
    const result = printerConfigSchema.parse({
      arabic: { encoding: 'pc864', codePage: 22 },
    });
    expect(result.arabic.encoding).toBe('pc864');
    expect(result.arabic.codePage).toBe(22);
    expect(result.arabic.visualRtl).toBe(false);
  });

  it('partial config at root fills defaults', () => {
    const result = printerConfigSchema.parse({});
    expect(result.arabic.encoding).toBe('none');
    expect(result.arabic.codePage).toBe(0);
    expect(result.arabic.visualRtl).toBe(false);
  });

  it('parses a full valid config', () => {
    const config: PrinterConfig = {
      arabic: {
        encoding: 'w1256',
        codePage: 50,
        visualRtl: true,
      },
    };
    const result = printerConfigSchema.parse(config);
    expect(result).toEqual(config);
  });

  it('rejects invalid encoding', () => {
    expect(() =>
      printerConfigSchema.parse({
        arabic: { encoding: 'cp1252' },
      }),
    ).toThrow();
  });

  it('rejects codePage < 0', () => {
    expect(() =>
      printerConfigSchema.parse({
        arabic: { codePage: -1 },
      }),
    ).toThrow();
  });

  it('rejects codePage > 255', () => {
    expect(() =>
      printerConfigSchema.parse({
        arabic: { codePage: 256 },
      }),
    ).toThrow();
  });

  it('rejects non-int codePage', () => {
    expect(() =>
      printerConfigSchema.parse({
        arabic: { codePage: 10.5 },
      }),
    ).toThrow();
  });

  it('rejects non-boolean visualRtl', () => {
    expect(() =>
      printerConfigSchema.parse({
        arabic: { visualRtl: 'yes' },
      }),
    ).toThrow();
  });

  it('rejects wrong types for arabic', () => {
    expect(() => printerConfigSchema.parse({ arabic: 'invalid' })).toThrow();
  });
});

describe('parsePrinterConfig', () => {
  it('returns defaults for null', () => {
    expect(parsePrinterConfig(null)).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('returns defaults for undefined', () => {
    expect(parsePrinterConfig(undefined)).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('returns defaults for empty string', () => {
    expect(parsePrinterConfig('')).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('parses a valid JSON string', () => {
    const result = parsePrinterConfig(
      JSON.stringify({ arabic: { encoding: 'pc864', codePage: 22 } }),
    );
    expect(result.arabic.encoding).toBe('pc864');
    expect(result.arabic.codePage).toBe(22);
    expect(result.arabic.visualRtl).toBe(false);
  });

  it('throws on invalid JSON string', () => {
    expect(() => parsePrinterConfig('not json')).toThrow();
  });

  it('parses a plain object', () => {
    const result = parsePrinterConfig({
      arabic: { encoding: 'utf8', codePage: 0, visualRtl: true },
    });
    expect(result.arabic.encoding).toBe('utf8');
    expect(result.arabic.visualRtl).toBe(true);
  });

  it('throws on invalid plain object', () => {
    expect(() => parsePrinterConfig({ arabic: { encoding: 'bad' } })).toThrow();
  });
});

describe('safeParsePrinterConfig', () => {
  it('returns defaults for null', () => {
    expect(safeParsePrinterConfig(null)).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('returns defaults for garbage string', () => {
    expect(safeParsePrinterConfig('garbage')).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('returns defaults for invalid object', () => {
    expect(safeParsePrinterConfig({ arabic: { encoding: 'bad' } })).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('returns parsed config for valid input', () => {
    const result = safeParsePrinterConfig({
      arabic: { encoding: 'pc864', codePage: 22, visualRtl: false },
    });
    expect(result.arabic.encoding).toBe('pc864');
    expect(result.arabic.codePage).toBe(22);
  });

  it('never throws', () => {
    const inputs = [undefined, null, '', 'bad json', { invalid: true }, 42, [], true, false];
    for (const input of inputs) {
      expect(() => safeParsePrinterConfig(input)).not.toThrow();
      expect(safeParsePrinterConfig(input)).toEqual(DEFAULT_PRINTER_CONFIG);
    }
  });
});

describe('serializePrinterConfig', () => {
  it('round-trips: parse -> serialize -> parse', () => {
    const input = { arabic: { encoding: 'pc864' as const, codePage: 22, visualRtl: false } };
    const serialized = serializePrinterConfig(input);
    const parsed = parsePrinterConfig(serialized);
    expect(parsed).toEqual({
      arabic: { encoding: 'pc864', codePage: 22, visualRtl: false },
    });
  });

  it('serialize defaults to canonical JSON', () => {
    const result = serializePrinterConfig({});
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('throws on invalid config', () => {
    expect(() => serializePrinterConfig({ arabic: { encoding: 'bad' } })).toThrow();
  });

  it('string round-trip through default config', () => {
    const serialized = serializePrinterConfig({});
    expect(typeof serialized).toBe('string');
    expect(() => JSON.parse(serialized)).not.toThrow();
    const parsed = parsePrinterConfig(serialized);
    expect(parsed).toEqual(DEFAULT_PRINTER_CONFIG);
  });
});

describe('DEFAULT_PRINTER_CONFIG', () => {
  it('matches defaults', () => {
    expect(DEFAULT_PRINTER_CONFIG).toEqual({
      arabic: { encoding: 'none', codePage: 0, visualRtl: false },
    });
  });
});
