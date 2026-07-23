/**
 * ZATCA Crypto Service — ECDSA secp256k1 signing, hashing, CSR generation.
 *
 * Uses @noble/curves for secp256k1 key ops and @noble/hashes for SHA-256.
 * Uses node-forge for PKCS#10 CSR ASN.1 construction (same approach as
 * ERPGulf's Python cryptography.x509.CertificateSigningRequestBuilder).
 *
 * Key encryption at rest: AES-256-GCM via node:crypto.
 *
 * Hashing rules per ZATCA e-invoicing spec:
 *   1. Generate UBL invoice XML WITHOUT UBLExtensions/signature.
 *   2. Canonicalize: strip UBLExtensions, collapse inter-tag whitespace.
 *   3. SHA-256 over canonicalized XML bytes.
 *   4. Encode result as base64.
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, X509Certificate } from 'crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import * as forge from 'node-forge';

const { asn1 } = forge;

// ── Forge ASN.1 helpers ────────────────────────────────────────────────────────

function asn1ToBytes(node: forge.asn1.Asn1): Uint8Array {
  const buf = asn1.toDer(node);
  return new Uint8Array(Buffer.from(buf.bytes(), 'binary'));
}

function strToBinary(s: string): string {
  return Buffer.from(s, 'utf8').toString('binary');
}

function oidDer(oid: string): string {
  return (asn1.oidToDer(oid) as any).bytes() as string;
}

function intDer(n: number): string {
  return (asn1.integerToDer(n) as any).bytes() as string;
}

function padIntegerBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 0 && (bytes[0] & 0x80) !== 0) {
    const padded = new Uint8Array(bytes.length + 1);
    padded[0] = 0;
    padded.set(bytes, 1);
    return padded;
  }
  return bytes;
}

// ── Key generation ─────────────────────────────────────────────────────────────

export interface KeyPair {
  privateKeyHex: string;
  publicKeyHex: string;
  publicKeyBase64: string;
}

export function generateKeyPair(): KeyPair {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, false);

  return {
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(publicKey),
    publicKeyBase64: Buffer.from(publicKey).toString('base64'),
  };
}

/**
 * Build SubjectPublicKeyInfo ASN.1 node for secp256k1 public key.
 */
function buildSubjectPublicKeyInfo(publicKeyHex: string): forge.asn1.Asn1 {
  const pubBytes = hexToBytes(publicKeyHex);

  const algorithm = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, oidDer('1.2.840.10045.2.1')),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, oidDer('1.3.132.0.10')),
  ]);

  const spkBytes = new Uint8Array(pubBytes.length + 1);
  spkBytes[0] = 0;
  spkBytes.set(pubBytes, 1);
  const subjectPublicKey = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.BITSTRING,
    false,
    Buffer.from(spkBytes).toString('binary'),
  );

  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [algorithm, subjectPublicKey]);
}

export function exportPublicKeyDer(publicKeyHex: string): Uint8Array {
  return asn1ToBytes(buildSubjectPublicKeyInfo(publicKeyHex));
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

// ── Signing ────────────────────────────────────────────────────────────────────

export function signHashHex(hashHex: string, privateKeyHex: string): string {
  const hashBytes = hexToBytes(hashHex);
  const privBytes = hexToBytes(privateKeyHex);
  const sig = secp256k1.sign(hashBytes, privBytes);
  const derSig = encodeSignatureDER(sig.r, sig.s);
  return bytesToHex(derSig);
}

export function signHashBase64(hashHex: string, privateKeyHex: string): string {
  const derHex = signHashHex(hashHex, privateKeyHex);
  return Buffer.from(hexToBytes(derHex)).toString('base64');
}

export function verifySignature(
  hashHex: string,
  signatureDerBase64: string,
  publicKeyHex: string,
): boolean {
  const hashBytes = hexToBytes(hashHex);
  const sigDerBytes = new Uint8Array(Buffer.from(signatureDerBase64, 'base64'));
  const pubBytes = hexToBytes(publicKeyHex);

  return secp256k1.verify(sigDerBytes, hashBytes, pubBytes, { format: 'der' } as any);
}

// ── Invoice hashing ───────────────────────────────────────────────────────────

export function canonicalizeForHash(xml: string): string {
  // Strip XML prolog — the ZATCA SDK invoice.xsl outputs
  // omit-xml-declaration="yes", and c14n11 excludes the declaration.
  let canonical = xml.replace(/<\?xml[^>]*\?>\s*/, '');

  canonical = canonical.replace(/<ext:UBLExtensions(\s[^>]*)?>[\s\S]*?<\/ext:UBLExtensions>/g, '');

  canonical = canonical.replace(/<ext:UBLExtensions\/>/g, '');
  canonical = canonical.replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/g, '');
  canonical = canonical.replace(
    /<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/g,
    '',
  );
  canonical = canonical.replace(/>\s+</g, '><');
  canonical = canonical.trim();

  return canonical;
}

export function computeInvoiceHash(xml: string): string {
  const canonical = canonicalizeForHash(xml);
  const hashBytes = sha256(new TextEncoder().encode(canonical));
  const hexHash = bytesToHex(hashBytes);
  return Buffer.from(hexHash, 'utf8').toString('base64');
}

export function computeInvoiceHashHex(xml: string): string {
  const canonical = canonicalizeForHash(xml);
  const hashBytes = sha256(new TextEncoder().encode(canonical));
  return bytesToHex(hashBytes);
}

// ── X509 signature value wrapping for UBL 2.1 ──────────────────────────────────

/**
 * Pad a cert body base64 string into PEM format for X.509 parsing.
 *
 * The cert body is the raw base64 string (e.g. "MIID3j...") as stored in
 * ZATCA's binarySecurityToken (after one layer of base64 decode).
 */
function wrapCertInPem(certBodyB64: string): string {
  const lines: string[] = ['-----BEGIN CERTIFICATE-----'];
  for (let i = 0; i < certBodyB64.length; i += 64) {
    lines.push(certBodyB64.slice(i, i + 64));
  }
  lines.push('-----END CERTIFICATE-----');
  return lines.join('\n');
}

/**
 * Compute the certificate hash for XAdES QualifyingProperties.
 *
 * ERPGulf's certificate_hash():
 *   SHA-256(cert_body_string_as_utf8_bytes) → hex → base64(hex_string)
 *
 * The certBodyB64 is the base64 string that goes directly in
 * <ds:X509Certificate>, NOT the DER bytes.
 */
export function computeCertHash(certBodyB64: string): string {
  const hashBytes = sha256(new TextEncoder().encode(certBodyB64));
  const hexHash = bytesToHex(hashBytes);
  return Buffer.from(hexHash, 'utf8').toString('base64');
}

/**
 * Extract the issuer name (RFC4514 format) and serial number (decimal string)
 * from a certificate body base64 string.
 *
 * Uses Node.js built-in X509Certificate (available since Node 15.6).
 * node-forge cannot parse ECDSA certificates.
 */
export function extractCertInfo(certBodyB64: string): {
  issuerName: string;
  serialNumber: string;
} {
  const pem = wrapCertInPem(certBodyB64);
  const x509 = new X509Certificate(pem);

  // Node's issuer is multiline root-to-leaf (DC=local, DC=gov, ...).
  // ERPGulf uses RFC4514 leaf-to-root: CN=..., DC=..., DC=...
  const issuerLines = x509.issuer
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const issuerName = issuerLines.reverse().join(', ');

  // Node's serialNumber is a hex string; ERPGulf uses decimal
  const serialNumber = BigInt('0x' + x509.serialNumber).toString(10);

  return { issuerName, serialNumber };
}

/**
 * Build the standalone <xades:SignedProperties> XML string.
 *
 * This string is used BOTH for:
 *  1. Computing the signed properties hash (SHA-256 → hex → base64)
 *  2. Embedding directly inside <xades:QualifyingProperties> in the signature block
 *
 * The two MUST be byte-for-byte identical — any whitespace difference
 * will cause a hash mismatch and ZATCA rejection.
 */
export function buildSignedPropertiesXml(
  signingTime: string,
  certDigestB64: string,
  issuerName: string,
  serialNumber: string,
): string {
  return [
    '                <xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">',
    '                  <xades:SignedSignatureProperties>',
    `                    <xades:SigningTime>${signingTime}</xades:SigningTime>`,
    '                    <xades:SigningCertificate>',
    '                      <xades:Cert>',
    '                        <xades:CertDigest>',
    '                          <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `                          <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certDigestB64}</ds:DigestValue>`,
    '                        </xades:CertDigest>',
    '                        <xades:IssuerSerial>',
    `                          <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuerName}</ds:X509IssuerName>`,
    `                          <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serialNumber}</ds:X509SerialNumber>`,
    '                        </xades:IssuerSerial>',
    '                      </xades:Cert>',
    '                    </xades:SigningCertificate>',
    '                  </xades:SignedSignatureProperties>',
    '                </xades:SignedProperties>',
  ].join('\n');
}

/**
 * Compute the XAdES signed properties hash.
 *
 * ERPGulf's generate_signed_properties_hash():
 *   SHA-256(signedProperties_xml_string_utf8_bytes) → hex → base64(hex_string)
 */
export function computeSignedPropertiesHash(signedPropertiesXml: string): string {
  const hashBytes = sha256(new TextEncoder().encode(signedPropertiesXml));
  const hexHash = bytesToHex(hashBytes);
  return Buffer.from(hexHash, 'utf8').toString('base64');
}

/**
 * Build the full UBL signature block matching ZATCA's expected structure.
 *
 * This includes:
 *  - UBLExtensions wrapper
 *  - ds:Signature with ECDSA signature, certificate, and key info
 *  - Two ds:Reference elements: invoiceSignedData + xadesSignedProperties
 *  - Four ds:Transform elements (3 XPath + 1 c14n11)
 *  - Full XAdES QualifyingProperties block in ds:Object
 */
function buildUBLSignatureBlock(
  invoiceHashB64: string,
  signatureB64: string,
  certificateB64: string,
  signedPropertiesHashB64: string,
  signedPropertiesXml: string,
): string {
  return [
    '  <ext:UBLExtensions>',
    '    <ext:UBLExtension>',
    '      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>',
    '      <ext:ExtensionContent>',
    '        <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"',
    '          xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"',
    '          xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2"',
    '          xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    '          <sac:SignatureInformation>',
    '            <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>',
    '            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>',
    '            <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">',
    '              <ds:SignedInfo>',
    '                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>',
    '                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>',
    '                <ds:Reference Id="invoiceSignedData" URI="">',
    '                  <ds:Transforms>',
    '                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
    '                      <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>',
    '                    </ds:Transform>',
    '                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
    '                      <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>',
    '                    </ds:Transform>',
    '                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
    '                      <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID=\'QR\'])</ds:XPath>',
    '                    </ds:Transform>',
    '                    <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>',
    '                  </ds:Transforms>',
    '                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `                  <ds:DigestValue>${invoiceHashB64}</ds:DigestValue>`,
    '                </ds:Reference>',
    '                <ds:Reference URI="#xadesSignedProperties" Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties">',
    '                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `                  <ds:DigestValue>${signedPropertiesHashB64}</ds:DigestValue>`,
    '                </ds:Reference>',
    '              </ds:SignedInfo>',
    `              <ds:SignatureValue>${signatureB64}</ds:SignatureValue>`,
    '              <ds:KeyInfo>',
    '                <ds:X509Data>',
    `                  <ds:X509Certificate>${certificateB64}</ds:X509Certificate>`,
    '                </ds:X509Data>',
    '              </ds:KeyInfo>',
    '              <ds:Object>',
    '                <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">',
    signedPropertiesXml,
    '                </xades:QualifyingProperties>',
    '              </ds:Object>',
    '            </ds:Signature>',
    '          </sac:SignatureInformation>',
    '        </sig:UBLDocumentSignatures>',
    '      </ext:ExtensionContent>',
    '    </ext:UBLExtension>',
    '  </ext:UBLExtensions>',
  ].join('\n');
}

/**
 * Embed the UBL signature block and XAdES QualifyingProperties into an
 * unsigned UBL invoice XML.
 *
 * Fixes two critical bugs from the original implementation:
 *   1. Skips the XML prolog (<?xml ...?>) so the signature block is inserted
 *      INSIDE <Invoice>, not before it.
 *   2. Includes the full XAdES QualifyingProperties block with SigningTime,
 *      SigningCertificate, IssuerSerial, and the second ds:Reference for
 *      xadesSignedProperties.
 *
 * @param unsignedXml  The unsigned UBL XML string (with <?xml ...?> prolog).
 * @param invoiceHashB64  Base64-encoded SHA-256 hash of the canonicalized invoice.
 * @param signatureB64  Base64-encoded ECDSA signature (DER format).
 * @param certificateB64  The cert body base64 string (MIID3j...), decoded from
 *                         ZATCA's binarySecurityToken. Goes directly in
 *                         <ds:X509Certificate>.
 */
export function embedSignatureIntoXML(
  unsignedXml: string,
  invoiceHashB64: string,
  signatureB64: string,
  certificateB64: string,
): string {
  // Bug fix: skip XML prolog (<?xml ...?>) and find root element's opening tag
  const prologEnd = unsignedXml.indexOf('?>');
  const afterProlog = prologEnd !== -1 ? prologEnd + 2 : 0;
  const rootOpenEnd = unsignedXml.indexOf('>', afterProlog);
  if (rootOpenEnd === -1) {
    throw new Error('Invalid XML: no root element opening found');
  }

  const prolog = unsignedXml.slice(0, rootOpenEnd + 1);
  const rest = unsignedXml.slice(rootOpenEnd + 1);

  // Compute XAdES values from the certificate
  const signingTime = new Date().toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS (UTC)
  const certDigestB64 = computeCertHash(certificateB64);
  const { issuerName, serialNumber } = extractCertInfo(certificateB64);

  // Build the xadesSignedProperties XML (same string used for hashing AND embedding)
  const signedPropertiesXml = buildSignedPropertiesXml(
    signingTime,
    certDigestB64,
    issuerName,
    serialNumber,
  );
  const signedPropertiesHashB64 = computeSignedPropertiesHash(signedPropertiesXml);

  const signatureBlock = buildUBLSignatureBlock(
    invoiceHashB64,
    signatureB64,
    certificateB64,
    signedPropertiesHashB64,
    signedPropertiesXml,
  );
  return prolog + '\n' + signatureBlock + rest;
}

// ── DER signature encoding/decoding ────────────────────────────────────────────

export function encodeSignatureDER(r: bigint, s: bigint): Uint8Array {
  const rBytesRaw = bigintToDerBytes(r);
  const sBytesRaw = bigintToDerBytes(s);

  const rBytes = padIntegerBytes(rBytesRaw);
  const sBytes = padIntegerBytes(sBytesRaw);

  const rInt = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.INTEGER,
    false,
    Buffer.from(rBytes).toString('binary'),
  );
  const sInt = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.INTEGER,
    false,
    Buffer.from(sBytes).toString('binary'),
  );

  const seq = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [rInt, sInt]);
  return asn1ToBytes(seq);
}

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

const EXTENSION_REQUEST_OID = '1.2.840.113549.1.9.14';
const ZATCA_CUSTOM_OID = '1.3.6.1.4.1.311.20.2';
const SAN_OID = '2.5.29.17';

function makeAttrTypeAndValue(oid: string, valNode: forge.asn1.Asn1): forge.asn1.Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, oidDer(oid)),
    valNode,
  ]);
}

function makeRDN(setChildren: forge.asn1.Asn1[]): forge.asn1.Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, setChildren);
}

function encodeSubjectDN(subject: CsrSubject): forge.asn1.Asn1 {
  const rdns: forge.asn1.Asn1[] = [];

  rdns.push(
    makeRDN([
      makeAttrTypeAndValue(
        '2.5.4.6',
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.PRINTABLESTRING,
          false,
          strToBinary(subject.country),
        ),
      ),
    ]),
  );

  rdns.push(
    makeRDN([
      makeAttrTypeAndValue(
        '2.5.4.11',
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.UTF8,
          false,
          strToBinary(subject.organizationalUnit),
        ),
      ),
    ]),
  );

  rdns.push(
    makeRDN([
      makeAttrTypeAndValue(
        '2.5.4.10',
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.UTF8,
          false,
          strToBinary(subject.organizationName),
        ),
      ),
    ]),
  );

  rdns.push(
    makeRDN([
      makeAttrTypeAndValue(
        '2.5.4.3',
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.PRINTABLESTRING,
          false,
          strToBinary(subject.commonName),
        ),
      ),
    ]),
  );

  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, rdns);
}

function encodeCustomExtension(env: string): forge.asn1.Asn1 {
  const label =
    env === 'sandbox'
      ? 'TESTZATCA-Code-Signing'
      : env === 'simulation'
        ? 'PREZATCA-Code-Signing'
        : 'ZATCA-Code-Signing';

  const utf8Value = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTF8, false, strToBinary(label));
  const extnValue = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.OCTETSTRING,
    false,
    asn1.toDer(utf8Value).bytes(),
  );

  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, oidDer(ZATCA_CUSTOM_OID)),
    extnValue,
  ]);
}

function encodeSanExtension(params: CsrExtensionParams): forge.asn1.Asn1 {
  const rdns: forge.asn1.Asn1[] = [];

  rdns.push(
    makeRDN([
      makeAttrTypeAndValue(
        '2.5.4.4',
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.PRINTABLESTRING,
          false,
          strToBinary(params.serialNumber),
        ),
      ),
    ]),
  );
  rdns.push(
    makeRDN([
      makeAttrTypeAndValue(
        '0.9.2342.19200300.100.1.1',
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.PRINTABLESTRING,
          false,
          strToBinary(params.vatNumber),
        ),
      ),
    ]),
  );
  rdns.push(
    makeRDN([
      makeAttrTypeAndValue(
        '2.5.4.12',
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.PRINTABLESTRING,
          false,
          strToBinary(params.invoiceType),
        ),
      ),
    ]),
  );
  rdns.push(
    makeRDN([
      makeAttrTypeAndValue(
        '2.5.4.26',
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.PRINTABLESTRING,
          false,
          strToBinary(params.locationAddress),
        ),
      ),
    ]),
  );
  rdns.push(
    makeRDN([
      makeAttrTypeAndValue(
        '2.5.4.15',
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.PRINTABLESTRING,
          false,
          strToBinary(params.businessCategory),
        ),
      ),
    ]),
  );

  const directoryName = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, rdns);
  const generalName = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [directoryName]);
  const generalNames = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [generalName]);

  const extnValue = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.OCTETSTRING,
    false,
    asn1.toDer(generalNames).bytes(),
  );

  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, oidDer(SAN_OID)),
    extnValue,
  ]);
}

function encodeExtensionRequest(extensions: forge.asn1.Asn1[]): forge.asn1.Asn1 {
  const extensionsSeq = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, extensions);
  const attrType = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.OID,
    false,
    oidDer(EXTENSION_REQUEST_OID),
  );
  const attrValues = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [extensionsSeq]);
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [attrType, attrValues]);
}

/**
 * Build a PKCS#10 CSR (CertificationRequest) DER.
 *
 * Uses node-forge for ASN.1 construction (X.509 Distinguished Name, extensions,
 * SubjectPublicKeyInfo) — matching the library-based approach of Python's
 * cryptography.x509.CertificateSigningRequestBuilder.
 *
 * Signing is done with @noble/curves ECDSA secp256k1 + SHA-256 since node-forge
 * does not natively support secp256k1.
 */
export function buildCSR(
  subject: CsrSubject,
  publicKeyHex: string,
  privateKeyHex: string,
  extensions?: CsrExtensionParams,
): Uint8Array {
  const pubKeyNode = buildSubjectPublicKeyInfo(publicKeyHex);

  const version = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, intDer(0));
  const subjectName = encodeSubjectDN(subject);

  let attributes: forge.asn1.Asn1;
  if (extensions) {
    const extnList: forge.asn1.Asn1[] = [
      encodeCustomExtension(extensions.zatcaEnv),
      encodeSanExtension(extensions),
    ];
    attributes = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      encodeExtensionRequest(extnList),
    ]);
  } else {
    attributes = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, []);
  }

  const csrInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    version,
    subjectName,
    pubKeyNode,
    attributes,
  ]);

  const sigAlgOid = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.OID,
    false,
    oidDer('1.2.840.10045.4.3.2'),
  );
  const sigAlgorithm = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [sigAlgOid]);

  const csrInfoDer = asn1ToBytes(csrInfo);
  const csrInfoHash = sha256(csrInfoDer);
  const sig = secp256k1.sign(csrInfoHash, hexToBytes(privateKeyHex));
  const derSig = encodeSignatureDER(sig.r, sig.s);

  const sigContent = new Uint8Array(derSig.length + 1);
  sigContent[0] = 0;
  sigContent.set(derSig, 1);
  const sigBitStr = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.BITSTRING,
    false,
    Buffer.from(sigContent).toString('binary'),
  );

  return asn1ToBytes(
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [csrInfo, sigAlgorithm, sigBitStr]),
  );
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

// ── QR Injection ────────────────────────────────────────────────────────────

/**
 * Inject the QR TLV base64 string into the signed XML's QR
 * AdditionalDocumentReference placeholder.
 *
 * The XML builder creates an empty QR placeholder:
 *   <cac:AdditionalDocumentReference>
 *     <cbc:ID>QR</cbc:ID>
 *     <cac:Attachment>
 *       <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain"></cbc:EmbeddedDocumentBinaryObject>
 *     </cac:Attachment>
 *   </cac:AdditionalDocumentReference>
 *
 * This function replaces the empty EmbeddedDocumentBinaryObject text content
 * with the actual QR TLV base64 string.
 */
export function injectQrIntoXml(signedXml: string, qrTlvBase64: string): string {
  return signedXml.replace(
    /(<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>\s*<cac:Attachment>\s*<cbc:EmbeddedDocumentBinaryObject mimeCode="text\/plain">)\s*(<\/cbc:EmbeddedDocumentBinaryObject>)/,
    `$1${qrTlvBase64}$2`,
  );
}

// ── Certificate Signature Extraction ───────────────────────────────────────

/**
 * Extract the raw ECDSA signature bytes from a ZATCA-issued X.509 certificate.
 *
 * ERPGulf's tag9_signature_ecdsa() reads `cert.signature` from the parsed
 * x509 certificate and returns the raw bytes. This gives us tag 9 of the
 * QR TLV — the ZATCA CA's ECDSA signature over the certificate.
 *
 * Node.js X509Certificate does not expose raw signature bytes directly,
 * so we parse the DER-encoded certificate and extract the signature value
 * from the outer SEQUENCE: { tbsCertificate, signatureAlgorithm, signatureValue }.
 *
 * @param certBodyB64  The cert body base64 string (e.g. "MIID3j...") as
 *                     embedded in <ds:X509Certificate> — NOT the outer
 *                     binarySecurityToken wrapper.
 * @returns Base64-encoded raw ECDSA signature bytes.
 */
export function extractCertSignature(certBodyB64: string): string {
  const pem = wrapCertInPem(certBodyB64);
  const x509 = new X509Certificate(pem);

  // x509.raw is the raw DER bytes of the entire certificate.
  // The outer structure is: SEQUENCE { TBSCertificate, AlgorithmIdentifier, BIT STRING (signature) }
  const rawDer = x509.raw;

  // Parse DER manually: SEQUENCE tag = 0x30
  if (rawDer[0] !== 0x30) {
    throw new Error('Expected SEQUENCE at start of certificate DER');
  }

  let offset = 1;
  const totalLen = rawDer[offset] < 0x80 ? rawDer[offset] : readDerLength(rawDer, offset);
  if (rawDer[offset] < 0x80) {
    offset += 1;
  } else {
    offset += 1 + (rawDer[offset] & 0x7f);
  }

  // Skip TBSCertificate (SEQUENCE)
  if (rawDer[offset] !== 0x30) throw new Error('Expected SEQUENCE for TBSCertificate');
  offset += 1;
  const tbsLen = rawDer[offset] < 0x80 ? rawDer[offset] : readDerLength(rawDer, offset);
  if (rawDer[offset] < 0x80) {
    offset += 1 + tbsLen;
  } else {
    offset += 1 + (rawDer[offset] & 0x7f) + tbsLen;
  }

  // Skip AlgorithmIdentifier (SEQUENCE)
  if (rawDer[offset] !== 0x30) throw new Error('Expected SEQUENCE for AlgorithmIdentifier');
  offset += 1;
  const algLen = rawDer[offset] < 0x80 ? rawDer[offset] : readDerLength(rawDer, offset);
  if (rawDer[offset] < 0x80) {
    offset += 1 + algLen;
  } else {
    offset += 1 + (rawDer[offset] & 0x7f) + algLen;
  }

  // Signature value is a BIT STRING (tag 0x03)
  if (rawDer[offset] !== 0x03) throw new Error(`Expected BIT STRING for signature, got 0x${rawDer[offset].toString(16)}`);
  offset += 1;
  const sigLen = rawDer[offset] < 0x80 ? rawDer[offset] : readDerLength(rawDer, offset);
  if (rawDer[offset] < 0x80) {
    offset += 1;
  } else {
    offset += 1 + (rawDer[offset] & 0x7f);
  }

  // BIT STRING has a leading byte indicating unused bits (should be 0x00)
  const unusedBits = rawDer[offset];
  offset += 1;

  // The actual signature bytes are the remaining bytes minus the unused-bits byte
  const sigBytes = rawDer.slice(offset, offset + sigLen - 1);
  return Buffer.from(sigBytes).toString('base64');
}

function readDerLength(buf: Buffer, offset: number): number {
  const numOctets = buf[offset] & 0x7f;
  let len = 0;
  for (let i = 1; i <= numOctets; i++) {
    len = (len << 8) | buf[offset + i];
  }
  return len;
}
