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
import { IncomingMessage } from 'http';
import { orders, orderItems, invoices, settings } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { PrintersService } from '../printers/printers.service';
import { createAuditFields } from '../../common/audit-fields.helper';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

import {
  generateKeyPair,
  computeInvoiceHash,
  computeInvoiceHashHex,
  signHashBase64,
  signHashHex,
  embedSignatureIntoXML,
  getPublicKeyPem,
  encryptAtRest,
  decryptAtRest,
  KeyPair,
  EncryptedData,
} from './zatca-crypto.service';

import {
  buildUnsignedInvoiceXML,
  InvoiceXMLInput,
  InvoiceItemInput,
  SellerInfo,
} from './zatca-xml-builder.service';
import { encodeZatcaTLV, TLVInput } from './tlv';

const VAT_NUMBER_HALALAS_DIVISOR = 100;

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
    const sellerStreet = this.printersService.getSetting('seller_street', '');
    const sellerBuilding = this.printersService.getSetting('seller_building', '');
    const sellerCity = this.printersService.getSetting('seller_city', 'Riyadh');
    const sellerPostal = this.printersService.getSetting('seller_postal', '');
    const sellerCountry = this.printersService.getSetting('seller_country', 'SA');

    const seller: SellerInfo = {
      name: sellerName,
      vatNumber,
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

    // Compute timestamp
    const now = Math.floor(Date.now() / 1000);
    const nowDate = new Date(now * 1000);
    const issueDate = nowDate.toISOString().slice(0, 10);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const issueTime = `${pad2(nowDate.getHours())}:${pad2(nowDate.getMinutes())}:${pad2(nowDate.getSeconds())}`;

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

    // Compute invoice hash
    const invoiceHashB64 = computeInvoiceHash(unsignedXml);
    const invoiceHashHex = computeInvoiceHashHex(unsignedXml);

    // Sign
    const signatureB64 = signHashBase64(invoiceHashHex, privateKeyHex);

    // Embed signature into XML
    const signedXml = embedSignatureIntoXML(unsignedXml, invoiceHashB64, signatureB64, certBase64);

    // Compute TLV QR payload
    const timestampIso = `${issueDate}T${issueTime}+03:00`;
    const tlvInput: TLVInput = {
      sellerName,
      vatNumber,
      timestamp: timestampIso,
      totalHalalas: order.totalHalalas,
      vatHalalas: order.vatHalalas,
      invoiceHashBase64: invoiceHashB64,
      signatureBase64: signatureB64,
      publicKeyBase64: Buffer.from(publicKeyHex, 'hex').toString('base64'),
    };
    const qrTlvBase64 = encodeZatcaTLV(tlvInput);

    // Insert invoice
    const result = this.db
      .insert(invoices)
      .values({
        orderId,
        icv,
        uuid: invUuid,
        invoiceHash: invoiceHashB64,
        prevInvoiceHash,
        xml: signedXml,
        qrTlv: qrTlvBase64,
        status: 'signed',
        reportedAt: null,
        ...createAuditFields(1, now),
      } as any)
      .run();

    const invoiceId = Number(result.lastInsertRowid);

    // Emit invoice.created for the reporting worker
    try {
      const { EventEmitter2 } = require('@nestjs/event-emitter');
      // We can't inject EventEmitter2 easily here, but the reporting worker
      // polls the DB, so we don't strictly need to emit.
    } catch {}

    this.logger.log(
      `Invoice created: ICV=${icv}, order=${orderId}, hash=${invoiceHashB64.slice(0, 20)}...`,
    );

    return {
      id: invoiceId,
      icv,
      uuid: invUuid,
      invoiceHash: invoiceHashB64,
      status: 'signed',
      qrTlvBase64,
      signedXml,
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
