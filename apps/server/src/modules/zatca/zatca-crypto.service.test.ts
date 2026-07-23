import {
  generateKeyPair,
  signHashHex,
  signHashBase64,
  verifySignature,
  computeInvoiceHash,
  computeInvoiceHashHex,
  canonicalizeForHash,
  embedSignatureIntoXML,
  buildCSR,
  toPem,
  getPublicKeyPem,
  encodeSignatureDER,
  decodeSignatureDER,
  encryptAtRest,
  decryptAtRest,
  hexToBytes,
  exportPublicKeyDer,
  computeCertHash,
  extractCertInfo,
  buildSignedPropertiesXml,
  computeSignedPropertiesHash,
} from './zatca-crypto.service';

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { createHash } from 'crypto';
import * as forge from 'node-forge';

const { asn1 } = forge;

function oidDerStr(oid: string): string {
  return (asn1.oidToDer(oid) as any).bytes() as string;
}

function getAsn1Children(node: forge.asn1.Asn1): forge.asn1.Asn1[] {
  return node.value as forge.asn1.Asn1[];
}

function getAsn1Value(node: forge.asn1.Asn1): string {
  return node.value as string;
}

// ── Key Generation ────────────────────────────────────────────────────────────

describe('Key Generation', () => {
  it('generates a valid keypair', () => {
    const kp = generateKeyPair();
    expect(kp.privateKeyHex).toBeTruthy();
    expect(kp.privateKeyHex.length).toBe(64);
    expect(kp.publicKeyHex.length).toBe(130);
    expect(kp.publicKeyHex.slice(0, 2)).toBe('04');
    expect(kp.publicKeyBase64).toBeTruthy();
  });

  it('generates unique keypairs each time', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(kp1.privateKeyHex).not.toBe(kp2.privateKeyHex);
    expect(kp1.publicKeyHex).not.toBe(kp2.publicKeyHex);
  });

  it('produces public key in PEM format', () => {
    const kp = generateKeyPair();
    const pem = getPublicKeyPem(kp.publicKeyHex);
    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(pem).toContain('-----END PUBLIC KEY-----');
  });
});

// ── Signing / Verification Round-Trip ─────────────────────────────────────────

describe('ECDSA Signing and Verification', () => {
  let privateKeyHex: string;
  let publicKeyHex: string;

  beforeAll(() => {
    const kp = generateKeyPair();
    privateKeyHex = kp.privateKeyHex;
    publicKeyHex = kp.publicKeyHex;
  });

  it('signs a hash and verifies successfully (hex round-trip)', () => {
    const msgBytes = new TextEncoder().encode('hello ZATCA');
    const hashHex = bytesToHex(sha256(msgBytes));

    const derSigHex = signHashHex(hashHex, privateKeyHex);
    expect(derSigHex).toBeTruthy();
    expect(derSigHex.length).toBeGreaterThan(0);

    const derSigBase64 = Buffer.from(hexToBytes(derSigHex)).toString('base64');

    const valid = verifySignature(hashHex, derSigBase64, publicKeyHex);
    expect(valid).toBe(true);
  });

  it('verify returns false for wrong message', () => {
    const msgBytes = new TextEncoder().encode('good message');
    const hashHex = bytesToHex(sha256(msgBytes));

    const derSigHex = signHashHex(hashHex, privateKeyHex);
    const derSigBase64 = Buffer.from(hexToBytes(derSigHex)).toString('base64');

    const wrongHash = bytesToHex(sha256(new TextEncoder().encode('bad message')));
    const valid = verifySignature(wrongHash, derSigBase64, publicKeyHex);
    expect(valid).toBe(false);
  });

  it('verify returns false for wrong public key', () => {
    const kp2 = generateKeyPair();
    const msgBytes = new TextEncoder().encode('test');
    const hashHex = bytesToHex(sha256(msgBytes));

    const derSigHex = signHashHex(hashHex, privateKeyHex);
    const derSigBase64 = Buffer.from(hexToBytes(derSigHex)).toString('base64');

    const valid = verifySignature(hashHex, derSigBase64, kp2.publicKeyHex);
    expect(valid).toBe(false);
  });

  it('signHashBase64 produces valid base64', () => {
    const hashHex = bytesToHex(sha256(new TextEncoder().encode('base64 test')));
    const b64 = signHashBase64(hashHex, privateKeyHex);

    expect(() => Buffer.from(b64, 'base64')).not.toThrow();
    const decoded = Buffer.from(b64, 'base64');
    expect(decoded.length).toBeGreaterThan(0);

    const valid = verifySignature(hashHex, b64, publicKeyHex);
    expect(valid).toBe(true);
  });

  it('consistent sign: same input => same output', () => {
    const hashHex = bytesToHex(sha256(new TextEncoder().encode('consistent')));

    const sig1 = signHashHex(hashHex, privateKeyHex);
    const sig2 = signHashHex(hashHex, privateKeyHex);

    expect(sig1).toBe(sig2);
  });

  it('different messages produce different signatures', () => {
    const hash1 = bytesToHex(sha256(new TextEncoder().encode('msg1')));
    const hash2 = bytesToHex(sha256(new TextEncoder().encode('msg2')));

    const sig1 = signHashHex(hash1, privateKeyHex);
    const sig2 = signHashHex(hash2, privateKeyHex);

    expect(sig1).not.toBe(sig2);
  });
});

// ── DER Signature Encode/Decode ───────────────────────────────────────────────

describe('DER Signature Encoding', () => {
  it('encodes and decodes signature round-trip', () => {
    const r = 0x1234567890abcdefn;
    const s = 0xfedcba0987654321n;

    const der = encodeSignatureDER(r, s);
    const decoded = decodeSignatureDER(der);

    expect(decoded.r).toBe(r);
    expect(decoded.s).toBe(s);
  });

  it('encodes zero values', () => {
    const der = encodeSignatureDER(0n, 0n);
    const decoded = decodeSignatureDER(der);
    expect(decoded.r).toBe(0n);
    expect(decoded.s).toBe(0n);
  });

  it('produces valid DER sequence structure', () => {
    const der = encodeSignatureDER(42n, 99n);
    expect(der[0]).toBe(0x30);
  });
});

// ── Invoice Hashing ───────────────────────────────────────────────────────────

describe('Invoice Hashing', () => {
  it('canonicalizeForHash strips UBLExtensions', () => {
    const xml = [
      '<Invoice xmlns="...">',
      '  <ext:UBLExtensions>',
      '    <ext:UBLExtension><content/></ext:UBLExtension>',
      '  </ext:UBLExtensions>',
      '  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>',
      '</Invoice>',
    ].join('\n');

    const canonical = canonicalizeForHash(xml);
    expect(canonical).not.toContain('UBLExtensions');
    expect(canonical).not.toContain('UBLExtension');
    expect(canonical).toContain('ProfileID');
  });

  it('canonicalizeForHash collapses inter-tag whitespace', () => {
    const xml =
      '<Invoice xmlns="...">\n  <cbc:ID>1</cbc:ID>\n  <cbc:UUID>abc</cbc:UUID>\n</Invoice>';
    const canonical = canonicalizeForHash(xml);
    expect(canonical).not.toContain('\n');
    expect(canonical).toContain('><');
  });

  it('canonicalizeForHash preserves text content', () => {
    const xml = '<Invoice><cbc:ID>123</cbc:ID><cbc:Note>Hello World</cbc:Note></Invoice>';
    const canonical = canonicalizeForHash(xml);
    expect(canonical).toContain('>123<');
    expect(canonical).toContain('>Hello World<');
  });

  it('canonicalizeForHash strips XML prolog', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="...">\n  <cbc:ID>1</cbc:ID>\n</Invoice>';
    const canonical = canonicalizeForHash(xml);
    expect(canonical).not.toContain('<?xml');
    expect(canonical).not.toContain('encoding');
    expect(canonical).toContain('<Invoice');
    expect(canonical).toContain('<cbc:ID>');
  });

  it('computeInvoiceHash produces base64 of hex string (ERPGulf pattern)', () => {
    const xml =
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const hash = computeInvoiceHash(xml);
    expect(hash).toBeTruthy();
    expect(() => Buffer.from(hash, 'base64')).not.toThrow();
    const decoded = Buffer.from(hash, 'base64').toString('utf8');
    expect(decoded.length).toBe(64);
    expect(decoded).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computeInvoiceHashHex produces 64-char hex', () => {
    const xml =
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>2</cbc:ID></Invoice>';
    const hashHex = computeInvoiceHashHex(xml);
    expect(hashHex).toBeTruthy();
    expect(hashHex.length).toBe(64);
  });

  it('hashing is deterministic: same XML => same hash', () => {
    const xml = '<Invoice><cbc:ID>42</cbc:ID></Invoice>';
    const h1 = computeInvoiceHash(xml);
    const h2 = computeInvoiceHash(xml);
    expect(h1).toBe(h2);
  });

  it('different XML => different hash', () => {
    const xml1 = '<Invoice><cbc:ID>1</cbc:ID></Invoice>';
    const xml2 = '<Invoice><cbc:ID>2</cbc:ID></Invoice>';
    expect(computeInvoiceHash(xml1)).not.toBe(computeInvoiceHash(xml2));
  });

  it('hashing matches ERPGulf pattern: base64(hex(sha256(canonical)))', () => {
    const xml = '<Invoice><cbc:ID>test123</cbc:ID></Invoice>';
    const canonical = canonicalizeForHash(xml);

    const nobleHash = computeInvoiceHash(xml);
    const nodeHex = createHash('sha256').update(canonical, 'utf8').digest('hex');
    const expectedB64 = Buffer.from(nodeHex, 'utf8').toString('base64');

    expect(nobleHash).toBe(expectedB64);
  });
});

// ── Signature Embedding ───────────────────────────────────────────────────────

describe('Signature Embedding', () => {
  const certBodyB64 =
    'MIID3jCCA4SgAwIBAgITEQAAOAPF90Ajs/xcXwABAAA4AzAKBggqhkjOPQQDAjBi' +
    'MRUwEwYKCZImiZPyLGQBGRYFbG9jYWwxEzARBgoJkiaJk/IsZAEZFgNnb3YxFzAV' +
    'BgoJkiaJk/IsZAEZFgdleHRnYXp0MRswGQYDVQQDExJQUlpFSU5WT0lDRVNDQTQt' +
    'Q0EwHhcNMjQwMTExMDkxOTMwWhcNMjkwMTA5MDkxOTMwWjB1MQswCQYDVQQGEwJT' +
    'QTEmMCQGA1UEChMdTWF4aW11bSBTcGVlZCBUZWNoIFN1cHBseSBMVEQxFjAUBgNV' +
    'BAsTDVJpeWFkaCBCcmFuY2gxJjAkBgNVBAMTHVRTVC04ODY0MzExNDUtMzk5OTk5' +
    'OTk5OTAwMDAzMFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEoWCKa0Sa9FIErTOv0uAk' +
    'C1VIKXxU9nPpx2vlf4yhMejy8c02XJblDq7tPydo8mq0ahOMmNo8gwni7Xt1KT9U' +
    'eKOCAgcwggIDMIGtBgNVHREEgaUwgaKkgZ8wgZwxOzA5BgNVBAQMMjEtVFNUfDIt' +
    'VFNUfDMtZWQyMmYxZDgtZTZhMi0xMTE4LTliNTgtZDlhOGYxMWU0NDVmMR8wHQYK' +
    'CZImiZPyLGQBAQwPMzk5OTk5OTk5OTAwMDAzMQ0wCwYDVQQMDAQxMTAwMREwDwYD' +
    'VQQaDAhSUlJEMjkyOTEaMBgGA1UEDwwRU3VwcGx5IGFjdGl2aXRpZXMwHQYDVR0O' +
    'BBYEFEX+YvmmtnYoDf9BGbKo7ocTKYK1MB8GA1UdIwQYMBaAFJvKqqLtmqwskIFz' +
    'VvpP2PxT+9NnMHsGCCsGAQUFBwEBBG8wbTBrBggrBgEFBQcwAoZfaHR0cDovL2Fp' +
    'YTQuemF0Y2EuZ292LnNhL0NlcnRFbnJvbGwvUFJaRUludm9pY2VTQ0E0LmV4dGdh' +
    'enQuZ292LmxvY2FsX1BSWkVJTlZPSUNFU0NBNC1DQSgxKS5jcnQwDgYDVR0PAQH/' +
    'BAQDAgeAMDwGCSsGAQQBgjcVBwQvMC0GJSsGAQQBgjcVCIGGqB2E0PsShu2dJIfO' +
    '+xnTwFVmh/qlZYXZhD4CAWQCARIwHQYDVR0lBBYwFAYIKwYBBQUHAwMGCCsGAQUF' +
    'BwMCMCcGCSsGAQQBgjcVCgQaMBgwCgYIKwYBBQUHAwMwCgYIKwYBBQUHAwIwCgYI' +
    'KoZIzj0EAwIDSAAwRQIhALE/ichmnWXCUKUbca3yci8oqwaLvFdHVjQrveI9uqAb' +
    'AiA9hC4M8jgMBADPSzmd2uiPJA6gKR3LE03U75eqbC/rXA==';

  it('embeds signature block into XML', () => {
    const unsignedXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const hashB64 = 'dGVzdGhhc2g=';
    const sigB64 = 'dGVzdHNpZw==';

    const signedXml = embedSignatureIntoXML(unsignedXml, hashB64, sigB64, certBodyB64);

    expect(signedXml).toContain('<cbc:ID>1</cbc:ID>');
    expect(signedXml).toContain('UBLExtensions');
    expect(signedXml).toContain('UBLDocumentSignatures');
    expect(signedXml).toContain('ds:Signature');
    expect(signedXml).toContain(hashB64);
    expect(signedXml).toContain(sigB64);
    expect(signedXml).toContain(certBodyB64);
  });

  it('signature block is inserted after root element opening (not after XML prolog)', () => {
    const unsignedXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const signedXml = embedSignatureIntoXML(unsignedXml, 'a', 'b', certBodyB64);

    // UBLExtensions should appear AFTER <Invoice ...> not after <?xml ...?>
    const xmlPrologPos = signedXml.indexOf('?>');
    const invoiceOpenPos = signedXml.indexOf('<Invoice');
    const extPos = signedXml.indexOf('UBLExtensions');

    expect(invoiceOpenPos).toBeGreaterThan(xmlPrologPos);
    expect(extPos).toBeGreaterThan(invoiceOpenPos);

    // Verify UBLExtensions is INSIDE <Invoice> (between opening and closing)
    const idPos = signedXml.indexOf('<cbc:ID>');
    expect(extPos).toBeLessThan(idPos);
  });

  it('contains XAdES QualifyingProperties block', () => {
    const unsignedXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const signedXml = embedSignatureIntoXML(unsignedXml, 'a', 'b', certBodyB64);

    expect(signedXml).toContain('xades:QualifyingProperties');
    expect(signedXml).toContain('Target="signature"');
    expect(signedXml).toContain('xades:SignedProperties');
    expect(signedXml).toContain('xades:SignedSignatureProperties');
    expect(signedXml).toContain('xades:SigningTime');
    expect(signedXml).toContain('xades:SigningCertificate');
    expect(signedXml).toContain('xades:CertDigest');
    expect(signedXml).toContain('xades:IssuerSerial');
    expect(signedXml).toContain('ds:X509IssuerName');
    expect(signedXml).toContain('ds:X509SerialNumber');
  });

  it('uses sbc namespace for ReferencedSignatureID', () => {
    const unsignedXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const signedXml = embedSignatureIntoXML(unsignedXml, 'a', 'b', certBodyB64);

    expect(signedXml).toContain('<sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>');
    expect(signedXml).toContain('xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2"');
    // Should NOT use sac namespace for ReferencedSignatureID
    expect(signedXml).not.toContain('<sac:ReferencedSignatureID>');
  });

  it('uses correct canonicalization method URL', () => {
    const unsignedXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const signedXml = embedSignatureIntoXML(unsignedXml, 'a', 'b', certBodyB64);

    expect(signedXml).toContain('http://www.w3.org/2006/12/xml-c14n11');
    // Should NOT use the older c14n URL
    expect(signedXml).not.toContain('http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
  });

  it('contains two ds:Reference elements', () => {
    const unsignedXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const signedXml = embedSignatureIntoXML(unsignedXml, 'a', 'b', certBodyB64);

    // First reference: invoice data
    expect(signedXml).toContain('Id="invoiceSignedData"');
    // Second reference: xades signed properties
    expect(signedXml).toContain('URI="#xadesSignedProperties"');
    expect(signedXml).toContain('Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties"');
  });

  it('contains all four XPath transforms', () => {
    const unsignedXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const signedXml = embedSignatureIntoXML(unsignedXml, 'a', 'b', certBodyB64);

    expect(signedXml).toContain('not(//ancestor-or-self::ext:UBLExtensions)');
    expect(signedXml).toContain('not(//ancestor-or-self::cac:Signature)');
    expect(signedXml).toContain("not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])");
    // Should have 4 ds:Transform elements (3 XPath + 1 c14n11)
    // Use a regex that matches <ds:Transform (with space or />) but not <ds:Transforms>
    const transformCount = (signedXml.match(/<ds:Transform[\s/>]/g) || []).length;
    expect(transformCount).toBe(4);
  });

  it('throws on invalid XML without root opening', () => {
    expect(() => embedSignatureIntoXML('no-angle-brackets', 'a', 'b', 'c')).toThrow();
  });
});

// ── Cert Hash ────────────────────────────────────────────────────────────────

describe('computeCertHash', () => {
  it('produces base64 of hex of SHA-256 of cert body string', () => {
    const certBody = 'MIID3jCCA4SgAwIBAgITEQ';
    const hash = computeCertHash(certBody);

    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    // Should be valid base64
    expect(() => Buffer.from(hash, 'base64')).not.toThrow();
    // The decoded base64 should be a hex string
    const decoded = Buffer.from(hash, 'base64').toString('utf8');
    expect(/^[0-9a-f]+$/.test(decoded)).toBe(true);
    // Hex string should be 64 chars (SHA-256 = 32 bytes = 64 hex chars)
    expect(decoded.length).toBe(64);
  });

  it('produces deterministic hashes', () => {
    const body = 'test-cert-body-content';
    expect(computeCertHash(body)).toBe(computeCertHash(body));
  });

  it('matches known ERPGulf cert hash', () => {
    const certBody =
      'MIID3jCCA4SgAwIBAgITEQAAOAPF90Ajs/xcXwABAAA4AzAKBggqhkjOPQQDAjBi' +
      'MRUwEwYKCZImiZPyLGQBGRYFbG9jYWwxEzARBgoJkiaJk/IsZAEZFgNnb3YxFzAV' +
      'BgoJkiaJk/IsZAEZFgdleHRnYXp0MRswGQYDVQQDExJQUlpFSU5WT0lDRVNDQTQt' +
      'Q0EwHhcNMjQwMTExMDkxOTMwWhcNMjkwMTA5MDkxOTMwWjB1MQswCQYDVQQGEwJT' +
      'QTEmMCQGA1UEChMdTWF4aW11bSBTcGVlZCBUZWNoIFN1cHBseSBMVEQxFjAUBgNV' +
      'BAsTDVJpeWFkaCBCcmFuY2gxJjAkBgNVBAMTHVRTVC04ODY0MzExNDUtMzk5OTk5' +
      'OTk5OTAwMDAzMFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEoWCKa0Sa9FIErTOv0uAk' +
      'C1VIKXxU9nPpx2vlf4yhMejy8c02XJblDq7tPydo8mq0ahOMmNo8gwni7Xt1KT9U' +
      'eKOCAgcwggIDMIGtBgNVHREEgaUwgaKkgZ8wgZwxOzA5BgNVBAQMMjEtVFNUfDIt' +
      'VFNUfDMtZWQyMmYxZDgtZTZhMi0xMTE4LTliNTgtZDlhOGYxMWU0NDVmMR8wHQYK' +
      'CZImiZPyLGQBAQwPMzk5OTk5OTk5OTAwMDAzMQ0wCwYDVQQMDAQxMTAwMREwDwYD' +
      'VQQaDAhSUlJEMjkyOTEaMBgGA1UEDwwRU3VwcGx5IGFjdGl2aXRpZXMwHQYDVR0O' +
      'BBYEFEX+YvmmtnYoDf9BGbKo7ocTKYK1MB8GA1UdIwQYMBaAFJvKqqLtmqwskIFz' +
      'VvpP2PxT+9NnMHsGCCsGAQUFBwEBBG8wbTBrBggrBgEFBQcwAoZfaHR0cDovL2Fp' +
      'YTQuemF0Y2EuZ292LnNhL0NlcnRFbnJvbGwvUFJaRUludm9pY2VTQ0E0LmV4dGdh' +
      'enQuZ292LmxvY2FsX1BSWkVJTlZPSUNFU0NBNC1DQSgxKS5jcnQwDgYDVR0PAQH/' +
      'BAQDAgeAMDwGCSsGAQQBgjcVBwQvMC0GJSsGAQQBgjcVCIGGqB2E0PsShu2dJIfO' +
      '+xnTwFVmh/qlZYXZhD4CAWQCARIwHQYDVR0lBBYwFAYIKwYBBQUHAwMGCCsGAQUF' +
      'BwMCMCcGCSsGAQQBgjcVCgQaMBgwCgYIKwYBBQUHAwMwCgYIKwYBBQUHAwIwCgYI' +
      'KoZIzj0EAwIDSAAwRQIhALE/ichmnWXCUKUbca3yci8oqwaLvFdHVjQrveI9uqAb' +
      'AiA9hC4M8jgMBADPSzmd2uiPJA6gKR3LE03U75eqbC/rXA==';
    const hash = computeCertHash(certBody);
    // Known value from ERPGulf reference XML: base64(hex(SHA-256(certBodyStr)))
    expect(hash).toBe(
      'ZDMwMmI0MTE1NzVjOTU2NTk4YzVlODhhYmI0ODU2NDUyNTU2YTVhYjhhMDFmN2FjYjk1YTA2OWQ0NjY2MjQ4NQ==',
    );
  });
});

// ── Cert Info Extraction ─────────────────────────────────────────────────────

describe('extractCertInfo', () => {
  it('extracts issuer name in RFC4514 format', () => {
    const certBody =
      'MIID3jCCA4SgAwIBAgITEQAAOAPF90Ajs/xcXwABAAA4AzAKBggqhkjOPQQDAjBi' +
      'MRUwEwYKCZImiZPyLGQBGRYFbG9jYWwxEzARBgoJkiaJk/IsZAEZFgNnb3YxFzAV' +
      'BgoJkiaJk/IsZAEZFgdleHRnYXp0MRswGQYDVQQDExJQUlpFSU5WT0lDRVNDQTQt' +
      'Q0EwHhcNMjQwMTExMDkxOTMwWhcNMjkwMTA5MDkxOTMwWjB1MQswCQYDVQQGEwJT' +
      'QTEmMCQGA1UEChMdTWF4aW11bSBTcGVlZCBUZWNoIFN1cHBseSBMVEQxFjAUBgNV' +
      'BAsTDVJpeWFkaCBCcmFuY2gxJjAkBgNVBAMTHVRTVC04ODY0MzExNDUtMzk5OTk5' +
      'OTk5OTAwMDAzMFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEoWCKa0Sa9FIErTOv0uAk' +
      'C1VIKXxU9nPpx2vlf4yhMejy8c02XJblDq7tPydo8mq0ahOMmNo8gwni7Xt1KT9U' +
      'eKOCAgcwggIDMIGtBgNVHREEgaUwgaKkgZ8wgZwxOzA5BgNVBAQMMjEtVFNUfDIt' +
      'VFNUfDMtZWQyMmYxZDgtZTZhMi0xMTE4LTliNTgtZDlhOGYxMWU0NDVmMR8wHQYK' +
      'CZImiZPyLGQBAQwPMzk5OTk5OTk5OTAwMDAzMQ0wCwYDVQQMDAQxMTAwMREwDwYD' +
      'VQQaDAhSUlJEMjkyOTEaMBgGA1UEDwwRU3VwcGx5IGFjdGl2aXRpZXMwHQYDVR0O' +
      'BBYEFEX+YvmmtnYoDf9BGbKo7ocTKYK1MB8GA1UdIwQYMBaAFJvKqqLtmqwskIFz' +
      'VvpP2PxT+9NnMHsGCCsGAQUFBwEBBG8wbTBrBggrBgEFBQcwAoZfaHR0cDovL2Fp' +
      'YTQuemF0Y2EuZ292LnNhL0NlcnRFbnJvbGwvUFJaRUludm9pY2VTQ0E0LmV4dGdh' +
      'enQuZ292LmxvY2FsX1BSWkVJTlZPSUNFU0NBNC1DQSgxKS5jcnQwDgYDVR0PAQH/' +
      'BAQDAgeAMDwGCSsGAQQBgjcVBwQvMC0GJSsGAQQBgjcVCIGGqB2E0PsShu2dJIfO' +
      '+xnTwFVmh/qlZYXZhD4CAWQCARIwHQYDVR0lBBYwFAYIKwYBBQUHAwMGCCsGAQUF' +
      'BwMCMCcGCSsGAQQBgjcVCgQaMBgwCgYIKwYBBQUHAwMwCgYIKwYBBQUHAwIwCgYI' +
      'KoZIzj0EAwIDSAAwRQIhALE/ichmnWXCUKUbca3yci8oqwaLvFdHVjQrveI9uqAb' +
      'AiA9hC4M8jgMBADPSzmd2uiPJA6gKR3LE03U75eqbC/rXA==';
    const { issuerName } = extractCertInfo(certBody);

    expect(issuerName).toBe(
      'CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local',
    );
  });

  it('extracts serial number as decimal string', () => {
    const certBody =
      'MIID3jCCA4SgAwIBAgITEQAAOAPF90Ajs/xcXwABAAA4AzAKBggqhkjOPQQDAjBi' +
      'MRUwEwYKCZImiZPyLGQBGRYFbG9jYWwxEzARBgoJkiaJk/IsZAEZFgNnb3YxFzAV' +
      'BgoJkiaJk/IsZAEZFgdleHRnYXp0MRswGQYDVQQDExJQUlpFSU5WT0lDRVNDQTQt' +
      'Q0EwHhcNMjQwMTExMDkxOTMwWhcNMjkwMTA5MDkxOTMwWjB1MQswCQYDVQQGEwJT' +
      'QTEmMCQGA1UEChMdTWF4aW11bSBTcGVlZCBUZWNoIFN1cHBseSBMVEQxFjAUBgNV' +
      'BAsTDVJpeWFkaCBCcmFuY2gxJjAkBgNVBAMTHVRTVC04ODY0MzExNDUtMzk5OTk5' +
      'OTk5OTAwMDAzMFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEoWCKa0Sa9FIErTOv0uAk' +
      'C1VIKXxU9nPpx2vlf4yhMejy8c02XJblDq7tPydo8mq0ahOMmNo8gwni7Xt1KT9U' +
      'eKOCAgcwggIDMIGtBgNVHREEgaUwgaKkgZ8wgZwxOzA5BgNVBAQMMjEtVFNUfDIt' +
      'VFNUfDMtZWQyMmYxZDgtZTZhMi0xMTE4LTliNTgtZDlhOGYxMWU0NDVmMR8wHQYK' +
      'CZImiZPyLGQBAQwPMzk5OTk5OTk5OTAwMDAzMQ0wCwYDVQQMDAQxMTAwMREwDwYD' +
      'VQQaDAhSUlJEMjkyOTEaMBgGA1UEDwwRU3VwcGx5IGFjdGl2aXRpZXMwHQYDVR0O' +
      'BBYEFEX+YvmmtnYoDf9BGbKo7ocTKYK1MB8GA1UdIwQYMBaAFJvKqqLtmqwskIFz' +
      'VvpP2PxT+9NnMHsGCCsGAQUFBwEBBG8wbTBrBggrBgEFBQcwAoZfaHR0cDovL2Fp' +
      'YTQuemF0Y2EuZ292LnNhL0NlcnRFbnJvbGwvUFJaRUludm9pY2VTQ0E0LmV4dGdh' +
      'enQuZ292LmxvY2FsX1BSWkVJTlZPSUNFU0NBNC1DQSgxKS5jcnQwDgYDVR0PAQH/' +
      'BAQDAgeAMDwGCSsGAQQBgjcVBwQvMC0GJSsGAQQBgjcVCIGGqB2E0PsShu2dJIfO' +
      '+xnTwFVmh/qlZYXZhD4CAWQCARIwHQYDVR0lBBYwFAYIKwYBBQUHAwMGCCsGAQUF' +
      'BwMCMCcGCSsGAQQBgjcVCgQaMBgwCgYIKwYBBQUHAwMwCgYIKwYBBQUHAwIwCgYI' +
      'KoZIzj0EAwIDSAAwRQIhALE/ichmnWXCUKUbca3yci8oqwaLvFdHVjQrveI9uqAb' +
      'AiA9hC4M8jgMBADPSzmd2uiPJA6gKR3LE03U75eqbC/rXA==';
    const { serialNumber } = extractCertInfo(certBody);

    expect(serialNumber).toBe('379112742831380471835263969587287663520528387');
  });
});

// ── Signed Properties ────────────────────────────────────────────────────────

describe('Signed Properties', () => {
  it('buildSignedPropertiesXml produces valid XML snippet', () => {
    const xml = buildSignedPropertiesXml(
      '2024-12-30T08:20:32',
      'ZDMwMmI0MTE1NzVjOTU2NTk4YzVlODhhYmI0ODU2NDUyNTU2YTVhYjhhMDFmN2FjYjk1YTA2OWQ0NjY2MjQ4NQ==',
      'CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local',
      '379112742831380471835263969587287663520528387',
    );

    expect(xml).toContain('<xades:SignedProperties');
    expect(xml).toContain('xades:SignedSignatureProperties');
    expect(xml).toContain('xades:SigningTime');
    expect(xml).toContain('xades:SigningCertificate');
    expect(xml).toContain('xades:CertDigest');
    expect(xml).toContain('xades:IssuerSerial');
    expect(xml).toContain('2024-12-30T08:20:32');
  });

  it('computeSignedPropertiesHash produces base64 of hex', () => {
    const xml = buildSignedPropertiesXml(
      '2024-12-30T08:20:32',
      'ZDMwMmI0MTE1NzVjOTU2NTk4YzVlODhhYmI0ODU2NDUyNTU2YTVhYjhhMDFmN2FjYjk1YTA2OWQ0NjY2MjQ4NQ==',
      'CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local',
      '379112742831380471835263969587287663520528387',
    );
    const hash = computeSignedPropertiesHash(xml);

    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    // Should be valid base64
    expect(() => Buffer.from(hash, 'base64')).not.toThrow();
    // The decoded base64 should be a 64-char hex string
    const decoded = Buffer.from(hash, 'base64').toString('utf8');
    expect(decoded.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(decoded)).toBe(true);
  });

  it('computeSignedPropertiesHash is consistent with embedded XML', () => {
    const signingTime = '2024-12-30T08:20:32';
    const certDigest = 'AAAABBBBCCCCDDDDEEEEFFFF1111222233334444';
    const issuerName = 'CN=Test';
    const serialNumber = '12345';

    // Build the signed properties XML
    const xml = buildSignedPropertiesXml(
      signingTime,
      certDigest,
      issuerName,
      serialNumber,
    );
    // Hash it
    const hash = computeSignedPropertiesHash(xml);

    // Verify hash is valid and deterministic
    expect(hash).toBeTruthy();
    expect(hash).toBe(computeSignedPropertiesHash(xml));

    // Verify the hash is for our exact XML string (not some different string)
    // If the XML changes, the hash must change too
    const differentXml = buildSignedPropertiesXml(
      '2025-01-01T00:00:00', // different time
      certDigest,
      issuerName,
      serialNumber,
    );
    const differentHash = computeSignedPropertiesHash(differentXml);
    expect(differentHash).not.toBe(hash);
  });

  it('computeSignedPropertiesHash is deterministic', () => {
    const xml = buildSignedPropertiesXml(
      '2025-01-01T00:00:00',
      'AAAABBBBCCCCDDDDEEEEFFFF1111222233334444',
      'CN=Test',
      '12345',
    );
    expect(computeSignedPropertiesHash(xml)).toBe(computeSignedPropertiesHash(xml));
  });
});

// ── CSR Builder ───────────────────────────────────────────────────────────────

describe('CSR Builder', () => {
  const csrSubject = {
    commonName: 'TST-00000001-300123456789',
    organizationName: 'SpicyHome Restaurant',
    organizationalUnit: '300123456789',
    country: 'SA',
  };

  const csrExtensions = {
    zatcaEnv: 'sandbox' as const,
    serialNumber: '1-TST|2-TST|3-deadbeef-beef-dead-beef-deadbeef1234',
    vatNumber: '300123456789',
    invoiceType: '1100',
    locationAddress: 'RIYADH',
    businessCategory: 'Retail',
  };

  it('builds a CSR and returns DER bytes', () => {
    const kp = generateKeyPair();
    const csrDer = buildCSR(csrSubject, kp.publicKeyHex, kp.privateKeyHex, csrExtensions);

    expect(csrDer).toBeTruthy();
    expect(csrDer.length).toBeGreaterThan(100);
    expect(csrDer[0]).toBe(0x30);
  });

  it('csr can be converted to PEM', () => {
    const kp = generateKeyPair();
    const csrDer = buildCSR(
      {
        commonName: '300123456789',
        organizationName: 'SpicyHome',
        organizationalUnit: 'POS',
        country: 'SA',
      },
      kp.publicKeyHex,
      kp.privateKeyHex,
    );

    const pem = toPem(csrDer, 'CERTIFICATE REQUEST');
    expect(pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
    expect(pem).toContain('-----END CERTIFICATE REQUEST-----');
  });

  it('different keys produce different CSRs', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();

    const csr1 = buildCSR(
      { commonName: 'X', organizationName: 'Y', organizationalUnit: 'Z', country: 'SA' },
      kp1.publicKeyHex,
      kp1.privateKeyHex,
    );

    const csr2 = buildCSR(
      { commonName: 'X', organizationName: 'Y', organizationalUnit: 'Z', country: 'SA' },
      kp2.publicKeyHex,
      kp2.privateKeyHex,
    );

    const b64_1 = Buffer.from(csr1).toString('base64');
    const b64_2 = Buffer.from(csr2).toString('base64');
    expect(b64_1).not.toBe(b64_2);
  });

  it('CSR DER can be parsed by forge as a valid sequence', () => {
    const kp = generateKeyPair();
    const csrDer = buildCSR(csrSubject, kp.publicKeyHex, kp.privateKeyHex, csrExtensions);

    const parsed = asn1.fromDer(Buffer.from(csrDer).toString('binary'));
    expect(parsed.tagClass).toBe(asn1.Class.UNIVERSAL);
    expect(parsed.type).toBe(asn1.Type.SEQUENCE);
    expect(parsed.constructed).toBe(true);
  });

  it('CSR contains version integer 0', () => {
    const kp = generateKeyPair();
    const csrDer = buildCSR(csrSubject, kp.publicKeyHex, kp.privateKeyHex, csrExtensions);

    const parsed = asn1.fromDer(Buffer.from(csrDer).toString('binary'));
    const csrInfo = getAsn1Children(parsed)[0];
    const version = getAsn1Children(csrInfo)[0];

    expect(version.type).toBe(asn1.Type.INTEGER);
    const valStr = getAsn1Value(version);
    expect(valStr).toBe('\x00');
  });

  it('CSR subject contains expected OIDs', () => {
    const kp = generateKeyPair();
    const csrDer = buildCSR(csrSubject, kp.publicKeyHex, kp.privateKeyHex, csrExtensions);

    const parsed = asn1.fromDer(Buffer.from(csrDer).toString('binary'));
    const csrInfo = getAsn1Children(parsed)[0];
    const subjectName = getAsn1Children(csrInfo)[1];

    const oids: string[] = [];
    for (const rdn of getAsn1Children(subjectName)) {
      for (const attr of getAsn1Children(rdn)) {
        const seqChildren = getAsn1Children(attr);
        const oidNode = seqChildren[0];
        const derBytes = getAsn1Value(oidNode);
        try {
          oids.push(asn1.derToOid(derBytes));
        } catch {
          // skip
        }
      }
    }

    expect(oids).toContain('2.5.4.6');
    expect(oids).toContain('2.5.4.11');
    expect(oids).toContain('2.5.4.10');
    expect(oids).toContain('2.5.4.3');
  });

  it('CSR with extensions includes custom extension OID', () => {
    const kp = generateKeyPair();
    const csrDer = buildCSR(csrSubject, kp.publicKeyHex, kp.privateKeyHex, csrExtensions);

    const parsed = asn1.fromDer(Buffer.from(csrDer).toString('binary'));
    const csrInfo = getAsn1Children(parsed)[0];
    const attributes = getAsn1Children(csrInfo)[3];

    expect(attributes.tagClass).toBe(asn1.Class.CONTEXT_SPECIFIC);
    expect(attributes.type).toBe(0);

    const derStr = Buffer.from(csrDer).toString('binary');
    const extReqOid = oidDerStr('1.2.840.113549.1.9.14');
    expect(derStr.indexOf(extReqOid)).toBeGreaterThan(-1);

    const customOid = oidDerStr('1.3.6.1.4.1.311.20.2');
    expect(derStr.indexOf(customOid)).toBeGreaterThan(-1);

    const sanOid = oidDerStr('2.5.29.17');
    expect(derStr.indexOf(sanOid)).toBeGreaterThan(-1);
  });

  it('CSR without extensions has empty context-tagged attributes', () => {
    const kp = generateKeyPair();
    const csrDer = buildCSR(
      { commonName: 'X', organizationName: 'Y', organizationalUnit: 'Z', country: 'SA' },
      kp.publicKeyHex,
      kp.privateKeyHex,
    );

    const derStr = Buffer.from(csrDer).toString('binary');
    expect(derStr).toContain('\xa0\x00');
  });

  it('exportPublicKeyDer produces valid SPKI DER', () => {
    const kp = generateKeyPair();
    const der = exportPublicKeyDer(kp.publicKeyHex);
    expect(der[0]).toBe(0x30);
    expect(der.length).toBeGreaterThan(50);

    const parsed = asn1.fromDer(Buffer.from(der).toString('binary'));
    expect(parsed.type).toBe(asn1.Type.SEQUENCE);

    const algId = getAsn1Children(parsed)[0];
    expect(algId.type).toBe(asn1.Type.SEQUENCE);

    const spki = getAsn1Children(parsed)[1];
    expect(spki.type).toBe(asn1.Type.BITSTRING);
  });
});

// ── Key Encryption at Rest ────────────────────────────────────────────────────

describe('Key Encryption at Rest', () => {
  const secret = 'test-secret-password-123';
  const plaintext = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('encrypts and decrypts correctly', () => {
    const enc = encryptAtRest(plaintext, secret);
    expect(enc.ciphertext).toBeTruthy();
    expect(enc.iv).toBeTruthy();
    expect(enc.salt).toBeTruthy();
    expect(enc.authTag).toBeTruthy();

    const decrypted = decryptAtRest(enc, secret);
    expect(decrypted).toBe(plaintext);
  });

  it('decryption fails with wrong secret', () => {
    const enc = encryptAtRest(plaintext, secret);
    expect(() => decryptAtRest(enc, 'wrong-secret')).toThrow();
  });

  it('decryption fails with tampered ciphertext', () => {
    const enc = encryptAtRest(plaintext, secret);
    enc.ciphertext = Buffer.from('tampered').toString('base64');
    expect(() => decryptAtRest(enc, secret)).toThrow();
  });

  it('each encryption produces different output (random IV)', () => {
    const enc1 = encryptAtRest(plaintext, secret);
    const enc2 = encryptAtRest(plaintext, secret);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it('round-trips private key hex data', () => {
    const kp = generateKeyPair();
    const enc = encryptAtRest(kp.privateKeyHex, secret);
    const decrypted = decryptAtRest(enc, secret);
    expect(decrypted).toBe(kp.privateKeyHex);
  });
});
