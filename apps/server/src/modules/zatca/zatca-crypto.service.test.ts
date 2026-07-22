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
  encodeOid,
  derSequence,
  derSet,
  derInteger,
  derPrintableString,
  derUtf8String,
  derBitString,
  derOctetString,
  derNull,
  derContextTagged,
  exportPublicKeyDer,
  bytesToBase64,
} from './zatca-crypto.service';

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { createHash } from 'crypto';

// ── Key Generation ────────────────────────────────────────────────────────────

describe('Key Generation', () => {
  it('generates a valid keypair', () => {
    const kp = generateKeyPair();
    expect(kp.privateKeyHex).toBeTruthy();
    expect(kp.privateKeyHex.length).toBe(64); // 32 bytes hex
    expect(kp.publicKeyHex.length).toBe(130); // 65 bytes hex (uncompressed)
    expect(kp.publicKeyHex.slice(0, 2)).toBe('04'); // 0x04 prefix
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

    // Convert DER hex to base64 for verify
    const derSigBase64 = Buffer.from(hexToBytes(derSigHex)).toString('base64');

    const valid = verifySignature(hashHex, derSigBase64, publicKeyHex);
    expect(valid).toBe(true);
  });

  it('verify returns false for wrong message', () => {
    const msgBytes = new TextEncoder().encode('good message');
    const hashHex = bytesToHex(sha256(msgBytes));

    const derSigHex = signHashHex(hashHex, privateKeyHex);
    const derSigBase64 = Buffer.from(hexToBytes(derSigHex)).toString('base64');

    // Verify with different hash
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

    // Verify round-trip
    const valid = verifySignature(hashHex, b64, publicKeyHex);
    expect(valid).toBe(true);
  });

  it('consistent sign: same input → same output', () => {
    const hashHex = bytesToHex(sha256(new TextEncoder().encode('consistent')));

    const sig1 = signHashHex(hashHex, privateKeyHex);
    const sig2 = signHashHex(hashHex, privateKeyHex);

    // ECDSA should be deterministic with the same message and key
    // (noble/curves uses RFC 6979 deterministic k)
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
    expect(der[0]).toBe(0x30); // SEQUENCE tag
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
    const xml = '<Invoice xmlns="...">\n  <cbc:ID>1</cbc:ID>\n  <cbc:UUID>abc</cbc:UUID>\n</Invoice>';
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

  it('computeInvoiceHash produces base64 string', () => {
    const xml = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const hash = computeInvoiceHash(xml);
    expect(hash).toBeTruthy();
    expect(() => Buffer.from(hash, 'base64')).not.toThrow();
    const decoded = Buffer.from(hash, 'base64');
    expect(decoded.length).toBe(32); // SHA-256 = 32 bytes
  });

  it('computeInvoiceHashHex produces 64-char hex', () => {
    const xml = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>2</cbc:ID></Invoice>';
    const hashHex = computeInvoiceHashHex(xml);
    expect(hashHex).toBeTruthy();
    expect(hashHex.length).toBe(64);
  });

  it('hashing is deterministic: same XML → same hash', () => {
    const xml = '<Invoice><cbc:ID>42</cbc:ID></Invoice>';
    const h1 = computeInvoiceHash(xml);
    const h2 = computeInvoiceHash(xml);
    expect(h1).toBe(h2);
  });

  it('different XML → different hash', () => {
    const xml1 = '<Invoice><cbc:ID>1</cbc:ID></Invoice>';
    const xml2 = '<Invoice><cbc:ID>2</cbc:ID></Invoice>';
    expect(computeInvoiceHash(xml1)).not.toBe(computeInvoiceHash(xml2));
  });

  it('hashing matches node:crypto sha256', () => {
    const xml = '<Invoice><cbc:ID>test123</cbc:ID></Invoice>';
    const canonical = canonicalizeForHash(xml);
    
    const nobleHash = computeInvoiceHash(xml);
    const nodeHash = createHash('sha256').update(canonical, 'utf8').digest('base64');
    
    expect(nobleHash).toBe(nodeHash);
  });
});

// ── Signature Embedding ───────────────────────────────────────────────────────

describe('Signature Embedding', () => {
  it('embeds signature block into XML', () => {
    const unsignedXml = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const hashB64 = 'dGVzdGhhc2g=';
    const sigB64 = 'dGVzdHNpZw==';
    const certB64 = 'dGVzdGNlcnQ=';

    const signedXml = embedSignatureIntoXML(unsignedXml, hashB64, sigB64, certB64);

    // Should contain the original content
    expect(signedXml).toContain('<cbc:ID>1</cbc:ID>');

    // Should contain the signature block
    expect(signedXml).toContain('UBLExtensions');
    expect(signedXml).toContain('UBLDocumentSignatures');
    expect(signedXml).toContain('ds:Signature');
    expect(signedXml).toContain(hashB64);
    expect(signedXml).toContain(sigB64);
    expect(signedXml).toContain(certB64);
  });

  it('signature block is inserted after root element opening', () => {
    const unsignedXml = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>';
    const signedXml = embedSignatureIntoXML(unsignedXml, 'a', 'b', 'c');

    // UBLExtensions should appear before the first child element
    const extPos = signedXml.indexOf('UBLExtensions');
    const idPos = signedXml.indexOf('<cbc:ID>');
    expect(extPos).toBeLessThan(idPos);
  });

  it('throws on invalid XML without root opening', () => {
    expect(() => embedSignatureIntoXML('no-angle-brackets', 'a', 'b', 'c')).toThrow();
  });
});

// ── CSR Builder ───────────────────────────────────────────────────────────────

describe('CSR Builder', () => {
  it('builds a CSR and returns DER bytes', () => {
    const kp = generateKeyPair();
    const csrDer = buildCSR(
      {
        commonName: '300123456789',
        organizationName: 'SpicyHome Restaurant',
        organizationalUnit: 'SpicyHome POS',
        country: 'SA',
        organizationIdentifier: 'VAT-SA-300123456789',
      },
      kp.publicKeyHex,
      kp.privateKeyHex,
    );

    expect(csrDer).toBeTruthy();
    expect(csrDer.length).toBeGreaterThan(100);
    // Should start with SEQUENCE tag
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
});

// ── DER Encoding Helpers ──────────────────────────────────────────────────────

describe('DER Encoding Helpers', () => {
  it('encodes OID correctly', () => {
    const oid = encodeOid('1.2.840.10045.2.1');
    expect(oid[0]).toBe(0x06); // OID tag
  });

  it('derSEQUENCE wraps with tag 0x30', () => {
    const seq = derSequence([new Uint8Array([1, 2, 3])]);
    expect(seq[0]).toBe(0x30);
  });

  it('derBitString wraps with tag 0x03', () => {
    const bs = derBitString(new Uint8Array([1, 2]));
    expect(bs[0]).toBe(0x03);
  });

  it('derInteger handles 0', () => {
    const int0 = derInteger(0);
    // Should be 02 01 00
    expect(int0[0]).toBe(0x02);
  });

  it('derInteger handles positive value > 127', () => {
    const int = derInteger(200);
    expect(int[0]).toBe(0x02);
    // Should have leading 0x00 to avoid being interpreted as negative
  });

  it('derPrintableString wraps with tag 0x13', () => {
    const ps = derPrintableString('SA');
    expect(ps[0]).toBe(0x13);
  });

  it('derUtf8String wraps with tag 0x0c', () => {
    const us = derUtf8String('Test');
    expect(us[0]).toBe(0x0c);
  });

  it('derNull is [0x05, 0x00]', () => {
    const n = derNull();
    expect(n.length).toBe(2);
    expect(n[0]).toBe(0x05);
    expect(n[1]).toBe(0x00);
  });

  it('derContextTagged wraps with 0xa0+tagNum', () => {
    const ct = derContextTagged(0, new Uint8Array([1]));
    expect(ct[0]).toBe(0xa0);
  });

  it('exportPublicKeyDer produces valid DER', () => {
    const kp = generateKeyPair();
    const der = exportPublicKeyDer(kp.publicKeyHex);
    expect(der[0]).toBe(0x30); // SEQUENCE
    // Should contain the algorithm OID and the public key
    expect(der.length).toBeGreaterThan(50);
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
