/**
 * ZATCA Phase 2 TLV (Tag-Length-Value) encoder for QR codes.
 *
 * Produces a base64-encoded TLV byte string per ZATCA e-invoice spec.
 * Tags 1–8 per the standard:
 *   1 — Seller Name
 *   2 — VAT Registration Number
 *   3 — Timestamp (ISO 8601, +03:00)
 *   4 — Invoice Total (incl. VAT) as a decimal string
 *   5 — VAT Total as a decimal string
 *   6 — Invoice Hash (base64 of SHA-256)
 *   7 — ECDSA Signature (base64 of DER-encoded signature)
 *   8 — ECDSA Public Key (base64 of raw uncompressed key)
 *
 * Each TLV entry is: [tag 1 byte][length 2 bytes BE][value bytes]
 */

function numberToHalalasStr(halalas: number): string {
  const sar = halalas / 100;
  return sar.toFixed(2);
}

function encodeTLV(tag: number, value: string): Uint8Array {
  const tagByte = new Uint8Array([tag]);
  const valueBytes = new TextEncoder().encode(value);
  const lenBytes = new Uint8Array(2);
  lenBytes[0] = (valueBytes.length >> 8) & 0xff;
  lenBytes[1] = valueBytes.length & 0xff;

  const result = new Uint8Array(1 + 2 + valueBytes.length);
  result.set(tagByte, 0);
  result.set(lenBytes, 1);
  result.set(valueBytes, 3);
  return result;
}

export interface TLVInput {
  sellerName: string;
  vatNumber: string;
  /** ISO 8601 timestamp with +03:00 offset (e.g. "2024-01-15T14:30:00+03:00") */
  timestamp: string;
  /** VAT-inclusive total in halalas */
  totalHalalas: number;
  /** VAT amount in halalas */
  vatHalalas: number;
  /** Base64-encoded SHA-256 invoice hash */
  invoiceHashBase64: string;
  /** Base64-encoded DER ECDSA signature */
  signatureBase64: string;
  /** Base64-encoded raw uncompressed secp256k1 public key (65 bytes) */
  publicKeyBase64: string;
}

/**
 * Encode the ZATCA Phase 2 QR payload into TLV bytes, returned as base64.
 *
 * ZATCA spec: tags must appear in ascending order 1–8.
 */
export function encodeZatcaTLV(input: TLVInput): string {
  const entries: Uint8Array[] = [];

  entries.push(encodeTLV(1, input.sellerName));
  entries.push(encodeTLV(2, input.vatNumber));
  entries.push(encodeTLV(3, input.timestamp));
  entries.push(encodeTLV(4, numberToHalalasStr(input.totalHalalas)));
  entries.push(encodeTLV(5, numberToHalalasStr(input.vatHalalas)));
  entries.push(encodeTLV(6, input.invoiceHashBase64));
  entries.push(encodeTLV(7, input.signatureBase64));
  entries.push(encodeTLV(8, input.publicKeyBase64));

  let totalLen = 0;
  for (const e of entries) totalLen += e.length;

  const tlv = new Uint8Array(totalLen);
  let offset = 0;
  for (const e of entries) {
    tlv.set(e, offset);
    offset += e.length;
  }

  return Buffer.from(tlv).toString('base64');
}
