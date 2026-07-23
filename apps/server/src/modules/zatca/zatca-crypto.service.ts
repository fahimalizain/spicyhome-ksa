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
//
// ZATCA's invoice hash flow (matching ERPGulf's working implementation):
//
//   1. Take the UNSIGNED UBL XML (with UBLExtensions placeholder, cac:Signature
//      placeholder, and empty QR AdditionalDocumentReference).
//   2. Strip: XML prolog, <ext:UBLExtensions>, <cac:Signature>, and the QR
//      <cac:AdditionalDocumentReference>.
//   3. SHA-256 the remaining XML string (UTF-8 bytes) — NO whitespace collapse,
//      NO C14N canonicalization. ZATCA does the same regex-style stripping on
//      the server side. Collapsing whitespace with `>\s+<` → `><` BREAKS the
//      hash because ZATCA preserves inter-tag whitespace text nodes.
//   4. Encode as base64 of the RAW 32-byte SHA-256 output (NOT base64 of the
//      hex string — that's the signed-properties/cert-hash pattern, which is
//      different!).
//
//   This hash goes into <ds:DigestValue> for the invoiceSignedData Reference,
//   AND is sent as `invoiceHash` in the compliance/reporting API JSON body.
//   Both must be the same value.

/**
 * Strip elements that ZATCA excludes from invoice hashing, then return the
 * remaining XML string. Does NOT collapse whitespace or canonicalize —
 * ZATCA's server-side transform produces the same output by stripping the
 * same elements and hashing the raw text.
 *
 * Strips:
 *   - <?xml ...?> prolog
 *   - <ext:UBLExtensions>...</ext:UBLExtensions> (contains the signature)
 *   - <cac:Signature>...</cac:Signature> (UBL signature placeholder)
 *   - <cac:AdditionalDocumentReference> for QR (contains the QR code)
 *
 * IMPORTANT: Do NOT add `>\s+<` → `><` whitespace collapse here. We tried
 * that and it caused `invalid-invoice-hash` errors because ZATCA preserves
 * whitespace text nodes between elements after stripping.
 *
 * IMPORTANT: Do NOT strip `xmlns:ext` from the root <Invoice> element.
 * We tried that too and it broke the hash. ZATCA's transform keeps the
 * root element's namespace declarations as-is.
 */
export function canonicalizeForHash(xml: string): string {
  // Strip XML prolog — the ZATCA SDK invoice.xsl outputs
  // omit-xml-declaration="yes", and c14n11 excludes the declaration.
  let canonical = xml.replace(/<\?xml[^>]*\?>\s*/, '');

  // Strip UBLExtensions (contains the XAdES signature block)
  canonical = canonical.replace(
    /<ext:UBLExtensions(\s[^>]*)?>[\s\S]*?<\/ext:UBLExtensions>/g,
    '',
  );

  // Also strip self-closing UBLExtensions (the placeholder in unsigned XML)
  canonical = canonical.replace(/<ext:UBLExtensions\/>/g, '');

  // Strip cac:Signature (the UBL-level signature placeholder, not the
  // XAdES ds:Signature inside UBLExtensions)
  canonical = canonical.replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/g, '');

  // Strip the QR AdditionalDocumentReference (identified by cbc:ID = "QR")
  canonical = canonical.replace(
    /<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/g,
    '',
  );

  return canonical;
}

/**
 * Compute the invoice hash: SHA-256 of the canonicalized XML, encoded as
 * base64 of the RAW 32-byte hash output.
 *
 * CRITICAL: This uses `base64(raw_bytes)` — NOT `base64(hex_string)`.
 * The signed-properties hash and cert hash use `base64(hex_string)`, but
 * the invoice hash uses `base64(raw_bytes)`. This matches ERPGulf's
 * `getinvoicehash()` which does `base64.b64encode(bytes.fromhex(hex_digest))`.
 *
 * @returns 44-character base64 string (e.g. "EK8uDENCtGeD/gyIMKNgETCxzYJd7tfPk2a6C7Y10+A=")
 */
export function computeInvoiceHash(xml: string): string {
  const canonical = canonicalizeForHash(xml);
  const hashBytes = sha256(new TextEncoder().encode(canonical));
  // base64 of raw 32-byte SHA-256 output (NOT base64 of hex string)
  return Buffer.from(hashBytes).toString('base64');
}

/**
 * Compute the invoice hash as a hex string (used for ECDSA signing).
 * @returns 64-character lowercase hex string
 */
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
 * CRITICAL: This uses `base64(hex_string)` — NOT `base64(raw_bytes)`.
 * The invoice hash uses `base64(raw_bytes)`, but the cert hash and
 * signed-properties hash use `base64(hex_string)`. This matches ERPGulf's
 * `certificate_hash()` which does:
 *   SHA-256(cert_body_string_as_utf8_bytes) → hexdigest → base64(hex_string)
 *
 * The certBodyB64 is the base64 string that goes directly in
 * <ds:X509Certificate> — NOT the DER bytes, NOT the PEM. It's the raw
 * base64 body (e.g. "MIICQjCCAeig...") as decoded from ZATCA's
 * binarySecurityToken (which is double-base64-encoded: we decode one
 * layer with `Buffer.from(cert, 'base64').toString('utf-8')` before
 * passing it here).
 *
 * @returns 88-character base64 string (base64 of a 64-char hex string)
 */
export function computeCertHash(certBodyB64: string): string {
  const hashBytes = sha256(new TextEncoder().encode(certBodyB64));
  const hexHash = bytesToHex(hashBytes);
  // base64 of the hex string (ERPGulf pattern), NOT base64 of raw bytes
  return Buffer.from(hexHash, 'utf8').toString('base64');
}

/**
 * Extract the issuer name (RFC4514 format) and serial number (decimal string)
 * from a certificate body base64 string.
 *
 * Uses Node.js built-in X509Certificate (available since Node 15.6).
 * node-forge cannot parse ECDSA certificates.
 *
 * IMPORTANT: Node's X509Certificate.issuer returns RDNs in root-to-leaf
 * order (e.g. "DC=local\nDC=gov\nCN=eInvoicing"). ZATCA/ERPGulf expects
 * RFC4514 leaf-to-root order (e.g. "CN=eInvoicing, DC=gov, DC=local").
 * We reverse the lines and join with ", ".
 *
 * IMPORTANT: Node's X509Certificate.serialNumber returns a hex string.
 * ZATCA/ERPGulf expects the serial as a DECIMAL string. We convert
 * hex → BigInt → decimal string.
 */
export function extractCertInfo(certBodyB64: string): {
  issuerName: string;
  serialNumber: string;
} {
  const pem = wrapCertInPem(certBodyB64);
  const x509 = new X509Certificate(pem);

  // Node's issuer is multiline root-to-leaf (DC=local, DC=gov, ...).
  // ZATCA/ERPGulf expects RFC4514 leaf-to-root: CN=..., DC=..., DC=...
  // So we split by newlines, reverse, and join with ", "
  const issuerLines = x509.issuer
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const issuerName = issuerLines.reverse().join(', ');

  // Node's serialNumber is a hex string (e.g. "01A2B3...");
  // ZATCA/ERPGulf expects decimal (e.g. "1784799443055")
  const serialNumber = BigInt('0x' + x509.serialNumber).toString(10);

  return { issuerName, serialNumber };
}

/**
 * Build the STANDALONE <xades:SignedProperties> XML string used ONLY for
 * computing the signed properties hash (SHA-256 → hex → base64(hex)).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THIS IS THE #1 FINNICKY PART OF THE ENTIRE ZATCA IMPLEMENTATION.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ZATCA validates the signed-properties hash by:
 *   1. Extracting the <xades:SignedProperties> text from the submitted XML
 *   2. Adding namespace declarations that were inherited from ancestors:
 *      - xmlns:xades (from xades:QualifyingProperties parent)
 *      - xmlns:ds   (from ds:Signature ancestor)
 *   3. SHA-256 hashing the resulting standalone string
 *
 * The standalone string we hash MUST match what ZATCA produces after step 2.
 * Through extensive testing against ERPGulf's working Python implementation
 * and ZATCA's sandbox API, we determined:
 *
 *   - xmlns:xades goes on the ROOT <xades:SignedProperties> element
 *   - xmlns:ds goes on EACH INDIVIDUAL ds: child element (DigestMethod,
 *     DigestValue, X509IssuerName, X509SerialNumber) — NOT on the root
 *   - The WHITESPACE (indentation) in the standalone string MUST EXACTLY
 *     match the whitespace in the EMBEDDED XML (from buildEmbeddedSignedPropertiesXml)
 *
 * If the whitespace differs by even a single space, the hash will not match
 * and ZATCA returns `signed-properties-hashing` error.
 *
 * The standalone string starts at column 0 (no leading spaces on the root
 * element) and uses the SAME relative indentation as the embedded version.
 *
 * Reference: ERPGulf's `generate_signed_properties_hash()` in
 * sign_invoice_first.py line 786.
 */
export function buildSignedPropertiesXml(
  signingTime: string,
  certDigestB64: string,
  issuerName: string,
  serialNumber: string,
): string {
  // NOTE: The whitespace here MUST match buildEmbeddedSignedPropertiesXml
  // exactly (minus the 18-space root offset). Do NOT change indentation!
  return [
    '<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">',
    '                    <xades:SignedSignatureProperties>',
    `                      <xades:SigningTime>${signingTime}</xades:SigningTime>`,
    '                      <xades:SigningCertificate>',
    '                        <xades:Cert>',
    '                          <xades:CertDigest>',
    '                            <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `                            <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certDigestB64}</ds:DigestValue>`,
    '                          </xades:CertDigest>',
    '                          <xades:IssuerSerial>',
    `                            <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuerName}</ds:X509IssuerName>`,
    `                            <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serialNumber}</ds:X509SerialNumber>`,
    '                          </xades:IssuerSerial>',
    '                        </xades:Cert>',
    '                      </xades:SigningCertificate>',
    '                    </xades:SignedSignatureProperties>',
    '                  </xades:SignedProperties>',
  ].join('\n');
}

/**
 * Build the EMBEDDED <xades:SignedProperties> XML fragment for insertion
 * inside <xades:QualifyingProperties> in the full signed XML.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THIS MUST NOT HAVE REDUNDANT NAMESPACE DECLARATIONS.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * In the embedded context:
 *   - xmlns:xades is inherited from the parent <xades:QualifyingProperties>
 *   - xmlns:ds is inherited from the ancestor <ds:Signature>
 *
 * If we include xmlns:ds on each ds: element here (like the standalone
 * version), ZATCA's XML parser sees them as redundant namespace declarations
 * and the extracted SignedProperties text won't match our standalone hash
 * string. This causes `signed-properties-hashing` errors.
 *
 * The indentation here (18-space root, 20/22/24/26/28-space children) must
 * match the standalone version's indentation (0-space root, same relative
 * offsets). This is because ZATCA extracts the text node whitespace along
 * with the element — if the whitespace differs, the hash differs.
 *
 * Compare with ERPGulf's sample XML at:
 * /private/tmp/zatca_erpgulf/zatca_erpgulf/simplifeid invoice.xml
 */
function buildEmbeddedSignedPropertiesXml(
  signingTime: string,
  certDigestB64: string,
  issuerName: string,
  serialNumber: string,
): string {
  // NOTE: No xmlns:xades on root (inherited from QualifyingProperties)
  // NOTE: No xmlns:ds on ds: elements (inherited from ds:Signature)
  // NOTE: Indentation matches buildSignedPropertiesXml (offset by 18 spaces)
  return [
    '                  <xades:SignedProperties Id="xadesSignedProperties">',
    '                    <xades:SignedSignatureProperties>',
    `                      <xades:SigningTime>${signingTime}</xades:SigningTime>`,
    '                      <xades:SigningCertificate>',
    '                        <xades:Cert>',
    '                          <xades:CertDigest>',
    '                            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `                            <ds:DigestValue>${certDigestB64}</ds:DigestValue>`,
    '                          </xades:CertDigest>',
    '                          <xades:IssuerSerial>',
    `                            <ds:X509IssuerName>${issuerName}</ds:X509IssuerName>`,
    `                            <ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>`,
    '                          </xades:IssuerSerial>',
    '                        </xades:Cert>',
    '                      </xades:SigningCertificate>',
    '                    </xades:SignedSignatureProperties>',
    '                  </xades:SignedProperties>',
  ].join('\n');
}

/**
 * Compute the XAdES signed properties hash.
 *
 * CRITICAL: This uses `base64(hex_string)` — NOT `base64(raw_bytes)`.
 * The invoice hash uses `base64(raw_bytes)`, but the signed-properties hash
 * and cert hash use `base64(hex_string)`. This matches ERPGulf's
 * `generate_signed_properties_hash()` which does:
 *   SHA-256(xml_string_utf8_bytes) → hexdigest → base64(hex_string)
 *
 * @returns 88-character base64 string (base64 of a 64-char hex string)
 */
export function computeSignedPropertiesHash(signedPropertiesXml: string): string {
  const hashBytes = sha256(new TextEncoder().encode(signedPropertiesXml));
  const hexHash = bytesToHex(hashBytes);
  // base64 of the hex string (ERPGulf pattern), NOT base64 of raw bytes
  return Buffer.from(hexHash, 'utf8').toString('base64');
}

/**
 * Build the full UBL signature block matching ZATCA's expected structure.
 *
 * This produces the <ext:UBLExtensions> element that gets inserted into the
 * invoice XML. It contains:
 *   - UBLExtension → ExtensionURI → ExtensionContent
 *   - sig:UBLDocumentSignatures with sac:SignatureInformation
 *   - ds:Signature with:
 *     - ds:SignedInfo (CanonicalizationMethod, SignatureMethod, 2 References)
 *     - ds:Reference #1: invoiceSignedData (3 XPath transforms + c14n11)
 *     - ds:Reference #2: xadesSignedProperties (no transforms, just hash)
 *     - ds:SignatureValue (ECDSA-SECP256K1-SHA256 DER signature)
 *     - ds:KeyInfo → ds:X509Data → ds:X509Certificate
 *     - ds:Object → xades:QualifyingProperties → [embedded SignedProperties]
 *
 * The 3 XPath transforms in the invoiceSignedData Reference tell ZATCA to
 * strip UBLExtensions, cac:Signature, and QR AdditionalDocumentReference
 * before hashing — matching what our canonicalizeForHash() does.
 *
 * @param invoiceHashB64       — base64(raw_bytes) of SHA-256(canonicalized XML)
 * @param signatureB64         — base64 DER ECDSA signature of the invoice hash
 * @param certificateB64       — cert body base64 (goes in <ds:X509Certificate>)
 * @param signedPropertiesHashB64 — base64(hex_string) of SHA-256(standalone SP XML)
 * @param signedPropertiesXml  — EMBEDDED SignedProperties (no redundant ns declarations)
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
 * The unsigned XML must contain an empty placeholder:
 *   <ext:UBLExtensions></ext:UBLExtensions>
 * This function replaces that placeholder with the full signature block.
 *
 * The signature block is built with TWO versions of the SignedProperties:
 *   1. STANDALONE (buildSignedPropertiesXml) — has explicit xmlns:ds on
 *      each ds: element and xmlns:xades on root. Used for computing the
 *      signed-properties hash via computeSignedPropertiesHash().
 *   2. EMBEDDED (buildEmbeddedSignedPropertiesXml) — NO redundant namespace
 *      declarations (inherited from ancestors). Used in the actual XML.
 *
 * Both versions MUST have identical whitespace/indentation (offset by the
 * root element's leading spaces). If they differ, ZATCA's hash won't match.
 *
 * SigningTime uses UTC (toISOString) — this matches ERPGulf which uses
 * datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S").
 *
 * @param unsignedXml     — unsigned UBL XML with <ext:UBLExtensions></ext:UBLExtensions> placeholder
 * @param invoiceHashB64  — base64(raw_bytes) SHA-256 hash of canonicalized invoice
 * @param signatureB64    — base64 DER ECDSA signature
 * @param certificateB64  — cert body base64 (decoded from ZATCA's double-base64 binarySecurityToken)
 */
export function embedSignatureIntoXML(
  unsignedXml: string,
  invoiceHashB64: string,
  signatureB64: string,
  certificateB64: string,
): string {
  // SigningTime in UTC (matches ERPGulf's datetime.utcnow())
  const signingTime = new Date().toISOString().slice(0, 19);
  const certDigestB64 = computeCertHash(certificateB64);
  const { issuerName, serialNumber } = extractCertInfo(certificateB64);

  // Build STANDALONE SignedProperties (with explicit ns declarations) for hashing
  const standaloneSP = buildSignedPropertiesXml(
    signingTime,
    certDigestB64,
    issuerName,
    serialNumber,
  );
  const signedPropertiesHashB64 = computeSignedPropertiesHash(standaloneSP);

  // Build EMBEDDED SignedProperties (without redundant ns) for the XML
  const embeddedSP = buildEmbeddedSignedPropertiesXml(
    signingTime,
    certDigestB64,
    issuerName,
    serialNumber,
  );

  const signatureBlock = buildUBLSignatureBlock(
    invoiceHashB64,
    signatureB64,
    certificateB64,
    signedPropertiesHashB64,
    embeddedSP,
  );

  // Replace the empty UBLExtensions placeholder with the full signature block
  return unsignedXml.replace(
    /  <ext:UBLExtensions><\/ext:UBLExtensions>/,
    signatureBlock,
  );
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
 *
 * IMPORTANT: The QR is injected AFTER signing. The invoice hash is computed
 * on the XML WITHOUT the QR (the QR AdditionalDocumentReference is stripped
 * by canonicalizeForHash). So injecting the QR after signing doesn't
 * invalidate the signature.
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
