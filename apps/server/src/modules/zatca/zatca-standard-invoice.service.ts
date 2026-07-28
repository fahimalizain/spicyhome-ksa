/**
 * ZATCA Standard Invoice Service — builds, signs, clears, and persists
 * standard tax invoices (B2B) for orders marked `is_standard_invoice=1`.
 *
 * Unlike simplified invoices (which are signed-and-later-reported), standard
 * invoices go through ZATCA's **clearance** endpoint synchronously. When
 * ZATCA clears the invoice, the service persists the cleared XML. On failure,
 * the signed XML is persisted with status `failed`.
 *
 * This service shares the same ICV/PIH chain as simplified invoices via
 * {@link ZatcaInvoiceService.allocateNextIcv}.
 *
 * Phase 6 will wire this to `order.paid` via a listener; for now it is a
 * standalone service with a public `createStandardInvoice()` method.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import {
  orders,
  orderItems,
  orderRefunds,
  orderRefundItems,
  zatcaInvoices,
  zatcaCreditNotes,
} from '@spicyhome/db';
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
  decryptAtRest,
  extractPublicKeySpkiFromCert,
} from './zatca-crypto.service';

import {
  buildUnsignedInvoiceXML,
  InvoiceXMLInput,
  InvoiceItemInput,
  SellerInfo,
} from './zatca-xml-builder.service';

import { ZatcaInvoiceService } from './zatca-invoice.service';
import { ZatcaClearanceService, ZatcaClearanceResult } from './zatca-clearance.service';
import { encodeZatcaTLV, TLVInput } from './tlv';
import { decomposeVat, zatcaKey, requireZatcaBuyerDetails } from '@spicyhome/shared';
import type { ZATCAEnvironment } from '@spicyhome/shared';

export interface CreateStandardInvoiceResult {
  id: number;
  icv: number;
  uuid: string;
  invoiceHash: string;
  status: string;
  qrTlvBase64: string;
  signedXml: string;
  clearance: ZatcaClearanceResult;
}

@Injectable()
export class ZatcaStandardInvoiceService {
  private readonly logger = new Logger(ZatcaStandardInvoiceService.name);

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private printersService: PrintersService,
    private invoiceService: ZatcaInvoiceService,
    private clearanceService: ZatcaClearanceService,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Create, sign, clear, and persist a standard ZATCA invoice for an order
   * that has `is_standard_invoice=1` with full buyer details.
   *
   * This is the main entry point. It:
   *   1. Loads the order and validates it is a standard invoice with buyer data
   *   2. Allocates ICV (shared chain with simplified invoices)
   *   3. Builds unsigned standard UBL XML (subtype 0100000, full buyer party)
   *   4. Signs the invoice with the seller's private key
   *   5. Generates QR TLV and injects into signed XML
   *   6. Calls ZATCA clearance API
   *   7. Persists to `zatca_invoices` with status reflecting clearance result
   *
   * @param orderId - The order to generate a standard invoice for
   * @param userId - User ID for audit fields (optional)
   * @throws If the order is not a standard invoice or buyer fields are missing
   */
  async createStandardInvoice(
    orderId: number,
    userId?: number,
  ): Promise<CreateStandardInvoiceResult> {
    if (userId === undefined) userId = 1;

    // Idempotency: one invoice per order. Return existing row if present.
    const existing = this.db
      .select()
      .from(zatcaInvoices)
      .where(eq(zatcaInvoices.orderId, orderId))
      .get();
    if (existing) {
      this.logger.log(
        `Standard invoice already exists for order ${orderId} (status=${existing.status})`,
      );
      return {
        id: existing.id,
        icv: existing.icv,
        uuid: existing.uuid,
        invoiceHash: existing.invoiceHash,
        status: existing.status,
        qrTlvBase64: existing.qrTlv,
        signedXml: existing.xml,
        clearance: {
          status: existing.status === 'cleared' ? ('CLEARED' as const) : ('REJECTED' as const),
          httpStatus: 0,
          clearedXml: existing.status === 'cleared' ? existing.xml : null,
          clearedInvoiceBase64: null,
          warnings: [],
          errors: [],
          rawBody: null,
        },
      };
    }

    // 1. Load the order; verify it exists and is a standard invoice
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    if (order.isStandardInvoice !== 1) {
      throw new Error(
        `Order ${orderId} is not a standard invoice (is_standard_invoice=${order.isStandardInvoice})`,
      );
    }

    // 2. Validate buyer fields
    this.validateBuyerFields(order);

    // 3. Load order items
    const oiRows = this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();

    if (oiRows.length === 0) {
      throw new Error(`Order ${orderId} has no items`);
    }

    // 4. Load seller config
    const seller = this.buildSellerConfig();

    // 5. Load keys and certificate
    const env = this.getEnv();
    const orgUnit = this.getOrgUnit();
    const privateKeyHex = this.getPrivateKey(env, orgUnit);
    if (!privateKeyHex) {
      throw new Error('ZATCA private key not configured. Run onboarding first.');
    }
    const certBase64 = this.getCertificate(env, orgUnit);

    // 6. Build invoice items from order items
    const invItems: InvoiceItemInput[] = oiRows.map((oi) => ({
      name: oi.itemName,
      unitPriceHalalas: oi.unitPriceHalalas,
      vatRateBp: oi.vatRateBp,
      qty: oi.qty,
    }));

    // 7. Timestamps in Asia/Riyadh
    const now = Math.floor(Date.now() / 1000);
    const nowDate = new Date(now * 1000);
    const issueDate = nowDate.toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Riyadh',
    });
    const issueTime = nowDate.toLocaleTimeString('sv-SE', {
      timeZone: 'Asia/Riyadh',
      hour12: false,
    });

    // 8. Allocate ICV atomically (shared chain with simplified invoices)
    const { icv, prevInvoiceHash } = this.db.transaction((tx: any) => {
      return this.invoiceService.allocateNextIcv(tx, env, orgUnit);
    });

    // 9. Generate UUID
    const invUuid = require('crypto').randomUUID();

    // 10. Build unsigned standard XML with buyer party
    const xmlInput: InvoiceXMLInput = {
      icv,
      uuid: invUuid,
      issueDate,
      issueTime,
      seller,
      items: invItems,
      discountHalalas: order.discountHalalas || 0,
      prevInvoiceHash,
      invoiceProfile: 'standard',
      buyer: this.getBuyerFromOrder(order),
    };

    const unsignedXml = buildUnsignedInvoiceXML(xmlInput);

    // 11. Sign
    const invoiceHashB64 = computeInvoiceHash(unsignedXml);
    const invoiceHashHex = computeInvoiceHashHex(unsignedXml);
    const signatureB64 = signHashBase64(invoiceHashHex, privateKeyHex);
    const certForXml = Buffer.from(certBase64, 'base64').toString('utf-8');
    const signedXml = embedSignatureIntoXML(unsignedXml, invoiceHashB64, signatureB64, certForXml);

    // 12. QR TLV
    const timestampIso = `${issueDate}T${issueTime}`;
    const certSigB64 = extractCertSignature(certForXml);
    const tlvInput: TLVInput = {
      sellerName: seller.name,
      vatNumber: seller.vatNumber,
      timestamp: timestampIso,
      totalHalalas: order.totalHalalas,
      vatHalalas: order.vatHalalas,
      invoiceHashBase64: invoiceHashB64,
      signatureBase64: signatureB64,
      publicKeyBase64: extractPublicKeySpkiFromCert(certForXml),
      certificateSignatureBase64: certSigB64,
    };
    const qrTlvBase64 = encodeZatcaTLV(tlvInput);

    // 13. Inject QR into signed XML
    const finalSignedXml = injectQrIntoXml(signedXml, qrTlvBase64);
    const finalInvoiceHash = invoiceHashB64;

    // 14. Call clearance API
    const clearance = await this.clearanceService.clearDocument({
      invoiceHash: finalInvoiceHash,
      uuid: invUuid,
      xml: finalSignedXml,
    });

    // 15. Persist based on clearance result
    let storedXml: string;
    let storeStatus: string;

    if (clearance.status === 'CLEARED') {
      storedXml = clearance.clearedXml || finalSignedXml;
      storeStatus = 'cleared';
      this.logger.log(`Standard invoice CLEARED: order=${orderId}, ICV=${icv}, uuid=${invUuid}`);
    } else {
      storedXml = finalSignedXml;
      storeStatus = 'failed';
      const errMsgs = clearance.errors.length > 0 ? clearance.errors.join('; ') : 'no errors';
      this.logger.error(
        `Standard invoice ${clearance.status}: order=${orderId}, ICV=${icv}, errors=${errMsgs}`,
      );
    }

    // 16. Insert zatca_invoices row (unique by orderId)
    const reportedAt = clearance.status === 'CLEARED' ? now : null;

    const result = this.db
      .insert(zatcaInvoices)
      .values({
        orderId,
        icv,
        uuid: invUuid,
        invoiceHash: finalInvoiceHash,
        prevInvoiceHash,
        xml: storedXml,
        qrTlv: qrTlvBase64,
        status: storeStatus,
        reportedAt,
        ...createAuditFields(userId, now),
      } as any)
      .run();

    const invoiceId = Number(result.lastInsertRowid);

    // Throw on failure so callers (Phase 6 pay handler) can surface the error
    if (storeStatus === 'failed') {
      throw new Error(
        `Standard invoice clearance failed for order ${orderId}: ${clearance.errors.join('; ') || clearance.status}`,
      );
    }

    return {
      id: invoiceId,
      icv,
      uuid: invUuid,
      invoiceHash: finalInvoiceHash,
      status: storeStatus,
      qrTlvBase64,
      signedXml: storedXml,
      clearance,
    };
  }

  // ── Event listeners (Phase 6) ────────────────────────────────────────────

  /**
   * Handle `order.paid` for standard invoices — create, sign, and clear via
   * ZATCA clearance.  Errors are caught and logged; payment must never roll
   * back because ZATCA is unavailable.
   */
  @OnEvent('order.paid')
  async onOrderPaid(payload: { orderId: number; userId: number }): Promise<void> {
    try {
      const order = this.db
        .select({ isStandardInvoice: orders.isStandardInvoice })
        .from(orders)
        .where(eq(orders.id, payload.orderId))
        .get();
      if (!order || order.isStandardInvoice !== 1) return;
      await this.createStandardInvoice(payload.orderId, payload.userId);
    } catch (err: any) {
      this.logger.error(
        `Failed to create standard invoice for order ${payload.orderId}: ${err.message}`,
      );
    }
  }

  /**
   * Handle `order.refund.issued` for standard orders — create a standard
   * credit note with clearance. Errors are caught and logged; refund must
   * never roll back because ZATCA is unavailable.
   */
  @OnEvent('order.refund.issued')
  async onOrderRefundIssued(payload: {
    orderId: number;
    refundId: number;
    userId: number;
  }): Promise<void> {
    try {
      const order = this.db
        .select({ isStandardInvoice: orders.isStandardInvoice })
        .from(orders)
        .where(eq(orders.id, payload.orderId))
        .get();
      if (!order || order.isStandardInvoice !== 1) return;
      await this.createStandardCreditNote(payload.orderId, payload.refundId, payload.userId);
    } catch (err: any) {
      this.logger.error(
        `Failed to create standard credit note for refund ${payload.refundId}: ${err.message}`,
      );
    }
  }

  /**
   * Create a standard credit note (B2B) for a refunded standard order.
   *
   * Mirrors the simplified {@link ZatcaInvoiceService.createCreditNote} but:
   *   - Uses the standard invoice profile (subtype 0100000)
   *   - Includes buyer info from the original order
   *   - Submits via clearance (not reporting)
   *   - Persists to `zatca_credit_notes` with status `cleared` or `failed`
   *
   * @param orderId  - The order being refunded (must have a zatca_invoices row)
   * @param refundId - The refund row ID
   * @param userId   - User ID for audit fields (defaults to 1)
   * @throws If original invoice is missing, buyer fields are incomplete, or
   *         clearance fails (failed row is still persisted before throwing).
   */
  async createStandardCreditNote(
    orderId: number,
    refundId: number,
    userId?: number,
  ): Promise<{ id: number; icv: number; uuid: string; status: string }> {
    if (userId === undefined) userId = 1;

    // 1. Require original invoice (status preferably cleared, but accept any)
    const originalInvoice = this.db
      .select()
      .from(zatcaInvoices)
      .where(eq(zatcaInvoices.orderId, orderId))
      .get();
    if (!originalInvoice) {
      throw new Error(`No original invoice found for order ${orderId}`);
    }

    // 2. Load order for buyer info snapshot
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    if (order.isStandardInvoice !== 1) {
      throw new Error(
        `Order ${orderId} is not a standard invoice (is_standard_invoice=${order.isStandardInvoice})`,
      );
    }

    // 3. Load refund
    const refund = this.db.select().from(orderRefunds).where(eq(orderRefunds.id, refundId)).get();
    if (!refund) throw new Error(`Refund ${refundId} not found`);

    // 4. Load refund items
    const refundItems = this.db
      .select()
      .from(orderRefundItems)
      .where(eq(orderRefundItems.refundId, refundId))
      .all();

    // 5. Compute refund totals (mirrors simplified createCreditNote)
    let vatHalalas = 0;
    let totalHalalas = 0;
    for (const ri of refundItems) {
      const lineTotal = ri.unitPriceHalalas * ri.qty;
      totalHalalas += lineTotal;
      const decomposed = decomposeVat(lineTotal, ri.vatRateBp);
      vatHalalas += decomposed.vatHalalas;
    }

    // 6. Build seller config
    const seller = this.buildSellerConfig();

    // 7. Load keys and certificate
    const env = this.getEnv();
    const orgUnit = this.getOrgUnit();
    const privateKeyHex = this.getPrivateKey(env, orgUnit);
    if (!privateKeyHex) {
      throw new Error('ZATCA private key not configured. Run onboarding first.');
    }
    const certBase64 = this.getCertificate(env, orgUnit);

    // 8. Validate buyer fields (from order snapshot)
    this.validateBuyerFields(order);

    // 9. Build invoice items from refund items
    const invItems: InvoiceItemInput[] = refundItems.map((ri) => ({
      name: ri.itemName,
      unitPriceHalalas: ri.unitPriceHalalas,
      vatRateBp: ri.vatRateBp,
      qty: ri.qty,
    }));

    // 10. Timestamps in Asia/Riyadh
    const now = Math.floor(Date.now() / 1000);
    const nowDate = new Date(now * 1000);
    const issueDate = nowDate.toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Riyadh',
    });
    const issueTime = nowDate.toLocaleTimeString('sv-SE', {
      timeZone: 'Asia/Riyadh',
      hour12: false,
    });

    // 11. Allocate ICV atomically (shared chain)
    const { icv, prevInvoiceHash } = this.db.transaction((tx: any) => {
      return this.invoiceService.allocateNextIcv(tx, env, orgUnit);
    });

    // 12. Generate UUID
    const invUuid = require('crypto').randomUUID();

    // 13. Build unsigned standard credit note XML
    const xmlInput: InvoiceXMLInput = {
      type: 'credit_note',
      icv,
      uuid: invUuid,
      issueDate,
      issueTime,
      seller,
      items: invItems,
      prevInvoiceHash,
      invoiceProfile: 'standard',
      buyer: this.getBuyerFromOrder(order),
      billingReferenceId: originalInvoice.uuid,
      paymentNote: refund.reason || 'Refund',
    };

    const unsignedXml = buildUnsignedInvoiceXML(xmlInput);

    // 14. Sign
    const invoiceHashB64 = computeInvoiceHash(unsignedXml);
    const invoiceHashHex = computeInvoiceHashHex(unsignedXml);
    const signatureB64 = signHashBase64(invoiceHashHex, privateKeyHex);
    const certForXml = Buffer.from(certBase64, 'base64').toString('utf-8');
    const signedXml = embedSignatureIntoXML(unsignedXml, invoiceHashB64, signatureB64, certForXml);

    // 15. QR TLV
    const timestampIso = `${issueDate}T${issueTime}`;
    const certSigB64 = extractCertSignature(certForXml);
    const tlvInput: TLVInput = {
      sellerName: seller.name,
      vatNumber: seller.vatNumber,
      timestamp: timestampIso,
      totalHalalas,
      vatHalalas,
      invoiceHashBase64: invoiceHashB64,
      signatureBase64: signatureB64,
      publicKeyBase64: extractPublicKeySpkiFromCert(certForXml),
      certificateSignatureBase64: certSigB64,
    };
    const qrTlvBase64 = encodeZatcaTLV(tlvInput);

    // 16. Inject QR into signed XML
    const finalSignedXml = injectQrIntoXml(signedXml, qrTlvBase64);
    const finalInvoiceHash = invoiceHashB64;

    // 17. Call clearance API
    const clearance = await this.clearanceService.clearDocument({
      invoiceHash: finalInvoiceHash,
      uuid: invUuid,
      xml: finalSignedXml,
    });

    // 18. Persist based on clearance result
    let storedXml: string;
    let storeStatus: string;

    if (clearance.status === 'CLEARED') {
      storedXml = clearance.clearedXml || finalSignedXml;
      storeStatus = 'cleared';
      this.logger.log(
        `Standard credit note CLEARED: order=${orderId}, refund=${refundId}, ICV=${icv}`,
      );
    } else {
      storedXml = finalSignedXml;
      storeStatus = 'failed';
      const errMsgs = clearance.errors.length > 0 ? clearance.errors.join('; ') : 'no errors';
      this.logger.error(
        `Standard credit note ${clearance.status}: order=${orderId}, refund=${refundId}, errors=${errMsgs}`,
      );
    }

    const reportedAt = clearance.status === 'CLEARED' ? now : null;

    // 19. Insert zatca_credit_notes row
    const result = this.db
      .insert(zatcaCreditNotes)
      .values({
        orderId,
        refundId,
        relatedInvoiceUuid: originalInvoice.uuid,
        icv,
        uuid: invUuid,
        invoiceHash: finalInvoiceHash,
        prevInvoiceHash,
        xml: storedXml,
        qrTlv: qrTlvBase64,
        status: storeStatus,
        reportedAt,
        totalHalalas,
        vatHalalas,
        reason: refund.reason || 'Refund',
        ...createAuditFields(userId, now),
      } as any)
      .run();

    const creditNoteId = Number(result.lastInsertRowid);

    // Throw on failure so callers can surface the error
    if (storeStatus === 'failed') {
      throw new Error(
        `Standard credit note clearance failed for refund ${refundId}: ${
          clearance.errors.join('; ') || clearance.status
        }`,
      );
    }

    return { id: creditNoteId, icv, uuid: invUuid, status: storeStatus };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Validate that all required buyer fields are present on the order.
   * Reads from the zatca_buyer_details JSON column.
   */
  private validateBuyerFields(order: Record<string, any>): void {
    try {
      requireZatcaBuyerDetails(order.zatcaBuyerDetails);
    } catch (err: any) {
      throw new Error(
        `Order ${order.id} is a standard invoice but is missing buyer fields: ${err.message}`,
        { cause: err },
      );
    }
  }

  /**
   * Parse buyer details from the order's zatca_buyer_details JSON column.
   * Returns a plain buyer object for XML builder use.
   * @throws If the JSON is missing or invalid
   */
  private getBuyerFromOrder(order: Record<string, any>): {
    name: string;
    vatNumber: string;
    street: string;
    buildingNumber: string;
    citySubdivision: string;
    city: string;
    postalCode: string;
    country: string;
  } {
    const details = requireZatcaBuyerDetails(order.zatcaBuyerDetails);
    return details;
  }

  /**
   * Build seller configuration from settings.
   */
  private buildSellerConfig(): SellerInfo {
    const sellerName = this.printersService.getSetting('seller_name', 'SpicyHome');
    const vatNumber = this.printersService.getSetting('vat_number', '300000000000');
    const crNumber = this.printersService.getSetting('cr_number', '');
    const sellerStreet = this.printersService.getSetting('seller_street', '');
    const sellerBuilding = this.printersService.getSetting('seller_building', '');
    const sellerCity = this.printersService.getSetting('seller_city', 'Riyadh');
    const sellerPostal = this.printersService.getSetting('seller_postal', '');
    const sellerCountry = this.printersService.getSetting('seller_country', 'SA');

    return {
      name: sellerName,
      vatNumber,
      crNumber: crNumber || undefined,
      street: sellerStreet || undefined,
      buildingNumber: sellerBuilding || undefined,
      city: sellerCity,
      postalCode: sellerPostal || undefined,
      country: sellerCountry,
    };
  }

  private getEnv(): ZATCAEnvironment {
    return this.printersService.getSetting('zatca_environment', 'simulation') as ZATCAEnvironment;
  }

  private getOrgUnit(): string {
    return this.printersService.getSetting('zatca_org_unit', '');
  }

  private getPrivateKey(env: ZATCAEnvironment, orgUnit: string): string | null {
    const encrypted = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'private_key_encrypted'),
      '',
    );
    const ivLabel = this.printersService.getSetting(zatcaKey(env, orgUnit, 'private_key_iv'), '');
    const salt = this.printersService.getSetting(zatcaKey(env, orgUnit, 'private_key_salt'), '');
    const authTag = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'private_key_auth_tag'),
      '',
    );

    if (!encrypted || !ivLabel || !salt || !authTag) return null;

    const secret = process.env.ZATCA_SECRET || 'spicyhome-zatca-secret-change-me';
    return decryptAtRest({ ciphertext: encrypted, iv: ivLabel, salt, authTag }, secret);
  }

  private getCertificate(env: ZATCAEnvironment, orgUnit: string): string {
    const prodCert = this.printersService.getSetting(zatcaKey(env, orgUnit, 'production_cert'), '');
    if (prodCert) return prodCert;
    const complianceCert = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_cert'),
      '',
    );
    return complianceCert;
  }
}
