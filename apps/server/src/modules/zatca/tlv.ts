/**
 * ZATCA Phase 2 TLV (Tag-Length-Value) encoder for QR codes.
 *
 * Produces a base64-encoded TLV byte string per ZATCA e-invoice spec.
 * Tags 1–9 per the standard (matching the ZATCA SDK BerTlvBuilder):
 *   1 — Seller Name
 *   2 — VAT Registration Number
 *   3 — Timestamp (ISO 8601, +03:00)
 *   4 — Invoice Total (incl. VAT) as a decimal string
 *   5 — VAT Total as a decimal string
 *   6 — Invoice Hash (base64 of SHA-256)
 *   7 — ECDSA Signature (base64 of encoded signature string)
 *   8 — ECDSA Public Key (SPKI DER bytes from PublicKey.getEncoded())
 *   9 — ZATCA CA ECDSA Signature (raw cert signature bytes)
 *
 * Each TLV entry is: [tag 1 byte][length variable bytes][value bytes]
 * Length encoding follows BER TLV (matching BerTlvBuilder.fillLength):
 *   - Length < 128: 1 byte (the length itself)
 *   - Length 128–255: 2 bytes (0x81, length)
 *   - Length 256–65535: 3 bytes (0x82, length >> 8, length & 0xff)
 *   - Length >= 65536: 4 bytes (0x83, length >> 16, ...)
 * Tags 8 and 9 values are raw binary bytes (not strings), decoded
 * from base64 before encoding.
 */

function numberToHalalasStr(halalas: number): string {
  const sar = halalas / 100;
  return sar.toFixed(2);
}

/**
 * Encode a single TLV entry using BER length encoding.
 *
 * `value` can be either a string (encoded as UTF-8) or raw Uint8Array bytes.
 *
 * BER length encoding (matching ZATCA SDK's BerTlvBuilder.fillLength):
 *   - Length < 128:  1 byte  (the length value itself, e.g. 0x0A)
 *   - Length 128-255: 2 bytes (0x81, length)
 *   - Length 256-65535: 3 bytes (0x82, high byte, low byte)
 *   - Length >= 65536: 4 bytes (0x83, ... )
 *
 * Tags 8 and 9 use raw Uint8Array values (binary bytes, not strings).
 * All other tags use string values (UTF-8 encoded).
 */
function encodeTLV(tag: number, value: string | Uint8Array): Uint8Array {
  const tagByte = new Uint8Array([tag]);
  const valueBytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const len = valueBytes.length;

  let lenBytes: Uint8Array;
  if (len < 128) {
    lenBytes = new Uint8Array([len]);
  } else if (len < 256) {
    lenBytes = new Uint8Array([0x81, len]);
  } else if (len < 65536) {
    lenBytes = new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
  } else {
    lenBytes = new Uint8Array([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }

  const result = new Uint8Array(1 + lenBytes.length + valueBytes.length);
  result.set(tagByte, 0);
  result.set(lenBytes, 1);
  result.set(valueBytes, 1 + lenBytes.length);
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
  /** Base64-encoded raw ECDSA signature bytes from the ZATCA-issued X.509 certificate
   *  (extracted by extractCertSignature() — the CA's signature over the cert, NOT our
   *  invoice signature). Omitted if not available (Phase 1 / pre-onboarding). */
  certificateSignatureBase64?: string;
}

/**
 * Encode the ZATCA Phase 2 QR payload into TLV bytes, returned as base64.
 *
 * ZATCA spec: tags must appear in ascending order 1–9.
 * Tag 9 is omitted if certificateSignatureBase64 is not provided.
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
  // Tag 8: public key as SPKI DER bytes (NOT the raw 65-byte EC point).
  // ZATCA SDK uses PublicKey.getEncoded() which returns SubjectPublicKeyInfo
  // DER (~88 bytes for secp256k1). We decode base64 → raw bytes for TLV.
  entries.push(encodeTLV(8, Buffer.from(input.publicKeyBase64, 'base64')));
  // Tag 9: ZATCA CA cert ECDSA signature as raw binary bytes.
  // This is the CA's signature over the certificate (not our invoice signature).
  // Extracted by extractCertSignature() from the X.509 DER structure.
  if (input.certificateSignatureBase64) {
    entries.push(encodeTLV(9, Buffer.from(input.certificateSignatureBase64, 'base64')));
  }

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
