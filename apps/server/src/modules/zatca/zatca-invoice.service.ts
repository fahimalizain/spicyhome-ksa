/**
 * ZATCA Invoice Service — creates, signs, and persists ZATCA invoices.
 *
 * This service is the primary integration point between the order flow
 * and the ZATCA e-invoicing module. It is called when an order is paid.
 *
 * Flow:
 *   1. Load seller config from settings.
 *   2. Atomically allocate next ICV from `last_icv` setting.
 *   3. Determine PIH from the previous invoice's hash.
 *   4. Build unsigned UBL XML.
 *   5. Compute invoice hash (canonicalize → SHA-256 → base64).
 *   6. Sign the hash with the seller's private key.
 *   7. Embed the signature into the UBL XML.
 *   8. Compute the QR TLV payload.
 *   9. Insert into `invoices` table with status `signed`.
 *  10. Return the invoice data (including QR payload for receipt printing).
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { eq, desc } from 'drizzle-orm';
import { orders, orderItems, invoices, settings } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { PrintersService } from '../printers/printers.service';
import { createAuditFields } from '../../common/audit-fields.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

import {
  computeInvoiceHash,
  computeInvoiceHashHex,
  signHashBase64,
  embedSignatureIntoXML,
  injectQrIntoXml,
  extractCertSignature,
  encryptAtRest,
  decryptAtRest,
  exportPublicKeyDer,
} from './zatca-crypto.service';

import {
  buildUnsignedInvoiceXML,
  InvoiceXMLInput,
  InvoiceItemInput,
  SellerInfo,
} from './zatca-xml-builder.service';
import { ZATCAInvoiceDocumentType, ZATCA_INITIAL_PIH } from '@spicyhome/shared';
import { encodeZatcaTLV, TLVInput } from './tlv';

export interface CreateInvoiceResult {
  id: number;
  icv: number;
  uuid: string;
  invoiceHash: string;
  status: string;
  qrTlvBase64: string;
  signedXml: string;
}

@Injectable()
export class ZatcaInvoiceService {
  private readonly logger = new Logger(ZatcaInvoiceService.name);

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private printersService: PrintersService,
  ) {}

  // ── Event listener ─────────────────────────────────────────────────────────

  @OnEvent('order.paid')
  async onOrderPaid(payload: { orderId: number; userId: number }): Promise<void> {
    try {
      await this.createInvoice(payload.orderId);
    } catch (err: any) {
      this.logger.error(
        `Failed to create ZATCA invoice for order ${payload.orderId}: ${err.message}`,
      );
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Create a signed ZATCA invoice for a paid order.
   *
   * This is the main entry point. It must:
   *   - Be idempotent (one invoice per order — returns existing if present).
   *   - Not block order payment — failures are caught and the invoice
   *     status is set to `failed` for retry.
   */
  async createInvoice(orderId: number): Promise<CreateInvoiceResult> {
    // Check for existing invoice
    const existing = this.db.select().from(invoices).where(eq(invoices.orderId, orderId)).get();

    if (existing) {
      return {
        id: existing.id,
        icv: existing.icv,
        uuid: existing.uuid,
        invoiceHash: existing.invoiceHash,
        status: existing.status,
        qrTlvBase64: existing.qrTlv,
        signedXml: existing.xml,
      };
    }

    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    const oiRows = this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();

    // Load seller config
    const sellerName = this.printersService.getSetting('seller_name', 'SpicyHome');
    const vatNumber = this.printersService.getSetting('vat_number', '300000000000');
    const crNumber = this.printersService.getSetting('cr_number', '');
    const sellerStreet = this.printersService.getSetting('seller_street', '');
    const sellerBuilding = this.printersService.getSetting('seller_building', '');
    const sellerCity = this.printersService.getSetting('seller_city', 'Riyadh');
    const sellerPostal = this.printersService.getSetting('seller_postal', '');
    const sellerCountry = this.printersService.getSetting('seller_country', 'SA');

    const seller: SellerInfo = {
      name: sellerName,
      vatNumber,
      crNumber: crNumber || undefined,
      street: sellerStreet || undefined,
      buildingNumber: sellerBuilding || undefined,
      city: sellerCity,
      postalCode: sellerPostal || undefined,
      country: sellerCountry,
    };

    // Load keys and certificate
    const privateKeyHex = this.getPrivateKey();
    if (!privateKeyHex) {
      throw new Error('ZATCA private key not configured. Run onboarding first.');
    }

    const publicKeyHex = this.printersService.getSetting('zatca_public_key', '');
    const certBase64 = this.getCertificate();

    // Build invoice items from order items
    const invItems: InvoiceItemInput[] = oiRows.map((oi) => ({
      name: oi.itemName,
      unitPriceHalalas: oi.unitPriceHalalas,
      vatRateBp: oi.vatRateBp,
      qty: oi.qty,
    }));

    // ── Timestamp in Asia/Riyadh timezone (UTC+3) ──
    // CRITICAL: The QR code tag 3 timestamp MUST match the XML's
    // <cbc:IssueDate> and <cbc:IssueTime> exactly. ZATCA validates this
    // (KSA-25 rule) and returns "invoiceTimeStamp_QRCODE_INVALID" warning
    // if they differ.
    //
    // We use sv-SE locale because it produces ISO-8601 format:
    //   toLocaleDateString('sv-SE') → "2026-07-23"
    //   toLocaleTimeString('sv-SE', {hour12:false}) → "16:38:22"
    //
    // Previous bug: used toISOString() (UTC) for IssueDate but getHours()
    // (local) for IssueTime → mismatch when server timezone ≠ UTC.
    const now = Math.floor(Date.now() / 1000);
    const nowDate = new Date(now * 1000);
    const issueDate = nowDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Riyadh' });
    const issueTime = nowDate.toLocaleTimeString('sv-SE', { timeZone: 'Asia/Riyadh', hour12: false });

    // Allocate ICV and get PIH atomically
    const { icv, prevInvoiceHash } = this.db.transaction((tx: any) => {
      return this.allocateICV(tx);
    });

    // Generate UUID
    const invUuid = require('crypto').randomUUID();

    // Build unsigned XML
    const xmlInput: InvoiceXMLInput = {
      icv,
      uuid: invUuid,
      issueDate,
      issueTime,
      seller,
      items: invItems,
      discountHalalas: order.discountHalalas || 0,
      prevInvoiceHash,
    };

    const unsignedXml = buildUnsignedInvoiceXML(xmlInput);

    // ── Compute invoice hash and sign ──
    // The invoice hash = SHA-256 of the canonicalized unsigned XML (after
    // stripping UBLExtensions, cac:Signature, QR AdditionalDocumentReference).
    // This is base64(raw_bytes) — 44 chars.
    // This same value goes into <ds:DigestValue> AND is sent as `invoiceHash`
    // in the ZATCA API JSON body.
    const invoiceHashB64 = computeInvoiceHash(unsignedXml);
    const invoiceHashHex = computeInvoiceHashHex(unsignedXml);

    // ECDSA signature: sign the SHA-256 hash hex with secp256k1 private key
    const signatureB64 = signHashBase64(invoiceHashHex, privateKeyHex);

    // ── Certificate: double-base64 decode ──
    // ZATCA's binarySecurityToken is base64-encoded base64. We decode one
    // layer here: Buffer.from(certBase64, 'base64').toString('utf-8')
    // gives us the cert body base64 (e.g. "MIICQjCC...") that goes directly
    // into <ds:X509Certificate> and is used for cert hashing.
    const certForXml = Buffer.from(certBase64, 'base64').toString('utf-8');

    const signedXml = embedSignatureIntoXML(unsignedXml, invoiceHashB64, signatureB64, certForXml);

    // ── QR TLV payload (9 tags) ──
    // Tag 3 (timestamp): MUST be `${issueDate}T${issueTime}` — the exact
    // same values that went into <cbc:IssueDate> and <cbc:IssueTime>.
    // Any mismatch causes "invoiceTimeStamp_QRCODE_INVALID" warning.
    // Note: no timezone offset suffix — ZATCA expects naive +03:00 time.
    const timestampIso = `${issueDate}T${issueTime}`;
    // Tag 9: raw ECDSA signature bytes from the ZATCA-issued X.509 cert
    const certSigB64 = extractCertSignature(certForXml);
    const tlvInput: TLVInput = {
      sellerName,
      vatNumber,
      timestamp: timestampIso,
      totalHalalas: order.totalHalalas,
      vatHalalas: order.vatHalalas,
      invoiceHashBase64: invoiceHashB64,
      signatureBase64: signatureB64,
      // Tag 8: PublicKey.getEncoded() = SubjectPublicKeyInfo DER bytes
      // (NOT the raw 65-byte EC point — ZATCA SDK uses SPKI DER, ~88 bytes)
      publicKeyBase64: Buffer.from(exportPublicKeyDer(publicKeyHex)).toString('base64'),
      certificateSignatureBase64: certSigB64,
    };
    const qrTlvBase64 = encodeZatcaTLV(tlvInput);

    // Inject QR into signed XML (after signing — QR is excluded from hash)
    const finalSignedXml = injectQrIntoXml(signedXml, qrTlvBase64);

    // The invoiceHash sent to ZATCA API = DigestValue = hash of unsigned XML
    // after stripping UBLExtensions, cac:Signature, QR AdditionalDocumentReference.
    // This is the same value as invoiceHashB64 which we embedded in
    // <ds:DigestValue> for the invoiceSignedData Reference.
    const finalInvoiceHash = invoiceHashB64;

    // Insert invoice
    const result = this.db
      .insert(invoices)
      .values({
        orderId,
        icv,
        uuid: invUuid,
        invoiceHash: finalInvoiceHash,
        prevInvoiceHash,
        xml: finalSignedXml,
        qrTlv: qrTlvBase64,
        status: 'signed',
        reportedAt: null,
        ...createAuditFields(1, now),
      } as any)
      .run();

    const invoiceId = Number(result.lastInsertRowid);

    this.logger.log(
      `Invoice created: ICV=${icv}, order=${orderId}, hash=${finalInvoiceHash.slice(0, 20)}...`,
    );

    return {
      id: invoiceId,
      icv,
      uuid: invUuid,
      invoiceHash: finalInvoiceHash,
      status: 'signed',
      qrTlvBase64,
      signedXml: finalSignedXml,
    };
  }

  /**
   * Get invoice by order ID.
   */
  getByOrderId(orderId: number): any {
    return this.db.select().from(invoices).where(eq(invoices.orderId, orderId)).get();
  }

  /**
   * List all invoices (paginated).
   */
  listInvoices(limit = 50, offset = 0): any[] {
    return this.db
      .select()
      .from(invoices)
      .orderBy(desc(invoices.id))
      .limit(limit)
      .offset(offset)
      .all();
  }

  /**
   * Get invoice by ID.
   */
  getById(id: number): any {
    return this.db.select().from(invoices).where(eq(invoices.id, id)).get();
  }

  /**
   * Get the QR TLV payload for a paid order's receipt.
   * Returns null if no invoice exists yet (e.g., ZATCA down).
   */
  getQrTlvPayload(orderId: number): string | null {
    const inv = this.getByOrderId(orderId);
    return inv?.qrTlv ?? null;
  }

  /**
   * Build a dynamically-generated signed invoice XML for ZATCA compliance checks.
   *
   * This generates a full, signed invoice using the same XML pipeline as real
   * orders — with real seller config, real keys, real signatures — but without
   * tying it to a real order or persisting it to the DB. ZATCA determines the
   * invoice type from the `InvoiceTypeCode` element in the XML.
   */
  async buildComplianceInvoice(
    type: ZATCAInvoiceDocumentType,
  ): Promise<{ signedXml: string; invoiceHash: string; uuid: string }> {
    const { randomUUID } = require('crypto');

    const sellerName = this.printersService.getSetting('seller_name', 'SpicyHome');
    const vatNumber = this.printersService.getSetting('vat_number', '300000000000');
    const crNumber = this.printersService.getSetting('cr_number', '');
    const sellerStreet = this.printersService.getSetting('seller_street', '');
    const sellerBuilding = this.printersService.getSetting('seller_building', '');
    const sellerCity = this.printersService.getSetting('seller_city', 'Riyadh');
    const sellerPostal = this.printersService.getSetting('seller_postal', '');
    const sellerCountry = this.printersService.getSetting('seller_country', 'SA');

    const seller: SellerInfo = {
      name: sellerName,
      vatNumber,
      crNumber: crNumber || undefined,
      street: sellerStreet || undefined,
      buildingNumber: sellerBuilding || undefined,
      city: sellerCity,
      postalCode: sellerPostal || undefined,
      country: sellerCountry,
    };

    const privateKeyHex = this.getPrivateKey();
    if (!privateKeyHex) {
      throw new Error('ZATCA private key not configured. Run onboarding first.');
    }

    const complianceCert = this.printersService.getSetting('zatca_compliance_cert', '');
    if (!complianceCert) {
      throw new Error('ZATCA compliance certificate not found. Run compliance onboarding first.');
    }

    // Dummy line item for compliance check
    const items: InvoiceItemInput[] = [
      { name: 'Compliance Test Item', unitPriceHalalas: 11500, vatRateBp: 1500, qty: 1 },
    ];

    const now = Math.floor(Date.now() / 1000);
    const nowDate = new Date(now * 1000);
    const issueDate = nowDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Riyadh' });
    const issueTime = nowDate.toLocaleTimeString('sv-SE', { timeZone: 'Asia/Riyadh', hour12: false });

    // Read current ICV without incrementing — compliance invoices don't consume ICV
    const lastIcvRow = this.db.select().from(settings).where(eq(settings.key, 'last_icv')).get();
    const icv = lastIcvRow ? parseInt(lastIcvRow.value, 10) : 0;

    const invUuid = randomUUID();
    const isCorrection = type === 'credit_note' || type === 'debit_note';

    const xmlInput: InvoiceXMLInput = {
      type,
      icv,
      uuid: invUuid,
      issueDate,
      issueTime,
      seller,
      items,
      prevInvoiceHash: ZATCA_INITIAL_PIH,
      billingReferenceId: isCorrection ? 'SME00001' : undefined,
    };

    const unsignedXml = buildUnsignedInvoiceXML(xmlInput);

    const digestHashB64 = computeInvoiceHash(unsignedXml);
    const digestHashHex = computeInvoiceHashHex(unsignedXml);

    // ECDSA signature of the invoice hash
    const signatureB64 = signHashBase64(digestHashHex, privateKeyHex);
    // Double-base64 decode: ZATCA's binarySecurityToken is base64(base64(cert))
    const certForXml = Buffer.from(complianceCert, 'base64').toString('utf-8');
    const signedXml = embedSignatureIntoXML(unsignedXml, digestHashB64, signatureB64, certForXml);

    // ── QR TLV with all 9 tags ──
    // Dummy compliance invoice: 11500 halalas total, 1500 halalas VAT
    // (10000 excl + 15% VAT = 11500 incl)
    const totalHalalas = 11500;
    const vatHalalas = 1500;
    // Tag 3: timestamp must match IssueDate/IssueTime from the XML exactly
    const timestampIso = `${issueDate}T${issueTime}`;
    const publicKeyHex = this.printersService.getSetting('zatca_public_key', '');
    const certSigB64 = extractCertSignature(certForXml);

    const tlvInput: TLVInput = {
      sellerName,
      vatNumber,
      timestamp: timestampIso,
      totalHalalas,
      vatHalalas,
      invoiceHashBase64: digestHashB64,
      signatureBase64: signatureB64,
      // Tag 8: PublicKey.getEncoded() = SubjectPublicKeyInfo DER bytes
      // (NOT the raw 65-byte EC point — ZATCA SDK uses SPKI DER, ~88 bytes)
      publicKeyBase64: Buffer.from(exportPublicKeyDer(publicKeyHex)).toString('base64'),
      certificateSignatureBase64: certSigB64,
    };
    const qrTlvBase64 = encodeZatcaTLV(tlvInput);

    // Inject QR into signed XML (after signing — QR is excluded from hash)
    const finalSignedXml = injectQrIntoXml(signedXml, qrTlvBase64);

    // The invoiceHash sent to ZATCA = DigestValue = hash of unsigned XML
    // (same as digestHashB64 we embedded in <ds:DigestValue>).
    const invoiceHash = digestHashB64;

    return { signedXml: finalSignedXml, invoiceHash, uuid: invUuid };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Atomically allocate the next ICV and get PIH.
   * Must be called within a transaction.
   */
  private allocateICV(tx: any): { icv: number; prevInvoiceHash: string } {
    // Get last ICV
    const lastIcvRow = tx.select().from(settings).where(eq(settings.key, 'last_icv')).get();

    let icv: number;
    if (lastIcvRow) {
      icv = parseInt(lastIcvRow.value, 10) + 1;
      tx.update(settings)
        .set({ value: String(icv) })
        .where(eq(settings.key, 'last_icv'))
        .run();
    } else {
      icv = 1;
      tx.insert(settings).values({ key: 'last_icv', value: '1' }).run();
    }

    // Get PIH from the previous invoice
    let prevInvoiceHash = '';
    if (icv > 1) {
      const prevInvoice = tx
        .select()
        .from(invoices)
        .where(eq(invoices.icv, icv - 1))
        .get();
      prevInvoiceHash = prevInvoice?.invoiceHash ?? '';
    }

    return { icv, prevInvoiceHash };
  }

  /**
   * Retrieve and decrypt the seller's private key from settings.
   */
  private getPrivateKey(): string | null {
    const encrypted = this.printersService.getSetting('zatca_private_key_encrypted', '');
    const iv = this.printersService.getSetting('zatca_private_key_iv', '');
    const salt = this.printersService.getSetting('zatca_private_key_salt', '');
    const authTag = this.printersService.getSetting('zatca_private_key_auth_tag', '');

    if (!encrypted || !iv || !salt || !authTag) return null;

    const secret = process.env.ZATCA_SECRET || 'spicyhome-zatca-secret-change-me';
    return decryptAtRest({ ciphertext: encrypted, iv, salt, authTag }, secret);
  }

  /**
   * Get the current certificate (compliance or production) as base64.
   *
   * ZATCA's `binarySecurityToken` is double-base64-encoded: the raw value is a
   * base64 string that itself encodes the DER cert body (another base64 string).
   * This raw value is used directly for Basic Auth, but must be decoded once
   * before embedding in <ds:X509Certificate> in the UBL XML — otherwise ZATCA
   * rejects the invoice with "Invalid encoded base 64 format".
   * See ERPGulf sign_invoice_first.py line 399: base64.b64decode(binarySecurityToken).
   */
  private getCertificate(): string {
    const prodCert = this.printersService.getSetting('zatca_production_cert', '');
    if (prodCert) return prodCert;
    const complianceCert = this.printersService.getSetting('zatca_compliance_cert', '');
    return complianceCert;
  }

  /**
   * Store an encrypted private key in settings.
   */
  storePrivateKey(privateKeyHex: string, secret: string): void {
    const enc = encryptAtRest(privateKeyHex, secret);
    this.printersService.setSetting('zatca_private_key_encrypted', enc.ciphertext);
    this.printersService.setSetting('zatca_private_key_iv', enc.iv);
    this.printersService.setSetting('zatca_private_key_salt', enc.salt);
    this.printersService.setSetting('zatca_private_key_auth_tag', enc.authTag);
  }

  /**
   * Check if onboarding has been completed to the given stage.
   */
  getOnboardingState(): string {
    return this.printersService.getSetting('zatca_onboarding_state', 'not_started');
  }

  setOnboardingState(state: string): void {
    this.printersService.setSetting('zatca_onboarding_state', state);
  }
}
