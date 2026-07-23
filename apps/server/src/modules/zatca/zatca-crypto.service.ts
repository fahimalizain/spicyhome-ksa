/**
 * ZATCA Crypto Service — pure-JS ECDSA secp256k1 signing, hashing, CSR generation.
 *
 * Uses @noble/curves for key ops and @noble/hashes for SHA-256.
 * Key encryption at rest: AES-256-GCM via node:crypto.
 *
 * CSR builder: constructs a PKCS#10 CSR in DER format with the required
 * ZATCA subject DN fields (CN, OU, O, C, and OrganizationIdentifier).
 *
 * Hashing rules per ZATCA e-invoicing spec:
 *   1. Generate UBL invoice XML WITHOUT UBLExtensions/signature.
 *   2. Canonicalize: strip UBLExtensions, collapse inter-tag whitespace.
 *   3. SHA-256 over canonicalized XML bytes.
 *   4. Encode result as base64.
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

// ── Key generation ─────────────────────────────────────────────────────────────

export interface KeyPair {
  privateKeyHex: string; // 32-byte private key as hex
  publicKeyHex: string; // 65-byte uncompressed public key as hex (04 || x || y)
  publicKeyBase64: string; // 65-byte uncompressed public key as base64
}

/**
 * Generate a fresh ECDSA secp256k1 keypair.
 * Returns private key as hex (32 bytes = 64 hex chars) and
 * public key as uncompressed hex (65 bytes = 130 hex chars, 04||x||y).
 */
export function generateKeyPair(): KeyPair {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed

  return {
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(publicKey),
    publicKeyBase64: Buffer.from(publicKey).toString('base64'),
  };
}

/**
 * Export public key in DER SubjectPublicKeyInfo format.
 */
export function exportPublicKeyDer(publicKeyHex: string): Uint8Array {
  const pubBytes = hexToBytes(publicKeyHex);

  const ecPubKeyOid = encodeOid('1.2.840.10045.2.1');
  const secp256k1Oid = encodeOid('1.3.132.0.10');
  const algIdSeq = derSequence([ecPubKeyOid, secp256k1Oid]);

  const bitStrContent = new Uint8Array(pubBytes.length + 1);
  bitStrContent[0] = 0;
  bitStrContent.set(pubBytes, 1);
  const bitString = derBitString(bitStrContent);

  return derSequence([algIdSeq, bitString]);
}

export function toPem(derBytes: Uint8Array, label: string): string {
  const b64 = Buffer.from(derBytes).toString('base64');
  const lines: string[] = [];
  lines.push(`-----BEGIN ${label}-----`);
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  lines.push(`-----END ${label}-----`);
  return lines.join('\n') + '\n';
}

export function getPublicKeyPem(publicKeyHex: string): string {
  const der = exportPublicKeyDer(publicKeyHex);
  return toPem(der, 'PUBLIC KEY');
}

/**
 * Sign a SHA-256 hash (32 bytes as hex) with ECDSA secp256k1.
 * Returns DER-encoded signature as hex string.
 */
export function signHashHex(hashHex: string, privateKeyHex: string): string {
  const hashBytes = hexToBytes(hashHex);
  const privBytes = hexToBytes(privateKeyHex);
  const sig = secp256k1.sign(hashBytes, privBytes);
  const derSig = encodeSignatureDER(sig.r, sig.s);
  return bytesToHex(derSig);
}

/**
 * Sign a message hash and return DER signature as base64.
 */
export function signHashBase64(hashHex: string, privateKeyHex: string): string {
  const derHex = signHashHex(hashHex, privateKeyHex);
  return Buffer.from(hexToBytes(derHex)).toString('base64');
}

/**
 * Verify an ECDSA signature over a hash.
 */
export function verifySignature(
  hashHex: string,
  signatureDerBase64: string,
  publicKeyHex: string,
): boolean {
  const hashBytes = hexToBytes(hashHex);
  const sigDerBytes = new Uint8Array(Buffer.from(signatureDerBase64, 'base64'));
  const pubBytes = hexToBytes(publicKeyHex);

  // Use DER format verification
  return secp256k1.verify(sigDerBytes, hashBytes, pubBytes, { format: 'der' } as any);
}

// ── Invoice hashing ───────────────────────────────────────────────────────────

/**
 * Canonicalize UBL XML for hashing per ZATCA rules.
 *
 * 1. Strip UBLExtensions element and its contents.
 * 2. Collapse inter-tag whitespace: > \n < → > <
 * 3. Trim the entire document.
 *
 * NOTE: This is a pragmatic canonicalization. Our XML builder produces
 * deterministic output without extraneous whitespace, so canonicalization
 * is primarily stripping the UBLExtensions (signature block) for the
 * unsigned hash.
 */
export function canonicalizeForHash(xml: string): string {
  let canonical = xml.replace(/<ext:UBLExtensions(\s[^>]*)?>[\s\S]*?<\/ext:UBLExtensions>/g, '');

  canonical = canonical.replace(/<ext:UBLExtensions\/>/g, '');

  // Collapse inter-tag whitespace
  canonical = canonical.replace(/>\s+</g, '><');

  canonical = canonical.trim();

  return canonical;
}

/**
 * Compute the ZATCA invoice hash:
 *   1. Canonicalize XML (strip UBLExtensions)
 *   2. SHA-256 over UTF-8 bytes
 *   3. Base64 encode the 32-byte hash
 */
export function computeInvoiceHash(xml: string): string {
  const canonical = canonicalizeForHash(xml);
  const hashBytes = sha256(new TextEncoder().encode(canonical));
  return Buffer.from(hashBytes).toString('base64');
}

/**
 * Compute invoice hash as hex (for signing).
 */
export function computeInvoiceHashHex(xml: string): string {
  const canonical = canonicalizeForHash(xml);
  const hashBytes = sha256(new TextEncoder().encode(canonical));
  return bytesToHex(hashBytes);
}

// ── X509 signature value wrapping for UBL 2.1 ──────────────────────────────────

/**
 * Embed an ECDSA signature into the UBL 2.1 Invoice/Signature extension.
 *
 * This function takes an unsigned invoice XML and inserts the digital signature
 * into the UBLExtensions block per the UBL 2.1 XAdES enveloped signature profile.
 *
 * The signature block is inserted immediately after the root <Invoice ...> tag.
 */
export function embedSignatureIntoXML(
  unsignedXml: string,
  invoiceHashB64: string,
  signatureB64: string,
  certificateB64: string,
): string {
  const invoiceOpenEnd = unsignedXml.indexOf('>');
  if (invoiceOpenEnd === -1) {
    throw new Error('Invalid XML: no root element opening found');
  }

  const prolog = unsignedXml.slice(0, invoiceOpenEnd + 1);
  const rest = unsignedXml.slice(invoiceOpenEnd + 1);

  const signatureBlock = buildUBLSignatureBlock(invoiceHashB64, signatureB64, certificateB64);
  return prolog + '\n' + signatureBlock + rest;
}

function buildUBLSignatureBlock(
  invoiceHashB64: string,
  signatureB64: string,
  certificateB64: string,
): string {
  return [
    '  <ext:UBLExtensions>',
    '    <ext:UBLExtension>',
    '      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>',
    '      <ext:ExtensionContent>',
    '        <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"',
    '          xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"',
    '          xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    '          <sac:SignatureInformation>',
    '            <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>',
    '            <sac:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sac:ReferencedSignatureID>',
    '            <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">',
    '              <ds:SignedInfo>',
    '                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
    '                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>',
    '                <ds:Reference URI="">',
    '                  <ds:Transforms>',
    '                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
    '                      <ds:XPath>not(//ext:UBLExtensions)</ds:XPath>',
    '                    </ds:Transform>',
    '                  </ds:Transforms>',
    '                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `                  <ds:DigestValue>${invoiceHashB64}</ds:DigestValue>`,
    '                </ds:Reference>',
    '              </ds:SignedInfo>',
    `              <ds:SignatureValue>${signatureB64}</ds:SignatureValue>`,
    '              <ds:KeyInfo>',
    '                <ds:X509Data>',
    `                  <ds:X509Certificate>${certificateB64}</ds:X509Certificate>`,
    '                </ds:X509Data>',
    '              </ds:KeyInfo>',
    '            </ds:Signature>',
    '          </sac:SignatureInformation>',
    '        </sig:UBLDocumentSignatures>',
    '      </ext:ExtensionContent>',
    '    </ext:UBLExtension>',
    '  </ext:UBLExtensions>',
  ].join('\n');
}

// ── DER encoding helpers ──────────────────────────────────────────────────────

export function encodeOid(oidStr: string): Uint8Array {
  const parts = oidStr.split('.').map(Number);
  if (parts.length < 2) throw new Error('Invalid OID');

  const result: number[] = [];
  result.push(40 * parts[0] + parts[1]);

  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val < 128) {
      result.push(val);
    } else {
      const stack: number[] = [];
      while (val > 0) {
        stack.push((val & 0x7f) | 0x80);
        val >>= 7;
      }
      stack[stack.length - 1] &= 0x7f;
      result.push(...stack.reverse());
    }
  }

  return new Uint8Array([0x06, result.length, ...result]);
}

export function derSequence(items: Uint8Array[]): Uint8Array {
  const content = concatBytes(items);
  return derWrap(0x30, content);
}

export function derSet(items: Uint8Array[]): Uint8Array {
  const content = concatBytes(items);
  return derWrap(0x31, content);
}

export function derBitString(data: Uint8Array): Uint8Array {
  return derWrap(0x03, data);
}

export function derOctetString(data: Uint8Array): Uint8Array {
  return derWrap(0x04, data);
}

export function derInteger(value: Uint8Array | number): Uint8Array {
  let bytes: Uint8Array;
  if (typeof value === 'number') {
    bytes = encodeIntegerValue(value);
  } else {
    bytes = value;
  }
  if (bytes.length > 0 && (bytes[0] & 0x80) !== 0) {
    const padded = new Uint8Array(bytes.length + 1);
    padded[0] = 0;
    padded.set(bytes, 1);
    bytes = padded;
  }
  return derWrap(0x02, bytes);
}

function encodeIntegerValue(n: number): Uint8Array {
  if (n === 0) return new Uint8Array([0]);
  const hex = n.toString(16);
  const padded = hex.length % 2 === 0 ? hex : '0' + hex;
  return hexToBytes(padded);
}

export function derPrintableString(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str);
  return derWrap(0x13, bytes);
}

export function derUtf8String(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str);
  return derWrap(0x0c, bytes);
}

export function derNull(): Uint8Array {
  return new Uint8Array([0x05, 0x00]);
}

export function derContextTagged(tagNum: number, content: Uint8Array): Uint8Array {
  return derWrap(0xa0 + tagNum, content);
}

function derWrap(tag: number, value: Uint8Array): Uint8Array {
  const lenBytes = encodeDerLength(value.length);
  const result = new Uint8Array(1 + lenBytes.length + value.length);
  result[0] = tag;
  result.set(lenBytes, 1);
  result.set(value, 1 + lenBytes.length);
  return result;
}

function encodeDerLength(len: number): Uint8Array {
  if (len < 128) return new Uint8Array([len]);
  const hex = len.toString(16);
  const padded = hex.length % 2 === 0 ? hex : '0' + hex;
  const lenBytes = hexToBytes(padded);
  return new Uint8Array([0x80 | lenBytes.length, ...lenBytes]);
}

/** Encode r,s bigints into DER signature bytes. */
export function encodeSignatureDER(r: bigint, s: bigint): Uint8Array {
  const rBytes = bigintToDerBytes(r);
  const sBytes = bigintToDerBytes(s);

  const rInt = derInteger(rBytes);
  const sInt = derInteger(sBytes);

  return derSequence([rInt, sInt]);
}

/** Decode DER signature bytes to r,s bigints. */
export function decodeSignatureDER(derBytes: Uint8Array): { r: bigint; s: bigint } {
  if (derBytes[0] !== 0x30) throw new Error('Invalid DER signature: not a SEQUENCE');

  let offset = 2;
  if (derBytes[1] >= 0x80) {
    const lenOctets = derBytes[1] & 0x7f;
    offset += lenOctets;
  }

  if (derBytes[offset] !== 0x02) throw new Error('Expected INTEGER for r');
  offset++;
  const rLen = derBytes[offset] >= 0x80 ? readLongLength(derBytes, offset) : derBytes[offset];
  if (derBytes[offset] >= 0x80) {
    const lenOctets = derBytes[offset] & 0x7f;
    offset += 1 + lenOctets;
  } else {
    offset++;
  }
  const rBytes = derBytes.slice(offset, offset + rLen);
  offset += rLen;

  if (derBytes[offset] !== 0x02) throw new Error('Expected INTEGER for s');
  offset++;
  const sLen = derBytes[offset] >= 0x80 ? readLongLength(derBytes, offset) : derBytes[offset];
  if (derBytes[offset] >= 0x80) {
    const lenOctets = derBytes[offset] & 0x7f;
    offset += 1 + lenOctets;
  } else {
    offset++;
  }
  const sBytes = derBytes.slice(offset, offset + sLen);

  return {
    r: derBytesToBigint(rBytes),
    s: derBytesToBigint(sBytes),
  };
}

function readLongLength(bytes: Uint8Array, offset: number): number {
  const numOctets = bytes[offset] & 0x7f;
  let len = 0;
  for (let i = 1; i <= numOctets; i++) {
    len = (len << 8) | bytes[offset + i];
  }
  return len;
}

function bigintToDerBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array([0]);
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  return hexToBytes(hex);
}

function derBytesToBigint(bytes: Uint8Array): bigint {
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex);
}

// ── CSR Builder ───────────────────────────────────────────────────────────────

export interface CsrSubject {
  commonName: string;
  organizationName: string;
  organizationalUnit: string;
  country: string;
}

export interface CsrExtensionParams {
  zatcaEnv: 'sandbox' | 'simulation' | 'production';
  serialNumber: string;
  vatNumber: string;
  invoiceType: string;
  locationAddress: string;
  businessCategory: string;
}

/** OID 1.2.840.113549.1.9.14 — pkcs-9-at-extensionRequest */
const EXTENSION_REQUEST_OID = '1.2.840.113549.1.9.14';
/** OID 1.3.6.1.4.1.311.20.2 — ZATCA code-signing custom extension */
const ZATCA_CUSTOM_OID = '1.3.6.1.4.1.311.20.2';
/** OID 2.5.29.17 — subjectAltName */
const SAN_OID = '2.5.29.17';

function encodeSubjectDN(subject: CsrSubject): Uint8Array {
  const rdns: Uint8Array[] = [];

  {
    const oid = encodeOid('2.5.4.6');
    const value = derPrintableString(subject.country);
    rdns.push(derSet([derSequence([oid, value])]));
  }

  {
    const oid = encodeOid('2.5.4.11');
    const value = derUtf8String(subject.organizationalUnit);
    rdns.push(derSet([derSequence([oid, value])]));
  }

  {
    const oid = encodeOid('2.5.4.10');
    const value = derUtf8String(subject.organizationName);
    rdns.push(derSet([derSequence([oid, value])]));
  }

  {
    const oid = encodeOid('2.5.4.3');
    const value = derPrintableString(subject.commonName);
    rdns.push(derSet([derSequence([oid, value])]));
  }

  return derSequence(rdns);
}

function encodeCustomExtension(env: string): Uint8Array {
  const label =
    env === 'sandbox'
      ? 'TESTZATCA-Code-Signing'
      : env === 'simulation'
        ? 'PREZATCA-Code-Signing'
        : 'ZATCA-Code-Signing';

  const utf8Value = derUtf8String(label);
  const extnID = encodeOid(ZATCA_CUSTOM_OID);
  const extnValue = derOctetString(utf8Value);

  return derSequence([extnID, extnValue]);
}

function encodeSanExtension(params: CsrExtensionParams): Uint8Array {
  const rdns: Uint8Array[] = [];

  rdns.push(derSet([derSequence([encodeOid('2.5.4.4'), derPrintableString(params.serialNumber)])]));
  rdns.push(
    derSet([
      derSequence([encodeOid('0.9.2342.19200300.100.1.1'), derPrintableString(params.vatNumber)]),
    ]),
  );
  rdns.push(derSet([derSequence([encodeOid('2.5.4.12'), derPrintableString(params.invoiceType)])]));
  rdns.push(
    derSet([derSequence([encodeOid('2.5.4.26'), derPrintableString(params.locationAddress)])]),
  );
  rdns.push(
    derSet([derSequence([encodeOid('2.5.4.15'), derPrintableString(params.businessCategory)])]),
  );

  const directoryName = derSequence(rdns);
  const generalName = derContextTagged(4, directoryName);
  const generalNames = derSequence([generalName]);

  const extnID = encodeOid(SAN_OID);
  const extnValue = derOctetString(generalNames);

  return derSequence([extnID, extnValue]);
}

function encodeExtensionRequest(extensions: Uint8Array[]): Uint8Array {
  const extensionsSeq = derSequence(extensions);
  const attrType = encodeOid(EXTENSION_REQUEST_OID);
  const attrValues = derSet([extensionsSeq]);
  const attribute = derSequence([attrType, attrValues]);
  return derSet([attribute]);
}

/**
 * Build a PKCS#10 CSR (CertificationRequest) DER.
 * Signed with ECDSA secp256k1 + SHA-256.
 * Includes ZATCA-required custom extension (1.3.6.1.4.1.311.20.2) and
 * Subject Alternative Name (2.5.29.17) with business metadata as DirectoryName.
 */
export function buildCSR(
  subject: CsrSubject,
  publicKeyHex: string,
  privateKeyHex: string,
  extensions?: CsrExtensionParams,
): Uint8Array {
  const pubKeyDer = exportPublicKeyDer(publicKeyHex);

  const version = derInteger(0);
  const subjectName = encodeSubjectDN(subject);

  let attributes: Uint8Array;
  if (extensions) {
    const extnList: Uint8Array[] = [encodeCustomExtension(extensions.zatcaEnv)];
    const sanExt = encodeSanExtension(extensions);
    if (sanExt.length > 0) extnList.push(sanExt);
    attributes = derContextTagged(0, encodeExtensionRequest(extnList));
  } else {
    attributes = new Uint8Array([0xa0, 0x00]);
  }

  const csrInfo = derSequence([version, subjectName, pubKeyDer, attributes]);

  const sigAlgOid = encodeOid('1.2.840.10045.4.3.2');
  const sigAlgorithm = derSequence([sigAlgOid]);

  const csrInfoSigBytes = sha256(csrInfo);
  const sig = secp256k1.sign(csrInfoSigBytes, hexToBytes(privateKeyHex));
  const derSig = encodeSignatureDER(sig.r, sig.s);

  const sigContent = new Uint8Array(derSig.length + 1);
  sigContent[0] = 0;
  sigContent.set(derSig, 1);
  const sigBitStr = derBitString(sigContent);

  return derSequence([csrInfo, sigAlgorithm, sigBitStr]);
}

// ── Key encryption at rest ────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(secret: string, salt: Buffer): Buffer {
  return pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
  authTag: string;
}

export function encryptAtRest(data: string, secret: string): EncryptedData {
  const salt = randomBytes(16);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(AES_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptAtRest(encrypted: EncryptedData, secret: string): string {
  const salt = Buffer.from(encrypted.salt, 'base64');
  const key = deriveKey(secret, salt);
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');

  const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  let totalLen = 0;
  for (const a of arrays) totalLen += a.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
