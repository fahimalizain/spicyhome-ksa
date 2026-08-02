/**
 * ZATCA Standard Invoice Service — builds, signs, clears, and persists
 * standard tax invoices (B2B) for orders marked `is_standard_invoice=1`.
 *
 * Multi-attempt clearance lifecycle:
 *   pending → cleared | rejected | error
 *
 * - `pending`: XML built, signed, ICV allocated — waiting for ZATCA
 * - `cleared`: ZATCA accepted the invoice — receipt printed
 * - `rejected`: ZATCA rejected with business errors — immutable, reissue needed
 * - `error`: Network/credentials error — identical retry allowed (same UUID/ICV)
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import {
  orders,
  orderItems,
  orderPayments,
  orderRefunds,
  orderRefundItems,
  zatcaInvoices,
  zatcaCreditNotes,
} from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { PrintersService } from '../printers/printers.service';
import { OrderEventsService } from '../orders/order-events.service';
import { DocumentIdService } from '../orders/document-id.allocator';
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
import {
  decomposeVat,
  zatcaKey,
  requireZatcaBuyerDetails,
  parseZatcaBuyerDetails,
  buildInvoicePaymentMeans,
  buildCreditNotePaymentMeans,
} from '@spicyhome/shared';
import type { ZATCAEnvironment } from '@spicyhome/shared';

export interface CreateStandardInvoiceResult {
  id: number;
  icv: number;
  uuid: string;
  invoiceHash: string;
  status: string;
  attemptNo: number;
  qrTlvBase64: string;
  signedXml: string;
  clearance: {
    status: string;
    httpStatus: number;
    clearedXml: string | null;
    clearedInvoiceBase64: string | null;
    warnings: string[];
    errors: string[];
    rawBody: string | null;
  };
}

export interface ZatcaInvoiceAttempt {
  id: number;
  attemptNo: number;
  status: string;
  icv: number;
  uuid: string;
  errors: string[];
  warnings: string[];
  httpStatus: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ZatcaInvoiceStatusResponse {
  invoiceType: 'simplified' | 'standard' | 'none';
  current: ZatcaInvoiceAttempt | null;
  attempts: ZatcaInvoiceAttempt[];
  canRetryClearance: boolean;
  canReissue: boolean;
}

@Injectable()
export class ZatcaStandardInvoiceService {
  private readonly logger = new Logger(ZatcaStandardInvoiceService.name);

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private printersService: PrintersService,
    private invoiceService: ZatcaInvoiceService,
    private clearanceService: ZatcaClearanceService,
    private documentIdService: DocumentIdService,
    private eventEmitter: EventEmitter2,
    private orderEvents: OrderEventsService,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Create, sign, clear, and persist a standard ZATCA invoice for an order.
   *
   * Multi-attempt behavior:
   * - If cleared exists → return it (idempotent success)
   * - If latest is pending → return it (in-flight)
   * - If latest is error → do NOT auto-retry; return it (caller must call retryClearance)
   * - If latest is rejected or none → new attempt (new ICV, new UUID)
   */
  async createStandardInvoice(
    orderId: number,
    userId?: number,
  ): Promise<CreateStandardInvoiceResult> {
    if (userId === undefined) userId = 1;

    // 1. Check for existing cleared invoice (idempotent success)
    const cleared = this.invoiceService.getClearedInvoiceByOrderId(orderId);
    if (cleared) {
      this.logger.log(`Standard invoice already cleared for order ${orderId}`);
      return this.buildResultFromRow(cleared, 'CLEARED');
    }

    // 2. Check for in-flight pending attempt
    const latest = this.invoiceService.getLatestInvoiceByOrderId(orderId);
    if (latest && latest.status === 'pending') {
      this.logger.log(`Standard invoice pending for order ${orderId}`);
      return this.buildResultFromRow(latest, 'PENDING');
    }

    // 3. If latest is error, do NOT auto-retry — caller must retry explicitly
    if (latest && latest.status === 'error') {
      this.logger.log(
        `Standard invoice has error status for order ${orderId} — returning existing; call retryClearance() to retry`,
      );
      return this.buildResultFromRow(latest, 'ERROR');
    }

    // 4. New attempt (rejected or none)
    return this.attemptClearance(orderId, userId);
  }

  /**
   * Retry clearance for an invoice that is in `error` status (network/credentials).
   * Resubmits the same payload (same UUID/ICV/Hash/XML).
   */
  async retryClearance(orderId: number, userId?: number): Promise<CreateStandardInvoiceResult> {
    if (userId === undefined) userId = 1;

    const latest = this.invoiceService.getLatestInvoiceByOrderId(orderId);
    if (!latest) {
      throw new Error(`No invoice found for order ${orderId}`);
    }

    if (latest.status !== 'error') {
      throw new Error(
        `Cannot retry clearance for order ${orderId}: latest status is '${latest.status}', not 'error'`,
      );
    }

    const now = Math.floor(Date.now() / 1000);

    // Resubmit the same payload
    const clearance = await this.clearanceService.clearDocument({
      invoiceHash: latest.invoiceHash,
      uuid: latest.uuid,
      xml: latest.xml,
    });

    const { storeStatus, storedXml, clearanceErrors, clearanceWarnings } =
      this.evaluateClearanceResult(clearance, latest.xml);

    // Update status AND emit burn event in a transaction when rejected
    const updated = this.db.transaction((tx: any) => {
      tx.update(zatcaInvoices)
        .set({
          status: storeStatus,
          xml: storedXml,
          clearanceErrors: clearanceErrors ?? null,
          clearanceWarnings: clearanceWarnings ?? null,
          httpStatus: clearance.httpStatus,
          reportedAt: storeStatus === 'cleared' ? now : latest.reportedAt,
          updatedAt: now,
        } as any)
        .where(eq(zatcaInvoices.id, latest.id))
        .run();

      // On business rejection: append immutable burn event and rotate document_id
      if (storeStatus === 'rejected') {
        // Read the order to get the current document_id (which was in the retried XML).
        // Since retry is only allowed from 'error' status, the document_id has NOT been
        // rotated yet — so the current order.document_id matches the XML.
        const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
        if (!order?.documentId) {
          throw new Error(`Order ${orderId} is missing document_id`);
        }
        const burnedDocumentId = order.documentId;

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'zatca_clearance_rejected',
          {
            documentKind: 'invoice',
            zatcaRecordId: latest.id,
            attemptNo: latest.attemptNo || 1,
            icv: latest.icv,
            uuid: latest.uuid,
            cbcId: burnedDocumentId,
            documentId: burnedDocumentId,
            orderId,
            httpStatus: clearance.httpStatus,
            errors: clearance.errors,
          },
          now,
        );

        // Rotate document_id for the next reissue
        const newDocumentId = this.documentIdService.allocateInvoiceDocumentId(tx);
        tx.update(orders)
          .set({ documentId: newDocumentId, updatedAt: now })
          .where(eq(orders.id, orderId))
          .run();
      }

      // On cleared: append immutable approval event for the accepted document.
      // document_id was never rotated on this path, so the current
      // order.document_id matches the one accepted by ZATCA.
      if (storeStatus === 'cleared') {
        const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
        if (!order?.documentId) {
          throw new Error(`Order ${orderId} is missing document_id`);
        }
        const acceptedDocumentId = order.documentId;

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'zatca_clearance_approved',
          {
            documentKind: 'invoice',
            zatcaRecordId: latest.id,
            attemptNo: latest.attemptNo || 1,
            icv: latest.icv,
            uuid: latest.uuid,
            cbcId: acceptedDocumentId,
            documentId: acceptedDocumentId,
            orderId,
            httpStatus: clearance.httpStatus,
            warnings: clearance.warnings,
          },
          now,
        );
      }

      return tx.select().from(zatcaInvoices).where(eq(zatcaInvoices.id, latest.id)).get() as any;
    });

    this.logger.log(`Standard invoice retry for order ${orderId}: status=${storeStatus}`);

    // Emit cleared event if cleared on retry
    if (storeStatus === 'cleared') {
      this.emitDomainEvent('zatca.invoice.cleared', orderId, userId, { invoiceId: latest.id });
    }

    return this.buildResultFromRow(updated, clearance.status);
  }

  /**
   * Reissue a standard invoice after rejection — creates a new attempt with new ICV/UUID.
   * Optionally updates buyer details on the order before reissuing.
   */
  async reissue(
    orderId: number,
    userId?: number,
    buyerDetails?: Record<string, unknown>,
  ): Promise<CreateStandardInvoiceResult> {
    if (userId === undefined) userId = 1;

    // Validate that we can reissue
    const latest = this.invoiceService.getLatestInvoiceByOrderId(orderId);
    const cleared = this.invoiceService.getClearedInvoiceByOrderId(orderId);

    if (cleared) {
      throw new Error(`Cannot reissue: order ${orderId} already has a cleared invoice`);
    }

    if (!latest) {
      throw new Error(`No invoice found for order ${orderId}`);
    }

    if (latest.status !== 'rejected') {
      throw new Error(
        `Cannot reissue: latest attempt for order ${orderId} is '${latest.status}', not 'rejected'`,
      );
    }

    // Update buyer details if provided
    if (buyerDetails) {
      const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new Error(`Order ${orderId} not found`);

      // Validate buyer details
      const parsed = parseZatcaBuyerDetails(buyerDetails);
      if (!parsed.success) {
        // Log field names only (no values) for debugging
        const fields = parsed.error.issues.map((i: any) => String(i.path[i.path.length - 1]));
        this.logger.warn(
          `Invalid buyer details for reissue (order ${orderId}): [${fields.join(', ')}]`,
        );
        throw new Error('Invalid buyer details provided for reissue', { cause: parsed.error });
      }

      this.db
        .update(orders)
        .set({
          zatcaBuyerDetails: JSON.stringify(parsed.data),
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(orders.id, orderId))
        .run();
    }

    // Create a new attempt
    return this.attemptClearance(orderId, userId);
  }

  // ── Credit note lifecycle (retry / reissue) ──────────────────────────

  /**
   * Get the ZATCA credit note status for a refund (used by polling API/POS).
   */
  getCreditNoteStatus(orderId: number, refundId: number): ZatcaInvoiceStatusResponse {
    const order = this.db
      .select({ isStandardInvoice: orders.isStandardInvoice })
      .from(orders)
      .where(eq(orders.id, orderId))
      .get();

    if (!order) {
      return {
        invoiceType: 'none',
        current: null,
        attempts: [],
        canRetryClearance: false,
        canReissue: false,
      };
    }

    if (order.isStandardInvoice !== 1) {
      return {
        invoiceType: 'simplified',
        current: null,
        attempts: [],
        canRetryClearance: false,
        canReissue: false,
      };
    }

    const cleared = this.invoiceService.getClearedCreditNoteByRefundId(refundId);
    const attempts = this.invoiceService.listCreditNotesByRefundId(refundId);
    const attemptMapped = attempts.map((r) => this.attemptFromRow(r));
    const current = cleared
      ? this.attemptFromRow(cleared)
      : attemptMapped.length > 0
        ? attemptMapped[attemptMapped.length - 1]
        : null;

    const latest = attempts.length > 0 ? attempts[attempts.length - 1] : null;
    const canRetryClearance = latest?.status === 'error' || false;
    const canReissue = !cleared && latest?.status === 'rejected';

    return {
      invoiceType: 'standard',
      current,
      attempts: attemptMapped,
      canRetryClearance,
      canReissue,
    };
  }

  /**
   * Retry clearance for a credit note that is in `error` status (network/credentials).
   * Resubmits the same payload (same UUID/ICV/Hash/XML).
   */
  async retryCreditNoteClearance(
    orderId: number,
    refundId: number,
    userId?: number,
  ): Promise<CreateStandardInvoiceResult> {
    if (userId === undefined) userId = 1;

    const latest = this.invoiceService.getLatestCreditNoteByRefundId(refundId);
    if (!latest) {
      throw new Error(`No credit note found for refund ${refundId} on order ${orderId}`);
    }

    if (latest.status !== 'error') {
      throw new Error(
        `Cannot retry clearance for refund ${refundId}: latest status is '${latest.status}', not 'error'`,
      );
    }

    const now = Math.floor(Date.now() / 1000);

    // Resubmit the same payload
    const clearance = await this.clearanceService.clearDocument({
      invoiceHash: latest.invoiceHash,
      uuid: latest.uuid,
      xml: latest.xml,
    });

    const { storeStatus, storedXml, clearanceErrors, clearanceWarnings } =
      this.evaluateClearanceResult(clearance, latest.xml);

    // Update status AND emit burn event in a transaction when rejected
    const updated = this.db.transaction((tx: any) => {
      tx.update(zatcaCreditNotes)
        .set({
          status: storeStatus,
          xml: storedXml,
          clearanceErrors: clearanceErrors ?? null,
          clearanceWarnings: clearanceWarnings ?? null,
          httpStatus: clearance.httpStatus,
          reportedAt: storeStatus === 'cleared' ? now : latest.reportedAt,
          updatedAt: now,
        } as any)
        .where(eq(zatcaCreditNotes.id, latest.id))
        .run();

      // On business rejection: append immutable burn event and rotate refund document_id
      if (storeStatus === 'rejected') {
        // Read the refund to get the current document_id (which was in the retried XML).
        // Since retry is only allowed from 'error' status, the document_id has NOT been
        // rotated yet — so the current refund.document_id matches the XML.
        const refund = tx.select().from(orderRefunds).where(eq(orderRefunds.id, refundId)).get();
        if (!refund?.documentId) {
          throw new Error(`Refund ${refundId} is missing document_id`);
        }
        const burnedDocumentId = refund.documentId;

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'zatca_clearance_rejected',
          {
            documentKind: 'credit_note',
            zatcaRecordId: latest.id,
            attemptNo: latest.attemptNo || 1,
            icv: latest.icv,
            uuid: latest.uuid,
            cbcId: burnedDocumentId,
            documentId: burnedDocumentId,
            orderId,
            refundId,
            httpStatus: clearance.httpStatus,
            errors: clearance.errors,
          },
          now,
        );

        // Rotate refund document_id for the next reissue
        const newDocumentId = this.documentIdService.allocateRefundDocumentId(tx);
        tx.update(orderRefunds)
          .set({ documentId: newDocumentId, updatedAt: now })
          .where(eq(orderRefunds.id, refundId))
          .run();
      }

      // On cleared: append immutable approval event for the accepted document.
      // The refund document_id was never rotated on this path, so the current
      // refund.document_id matches the one accepted by ZATCA.
      if (storeStatus === 'cleared') {
        const refund = tx.select().from(orderRefunds).where(eq(orderRefunds.id, refundId)).get();
        if (!refund?.documentId) {
          throw new Error(`Refund ${refundId} is missing document_id`);
        }
        const acceptedDocumentId = refund.documentId;

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'zatca_clearance_approved',
          {
            documentKind: 'credit_note',
            zatcaRecordId: latest.id,
            attemptNo: latest.attemptNo || 1,
            icv: latest.icv,
            uuid: latest.uuid,
            cbcId: acceptedDocumentId,
            documentId: acceptedDocumentId,
            orderId,
            refundId,
            httpStatus: clearance.httpStatus,
            warnings: clearance.warnings,
          },
          now,
        );
      }

      return tx
        .select()
        .from(zatcaCreditNotes)
        .where(eq(zatcaCreditNotes.id, latest.id))
        .get() as any;
    });

    this.logger.log(`Credit note retry for refund ${refundId}: status=${storeStatus}`);

    // Emit cleared event if cleared on retry
    if (storeStatus === 'cleared') {
      this.emitDomainEvent('zatca.credit_note.cleared', orderId, userId, {
        creditNoteId: latest.id,
        refundId,
      });
    }

    return this.buildResultFromRow(updated, clearance.status);
  }

  /**
   * Reissue a credit note after rejection — creates a new attempt with new ICV/UUID.
   * No buyer edit for credit notes.
   */
  async reissueCreditNote(
    orderId: number,
    refundId: number,
    userId?: number,
  ): Promise<CreateStandardInvoiceResult> {
    if (userId === undefined) userId = 1;

    // Validate that we can reissue
    const latest = this.invoiceService.getLatestCreditNoteByRefundId(refundId);
    const cleared = this.invoiceService.getClearedCreditNoteByRefundId(refundId);

    if (cleared) {
      throw new Error(`Cannot reissue: refund ${refundId} already has a cleared credit note`);
    }

    if (!latest) {
      throw new Error(`No credit note found for refund ${refundId} on order ${orderId}`);
    }

    if (latest.status !== 'rejected') {
      throw new Error(
        `Cannot reissue: latest credit note for refund ${refundId} is '${latest.status}', not 'rejected'`,
      );
    }

    // Create a new attempt (no buyer body for credit notes)
    return this.attemptCreditNoteClearance(orderId, refundId, userId);
  }

  /**
   * Get the ZATCA invoice status for an order (used by polling API/POS).
   */
  getInvoiceStatus(orderId: number): ZatcaInvoiceStatusResponse {
    const order = this.db
      .select({ isStandardInvoice: orders.isStandardInvoice })
      .from(orders)
      .where(eq(orders.id, orderId))
      .get();

    if (!order) {
      return {
        invoiceType: 'none',
        current: null,
        attempts: [],
        canRetryClearance: false,
        canReissue: false,
      };
    }

    if (order.isStandardInvoice !== 1) {
      // Simplified — check if there's a simplified invoice
      const simplified = this.invoiceService.getLatestInvoiceByOrderId(orderId);
      if (simplified && (simplified.status === 'signed' || simplified.status === 'reported')) {
        return {
          invoiceType: 'simplified',
          current: this.attemptFromRow(simplified),
          attempts: [this.attemptFromRow(simplified)],
          canRetryClearance: false,
          canReissue: false,
        };
      }
      return {
        invoiceType: 'simplified',
        current: null,
        attempts: [],
        canRetryClearance: false,
        canReissue: false,
      };
    }

    // Standard
    const cleared = this.invoiceService.getClearedInvoiceByOrderId(orderId);
    const attempts = this.listInvoiceAttempts(orderId);
    const current = cleared
      ? this.attemptFromRow(cleared)
      : attempts.length > 0
        ? this.attemptFromRow(attempts[attempts.length - 1])
        : null;

    const latest = attempts.length > 0 ? attempts[attempts.length - 1] : null;
    const canRetryClearance = latest?.status === 'error' || false;
    const canReissue = !cleared && latest?.status === 'rejected';

    return {
      invoiceType: 'standard',
      current,
      attempts: attempts.map((r) => this.attemptFromRow(r)),
      canRetryClearance,
      canReissue,
    };
  }

  // ── Event listeners ─────────────────────────────────────────────────────

  @OnEvent('order.paid')
  async onOrderPaid(payload: { orderId: number; userId: number }): Promise<void> {
    try {
      const order = this.db
        .select({ isStandardInvoice: orders.isStandardInvoice })
        .from(orders)
        .where(eq(orders.id, payload.orderId))
        .get();
      if (!order || order.isStandardInvoice !== 1) return;

      const latest = this.invoiceService.getLatestInvoiceByOrderId(payload.orderId);
      // Don't auto-create on error (stuck state) — POS/API must call retry/reissue
      if (latest && (latest.status === 'error' || latest.status === 'pending')) {
        return;
      }

      await this.createStandardInvoice(payload.orderId, payload.userId);
    } catch (err: any) {
      this.logger.error(
        `Failed to create standard invoice for order ${payload.orderId}: ${err.message}`,
      );
    }
  }

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

      const latest = this.invoiceService.getLatestCreditNoteByRefundId(payload.refundId);
      if (latest && (latest.status === 'error' || latest.status === 'pending')) {
        return;
      }

      await this.createStandardCreditNote(payload.orderId, payload.refundId, payload.userId);
    } catch (err: any) {
      this.logger.error(
        `Failed to create standard credit note for refund ${payload.refundId}: ${err.message}`,
      );
    }
  }

  // ── Credit note ─────────────────────────────────────────────────────────

  async createStandardCreditNote(
    orderId: number,
    refundId: number,
    userId?: number,
  ): Promise<CreateStandardInvoiceResult> {
    if (userId === undefined) userId = 1;

    // Idempotency: check for cleared credit note
    const cleared = this.invoiceService.getClearedCreditNoteByRefundId(refundId);
    if (cleared) {
      this.logger.log(`Credit note already cleared for refund ${refundId}`);
      return this.buildResultFromRow(cleared, 'CLEARED');
    }

    // Check for pending
    const latest = this.invoiceService.getLatestCreditNoteByRefundId(refundId);
    if (latest && latest.status === 'pending') {
      this.logger.log(`Credit note pending for refund ${refundId}`);
      return this.buildResultFromRow(latest, 'PENDING');
    }

    // Error → don't auto-retry
    if (latest && latest.status === 'error') {
      this.logger.log(
        `Credit note has error status for refund ${refundId} — returning existing; call retryCreditNoteClearance() to retry`,
      );
      return this.buildResultFromRow(latest, 'ERROR');
    }

    return this.attemptCreditNoteClearance(orderId, refundId, userId);
  }

  // ── Private: clearance attempt ───────────────────────────────────────────

  private async attemptClearance(
    orderId: number,
    userId: number,
  ): Promise<CreateStandardInvoiceResult> {
    const now = Math.floor(Date.now() / 1000);

    // Load the order
    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    if (order.isStandardInvoice !== 1) {
      throw new Error(`Order ${orderId} is not a standard invoice`);
    }

    // Validate buyer fields
    this.validateBuyerFields(order);

    // Load order items
    const oiRows = this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
    if (oiRows.length === 0) {
      throw new Error(`Order ${orderId} has no items`);
    }

    // Determine attempt number
    const allAttempts = this.listInvoiceAttempts(orderId);
    const attemptNo =
      allAttempts.length > 0 ? Math.max(...allAttempts.map((a) => a.attemptNo || 1)) + 1 : 1;

    // Build seller config
    const seller = this.buildSellerConfig();

    // Load keys
    const env = this.getEnv();
    const orgUnit = this.getOrgUnit();
    const privateKeyHex = this.getPrivateKey(env, orgUnit);
    if (!privateKeyHex) {
      throw new Error('ZATCA private key not configured. Run onboarding first.');
    }
    const certBase64 = this.getCertificate(env, orgUnit);

    // Build items
    const invItems: InvoiceItemInput[] = oiRows.map((oi) => ({
      name: oi.itemName,
      unitPriceHalalas: oi.unitPriceHalalas,
      vatRateBp: oi.vatRateBp,
      qty: oi.qty,
    }));

    // Timestamps
    const issueDate = new Date(now * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Riyadh' });
    const issueTime = new Date(now * 1000).toLocaleTimeString('sv-SE', {
      timeZone: 'Asia/Riyadh',
      hour12: false,
    });

    // documentId must exist BEFORE the write transaction — a missing ID is
    // a fail-fast that must never consume an ICV.
    if (!order.documentId) {
      throw new Error(`Order ${orderId} is missing document_id`);
    }

    // One cac:PaymentMeans block per NETTED payment method (BT-81 1..n) —
    // multi-line/correction payments are summed per methodId inside
    // buildInvoicePaymentMeans; zero/negative nets are dropped. Sorted by
    // methodId; empty fallback handled by the XML builder.
    const paymentRows = this.db
      .select()
      .from(orderPayments)
      .where(eq(orderPayments.orderId, orderId))
      .all();

    const invUuid = require('crypto').randomUUID();

    // ── Single atomic transaction: allocate ICV + build + sign + insert ──
    // The `last_icv` settings bump and the zatca_invoices row commit
    // together. The clearance API call stays AFTER this transaction commits
    // (a pending row is intentionally burned before calling ZATCA).
    const { invoiceId, icv, finalInvoiceHash, finalSignedXml } = this.db.transaction((tx: any) => {
      // Allocate ICV atomically
      const { icv, prevInvoiceHash } = this.invoiceService.allocateNextIcv(tx, env, orgUnit);

      const xmlInput: InvoiceXMLInput = {
        documentId: order.documentId,
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
        paymentMeans: buildInvoicePaymentMeans(
          paymentRows.map((p) => ({
            methodId: p.methodId,
            methodTitle: p.methodTitle,
            amountHalalas: p.amountHalalas,
            zatcaPaymentMeansCode: p.zatcaPaymentMeansCode,
          })),
        ),
      };
      const unsignedXml = buildUnsignedInvoiceXML(xmlInput);

      // Sign
      const invoiceHashB64 = computeInvoiceHash(unsignedXml);
      const invoiceHashHex = computeInvoiceHashHex(unsignedXml);
      const signatureB64 = signHashBase64(invoiceHashHex, privateKeyHex);
      const certForXml = Buffer.from(certBase64, 'base64').toString('utf-8');
      const signedXml = embedSignatureIntoXML(
        unsignedXml,
        invoiceHashB64,
        signatureB64,
        certForXml,
      );

      // QR TLV
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

      const finalSignedXml = injectQrIntoXml(signedXml, qrTlvBase64);
      const finalInvoiceHash = invoiceHashB64;

      // INSERT row with status=pending FIRST (ICV burned, XML stored) —
      // same transaction as the ICV allocation
      const insertResult = tx
        .insert(zatcaInvoices)
        .values({
          orderId,
          icv,
          uuid: invUuid,
          documentId: order.documentId,
          invoiceHash: finalInvoiceHash,
          prevInvoiceHash,
          xml: finalSignedXml,
          qrTlv: qrTlvBase64,
          status: 'pending',
          attemptNo,
          reportedAt: null,
          ...createAuditFields(userId, now),
        } as any)
        .run();
      const invoiceId = Number(insertResult.lastInsertRowid);

      return { invoiceId, icv, finalInvoiceHash, finalSignedXml, qrTlvBase64 };
    });

    // Call clearance API
    const clearance = await this.clearanceService.clearDocument({
      invoiceHash: finalInvoiceHash,
      uuid: invUuid,
      xml: finalSignedXml,
    });

    // Evaluate result and update
    const { storeStatus, storedXml, clearanceErrors, clearanceWarnings } =
      this.evaluateClearanceResult(clearance, finalSignedXml);

    // Update status AND emit burn event in a transaction when rejected
    const updatedRow = this.db.transaction((tx: any) => {
      tx.update(zatcaInvoices)
        .set({
          status: storeStatus,
          xml: storedXml,
          clearanceErrors: clearanceErrors ?? null,
          clearanceWarnings: clearanceWarnings ?? null,
          httpStatus: clearance.httpStatus,
          reportedAt: storeStatus === 'cleared' ? now : null,
          updatedAt: now,
        } as any)
        .where(eq(zatcaInvoices.id, invoiceId))
        .run();

      // On business rejection: append immutable burn event and rotate document_id
      if (storeStatus === 'rejected') {
        // Capture the burned document_id from the in-scope order variable
        // (the same value that was signed into the XML). Do NOT re-read from
        // the DB — the order reference was read before the transaction and
        // holds the value that was in the submitted UBL cbc:ID.
        const burnedDocumentId = order.documentId;

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'zatca_clearance_rejected',
          {
            documentKind: 'invoice',
            zatcaRecordId: invoiceId,
            attemptNo,
            icv,
            uuid: invUuid,
            cbcId: burnedDocumentId,
            documentId: burnedDocumentId,
            orderId,
            httpStatus: clearance.httpStatus,
            errors: clearance.errors,
          },
          now,
        );

        // Rotate document_id: allocate new ID and update the order so the next
        // reissue gets a fresh invoice number as root cbc:ID.
        const newDocumentId = this.documentIdService.allocateInvoiceDocumentId(tx);
        tx.update(orders)
          .set({ documentId: newDocumentId, updatedAt: now })
          .where(eq(orders.id, orderId))
          .run();
      }

      // On cleared: append immutable approval event for the accepted document.
      // The in-scope order variable holds the document_id that was signed
      // into the XML (cleared does NOT rotate it).
      if (storeStatus === 'cleared') {
        const acceptedDocumentId = order.documentId;

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'zatca_clearance_approved',
          {
            documentKind: 'invoice',
            zatcaRecordId: invoiceId,
            attemptNo,
            icv,
            uuid: invUuid,
            cbcId: acceptedDocumentId,
            documentId: acceptedDocumentId,
            orderId,
            httpStatus: clearance.httpStatus,
            warnings: clearance.warnings,
          },
          now,
        );
      }

      return tx.select().from(zatcaInvoices).where(eq(zatcaInvoices.id, invoiceId)).get() as any;
    });

    this.logger.log(
      `Standard invoice attempt ${attemptNo} for order ${orderId}: status=${storeStatus}, ICV=${icv}`,
    );

    // Emit cleared event
    if (storeStatus === 'cleared') {
      this.emitDomainEvent('zatca.invoice.cleared', orderId, userId, { invoiceId });
    }

    return this.buildResultFromRow(updatedRow, clearance.status);
  }

  private async attemptCreditNoteClearance(
    orderId: number,
    refundId: number,
    userId: number,
  ): Promise<CreateStandardInvoiceResult> {
    // Load original cleared invoice
    const originalInvoice = this.invoiceService.getClearedInvoiceByOrderId(orderId);
    if (!originalInvoice) {
      throw new Error(`No cleared original invoice found for order ${orderId}`);
    }

    const order = this.db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new Error(`Order ${orderId} not found`);

    if (order.isStandardInvoice !== 1) {
      throw new Error(`Order ${orderId} is not a standard invoice`);
    }

    const refund = this.db.select().from(orderRefunds).where(eq(orderRefunds.id, refundId)).get();
    if (!refund) throw new Error(`Refund ${refundId} not found`);

    const refundItems = this.db
      .select()
      .from(orderRefundItems)
      .where(eq(orderRefundItems.refundId, refundId))
      .all();

    // Compute totals
    let vatHalalas = 0;
    let totalHalalas = 0;
    for (const ri of refundItems) {
      const lineTotal = ri.unitPriceHalalas * ri.qty;
      totalHalalas += lineTotal;
      const decomposed = decomposeVat(lineTotal, ri.vatRateBp);
      vatHalalas += decomposed.vatHalalas;
    }

    // Determine attempt number
    const allAttempts = this.invoiceService.listCreditNotesByRefundId(refundId);
    const attemptNo =
      allAttempts.length > 0 ? Math.max(...allAttempts.map((a) => a.attemptNo || 1)) + 1 : 1;

    const seller = this.buildSellerConfig();
    const env = this.getEnv();
    const orgUnit = this.getOrgUnit();
    const privateKeyHex = this.getPrivateKey(env, orgUnit);
    if (!privateKeyHex) throw new Error('ZATCA private key not configured.');
    const certBase64 = this.getCertificate(env, orgUnit);

    const invItems: InvoiceItemInput[] = refundItems.map((ri) => ({
      name: ri.itemName,
      unitPriceHalalas: ri.unitPriceHalalas,
      vatRateBp: ri.vatRateBp,
      qty: ri.qty,
    }));

    const now = Math.floor(Date.now() / 1000);
    const issueDate = new Date(now * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Riyadh' });
    const issueTime = new Date(now * 1000).toLocaleTimeString('sv-SE', {
      timeZone: 'Asia/Riyadh',
      hour12: false,
    });

    // documentId must exist BEFORE the write transaction — a missing ID is
    // a fail-fast that must never consume an ICV.
    if (!refund.documentId) {
      throw new Error(`Refund ${refundId} is missing document_id`);
    }

    const invUuid = require('crypto').randomUUID();

    // ── Single atomic transaction: allocate ICV + build + sign + insert ──
    // The `last_icv` settings bump and the zatca_credit_notes row commit
    // together. The clearance API call stays AFTER this transaction commits
    // (a pending row is intentionally burned before calling ZATCA).
    const { cnId, icv, finalInvoiceHash, finalSignedXml } = this.db.transaction((tx: any) => {
      const { icv, prevInvoiceHash } = this.invoiceService.allocateNextIcv(tx, env, orgUnit);

      const xmlInput: InvoiceXMLInput = {
        type: 'credit_note',
        documentId: refund.documentId,
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
        // Single block from the refund tender: KSA-10 reason + method snapshot
        paymentMeans: buildCreditNotePaymentMeans({
          methodId: refund.methodId,
          methodTitle: refund.methodTitle,
          zatcaPaymentMeansCode: refund.zatcaPaymentMeansCode,
          reason: refund.reason || 'Refund',
          amountHalalas: refund.totalHalalas,
        }),
      };

      const unsignedXml = buildUnsignedInvoiceXML(xmlInput);
      const invoiceHashB64 = computeInvoiceHash(unsignedXml);
      const invoiceHashHex = computeInvoiceHashHex(unsignedXml);
      const signatureB64 = signHashBase64(invoiceHashHex, privateKeyHex);
      const certForXml = Buffer.from(certBase64, 'base64').toString('utf-8');
      const signedXml = embedSignatureIntoXML(
        unsignedXml,
        invoiceHashB64,
        signatureB64,
        certForXml,
      );

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
      const finalSignedXml = injectQrIntoXml(signedXml, qrTlvBase64);
      const finalInvoiceHash = invoiceHashB64;

      // INSERT pending row — same transaction as the ICV allocation
      const insertResult = tx
        .insert(zatcaCreditNotes)
        .values({
          orderId,
          refundId,
          relatedInvoiceUuid: originalInvoice.uuid,
          icv,
          uuid: invUuid,
          documentId: refund.documentId,
          invoiceHash: finalInvoiceHash,
          prevInvoiceHash,
          xml: finalSignedXml,
          qrTlv: qrTlvBase64,
          status: 'pending',
          attemptNo,
          reportedAt: null,
          totalHalalas,
          vatHalalas,
          reason: refund.reason || 'Refund',
          ...createAuditFields(userId, now),
        } as any)
        .run();
      const cnId = Number(insertResult.lastInsertRowid);

      return { cnId, icv, finalInvoiceHash, finalSignedXml, qrTlvBase64 };
    });

    // Clearance
    const clearance = await this.clearanceService.clearDocument({
      invoiceHash: finalInvoiceHash,
      uuid: invUuid,
      xml: finalSignedXml,
    });

    const { storeStatus, storedXml, clearanceErrors, clearanceWarnings } =
      this.evaluateClearanceResult(clearance, finalSignedXml);

    // Update status AND emit burn event in a transaction when rejected
    const updatedRow = this.db.transaction((tx: any) => {
      tx.update(zatcaCreditNotes)
        .set({
          status: storeStatus,
          xml: storedXml,
          clearanceErrors: clearanceErrors ?? null,
          clearanceWarnings: clearanceWarnings ?? null,
          httpStatus: clearance.httpStatus,
          reportedAt: storeStatus === 'cleared' ? now : null,
          updatedAt: now,
        } as any)
        .where(eq(zatcaCreditNotes.id, cnId))
        .run();

      // On business rejection: append immutable burn event and rotate refund document_id
      if (storeStatus === 'rejected') {
        // Capture the burned document_id from the in-scope refund variable
        // (the same value that was signed into the XML). Do NOT re-read from
        // the DB — the refund reference was read before the transaction and
        // holds the value that was in the submitted UBL cbc:ID.
        const burnedDocumentId = refund.documentId;

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'zatca_clearance_rejected',
          {
            documentKind: 'credit_note',
            zatcaRecordId: cnId,
            attemptNo,
            icv,
            uuid: invUuid,
            cbcId: burnedDocumentId,
            documentId: burnedDocumentId,
            orderId,
            refundId,
            httpStatus: clearance.httpStatus,
            errors: clearance.errors,
          },
          now,
        );

        // Rotate refund document_id for the next reissue
        const newDocumentId = this.documentIdService.allocateRefundDocumentId(tx);
        tx.update(orderRefunds)
          .set({ documentId: newDocumentId, updatedAt: now })
          .where(eq(orderRefunds.id, refundId))
          .run();
      }

      // On cleared: append immutable approval event for the accepted document.
      // The in-scope refund variable holds the document_id that was signed
      // into the XML (cleared does NOT rotate it).
      if (storeStatus === 'cleared') {
        const acceptedDocumentId = refund.documentId;

        this.orderEvents.createEvent(
          tx,
          orderId,
          userId,
          'zatca_clearance_approved',
          {
            documentKind: 'credit_note',
            zatcaRecordId: cnId,
            attemptNo,
            icv,
            uuid: invUuid,
            cbcId: acceptedDocumentId,
            documentId: acceptedDocumentId,
            orderId,
            refundId,
            httpStatus: clearance.httpStatus,
            warnings: clearance.warnings,
          },
          now,
        );
      }

      return tx.select().from(zatcaCreditNotes).where(eq(zatcaCreditNotes.id, cnId)).get() as any;
    });

    if (storeStatus === 'cleared') {
      this.emitDomainEvent('zatca.credit_note.cleared', orderId, userId, {
        creditNoteId: cnId,
        refundId,
      });
    }

    return this.buildResultFromRow(updatedRow, clearance.status);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private evaluateClearanceResult(
    clearance: ZatcaClearanceResult,
    signedXml: string,
  ): {
    storeStatus: string;
    storedXml: string;
    clearanceErrors: string | null;
    clearanceWarnings: string | null;
  } {
    switch (clearance.status) {
      case 'CLEARED':
        return {
          storeStatus: 'cleared',
          storedXml: clearance.clearedXml || signedXml,
          clearanceErrors: null,
          clearanceWarnings:
            clearance.warnings.length > 0 ? JSON.stringify(clearance.warnings) : null,
        };
      case 'REJECTED':
        return {
          storeStatus: 'rejected',
          storedXml: signedXml,
          clearanceErrors: JSON.stringify(clearance.errors),
          clearanceWarnings: null,
        };
      case 'ERROR':
      case 'NO_CREDENTIALS':
        return {
          storeStatus: 'error',
          storedXml: signedXml,
          clearanceErrors: JSON.stringify(clearance.errors),
          clearanceWarnings: null,
        };
      default:
        return {
          storeStatus: 'error',
          storedXml: signedXml,
          clearanceErrors: JSON.stringify(['Unknown clearance status']),
          clearanceWarnings: null,
        };
    }
  }

  private buildResultFromRow(row: any, _clearanceStatus: string): CreateStandardInvoiceResult {
    let errors: string[] = [];
    let warnings: string[] = [];
    try {
      errors = row.clearanceErrors ? JSON.parse(row.clearanceErrors) : [];
    } catch {}
    try {
      warnings = row.clearanceWarnings ? JSON.parse(row.clearanceWarnings) : [];
    } catch {}

    return {
      id: row.id,
      icv: row.icv,
      uuid: row.uuid,
      invoiceHash: row.invoiceHash,
      status: row.status,
      attemptNo: row.attemptNo || 1,
      qrTlvBase64: row.qrTlv,
      signedXml: row.xml,
      clearance: {
        status:
          row.status === 'cleared'
            ? 'CLEARED'
            : row.status === 'rejected'
              ? 'REJECTED'
              : row.status === 'error'
                ? 'ERROR'
                : 'PENDING',
        httpStatus: row.httpStatus ?? 0,
        clearedXml: row.status === 'cleared' ? row.xml : null,
        clearedInvoiceBase64: null,
        warnings,
        errors,
        rawBody: null,
      },
    };
  }

  private listInvoiceAttempts(orderId: number): any[] {
    return this.db
      .select()
      .from(zatcaInvoices)
      .where(eq(zatcaInvoices.orderId, orderId))
      .orderBy(zatcaInvoices.id)
      .all();
  }

  private attemptFromRow(row: any): ZatcaInvoiceAttempt {
    let errors: string[] = [];
    let warnings: string[] = [];
    try {
      errors = row.clearanceErrors ? JSON.parse(row.clearanceErrors) : [];
    } catch {}
    try {
      warnings = row.clearanceWarnings ? JSON.parse(row.clearanceWarnings) : [];
    } catch {}

    return {
      id: row.id,
      attemptNo: row.attemptNo || 1,
      status: row.status,
      icv: row.icv,
      uuid: row.uuid,
      errors,
      warnings,
      httpStatus: row.httpStatus ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private emitDomainEvent(
    event: string,
    orderId: number,
    userId: number,
    extra?: Record<string, unknown>,
  ): void {
    try {
      this.eventEmitter.emit(event, { orderId, userId, ...extra });
    } catch {
      // Swallow
    }
  }

  private validateBuyerFields(order: Record<string, any>): void {
    try {
      requireZatcaBuyerDetails(order.zatcaBuyerDetails);
    } catch (err: any) {
      // Log field names only (no values) for debugging
      if (err.issues) {
        const fields = err.issues.map((i: any) => String(i.path[i.path.length - 1]));
        this.logger.warn(
          `Order ${order.id} is a standard invoice but buyer details are missing or invalid: [${fields.join(', ')}]`,
        );
      }
      throw new Error(
        `Order ${order.id} is a standard invoice but buyer details are missing or invalid`,
        { cause: err },
      );
    }
  }

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
    return requireZatcaBuyerDetails(order.zatcaBuyerDetails);
  }

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
