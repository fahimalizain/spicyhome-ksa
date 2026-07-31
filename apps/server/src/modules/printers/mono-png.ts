/**
 * Minimal decoder for 1-bit indexed PNGs (thermal logo assets).
 * No external deps — uses Node zlib only.
 */

import { inflateSync } from 'zlib';

export interface MonoBitmap {
  width: number;
  height: number;
  /** Row-major; 1 = black ink, 0 = white. */
  bits: Uint8Array;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Decode a 1-bit indexed PNG into a monochrome bitmap.
 * Expects bit depth 1, color type 3 (indexed), no interlacing.
 */
export function decodeMonoPng(buf: Buffer): MonoBitmap {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error('mono-png: invalid PNG signature');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let plte: Buffer | null = null;
  const idatParts: Buffer[] = [];

  let offset = 8;
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) {
      throw new Error(`mono-png: truncated chunk ${type}`);
    }
    const data = buf.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      if (data.length < 13) throw new Error('mono-png: bad IHDR');
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      plte = Buffer.from(data);
    } else if (type === 'IDAT') {
      idatParts.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4; // skip CRC
  }

  if (width <= 0 || height <= 0) {
    throw new Error('mono-png: missing or invalid IHDR');
  }
  if (bitDepth !== 1 || colorType !== 3) {
    throw new Error(
      `mono-png: unsupported format bitDepth=${bitDepth} colorType=${colorType} (need 1-bit indexed)`,
    );
  }
  if (interlace !== 0) {
    throw new Error('mono-png: interlaced PNG not supported');
  }
  if (!plte || plte.length < 6) {
    throw new Error('mono-png: missing PLTE');
  }

  // Map palette index → ink (1 = black). Prefer near-black RGB.
  const inkByIndex: number[] = [];
  const nColors = Math.floor(plte.length / 3);
  for (let i = 0; i < nColors; i++) {
    const r = plte[i * 3];
    const g = plte[i * 3 + 1];
    const b = plte[i * 3 + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    inkByIndex[i] = luma < 128 ? 1 : 0;
  }

  const compressed = Buffer.concat(idatParts);
  let raw: Buffer;
  try {
    raw = inflateSync(compressed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`mono-png: inflate failed: ${msg}`, { cause: err });
  }

  const rowBytes = Math.ceil(width / 8);
  const expected = (rowBytes + 1) * height;
  if (raw.length < expected) {
    throw new Error(`mono-png: IDAT too short (${raw.length} < ${expected})`);
  }

  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    const filter = raw[rowStart];
    if (filter !== 0) {
      throw new Error(`mono-png: unsupported filter type ${filter} (only None=0)`);
    }
    for (let x = 0; x < width; x++) {
      const byte = raw[rowStart + 1 + (x >> 3)];
      const bit = (byte >> (7 - (x & 7))) & 1;
      bits[y * width + x] = inkByIndex[bit] ?? bit;
    }
  }

  return { width, height, bits };
}
