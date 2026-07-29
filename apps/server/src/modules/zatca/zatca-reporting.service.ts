/**
 * ZATCA Reporting Service — background worker that reports signed invoices
 * and credit notes to the ZATCA reporting API.
 *
 * The worker polls the zatca_invoices and zatca_credit_notes tables every
 * N minutes (default 5) and POSTs documents with status 'signed' or 'failed'
 * (retry) to the ZATCA reporting API.
 *
 * On success: status → 'reported', reportedAt set.
 * On failure: status → 'failed', error logged.
 *
 * Manual retry: POST /zatca/reporting/retry triggers immediate attempt.
 */

import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { asc, eq, or } from 'drizzle-orm';
import { zatcaInvoices, zatcaCreditNotes } from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { PrintersService } from '../printers/printers.service';
import { ZatcaHttpService } from './zatca-http.service';
import { slugifyOrgUnit, zatcaKey } from '@spicyhome/shared';
import type { ZATCAEnvironment } from '@spicyhome/shared';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

type DocumentKind = 'invoice' | 'credit_note';

interface ReportableDocument {
  id: number;
  icv: number;
  uuid: string;
  invoiceHash: string;
  xml: string;
  kind: DocumentKind;
}

@Injectable()
export class ZatcaReportingService implements OnModuleInit {
  private readonly logger = new Logger(ZatcaReportingService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_INTERVAL_MS: number;

  constructor(
    @Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>,
    private httpClient: ZatcaHttpService,
    private printersService: PrintersService,
  ) {
    const intervalMin = parseInt(process.env.ZATCA_REPORTING_INTERVAL_MIN || '5', 10);
    this.POLL_INTERVAL_MS = Math.max(intervalMin, 1) * 60000;
  }

  onModuleInit(): void {
    // Skip auto-polling in test environment
    if (process.env.NODE_ENV !== 'test' && process.env.JEST_WORKER_ID === undefined) {
      this.schedulePolling();
    }
  }

  /**
   * Start the background polling timer.
   */
  schedulePolling(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processQueue().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        this.logger.error(`Reporting queue tick failed: ${message}`, stack);
      });
    }, this.POLL_INTERVAL_MS);
    this.logger.log(`Reporting worker started (interval: ${this.POLL_INTERVAL_MS}ms)`);
  }

  /**
   * Stop the polling timer (for tests / cleanup).
   */
  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Manually trigger reporting for all pending documents (invoices + credit notes),
   * a specific invoice by ID, or a specific credit note by ID.
   *
   * If both invoiceId and creditNoteId are provided, invoice takes precedence.
   * If neither is provided, runs processQueue() for all pending documents.
   */
  async retryReporting(opts?: { invoiceId?: number; creditNoteId?: number }): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    if (opts?.invoiceId) {
      return this.reportSingleInvoice(opts.invoiceId);
    }
    if (opts?.creditNoteId) {
      return this.reportSingleCreditNote(opts.creditNoteId);
    }
    return this.processQueue();
  }

  /**
   * Legacy wrapper: retry reporting for all pending documents or a specific invoice.
   * Kept for backward compatibility.
   */
  async retryInvoice(invoiceId?: number): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    return this.retryReporting({ invoiceId });
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private getEnv(): ZATCAEnvironment {
    return this.printersService.getSetting('zatca_environment', 'simulation') as ZATCAEnvironment;
  }

  private getOrgUnit(): string {
    return this.printersService.getSetting('zatca_org_unit', '');
  }

  private async processQueue(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    try {
      const env = this.getEnv();
      const orgUnit = this.getOrgUnit();

      // Bail early if the org unit is empty or would slugify to empty
      // (e.g. whitespace-only or Arabic-only). Prevents zatcaKey from
      // throwing and crashing the background worker.
      if (!slugifyOrgUnit(orgUnit)) {
        this.logger.debug('Reporting skipped: ZATCA org unit not configured');
        return { processed: 0, succeeded: 0, failed: 0 };
      }

      // Only run if onboarding is at compliance or production stage
      const state = this.printersService.getSetting(
        zatcaKey(env, orgUnit, 'onboarding_state'),
        'not_started',
      );
      if (state !== 'compliance' && state !== 'production') {
        this.logger.debug('Reporting skipped: onboarding not complete');
        return { processed: 0, succeeded: 0, failed: 0 };
      }

      // Collect pending documents from both tables, ordered by ICV ascending.
      const pendingDocs: ReportableDocument[] = [];

      // Pending invoices — fetch all, no limit
      const pendingInvoices = this.db
        .select()
        .from(zatcaInvoices)
        .where(or(eq(zatcaInvoices.status, 'signed'), eq(zatcaInvoices.status, 'failed')))
        .orderBy(asc(zatcaInvoices.icv))
        .all();

      for (const inv of pendingInvoices) {
        pendingDocs.push({
          id: inv.id,
          icv: inv.icv,
          uuid: inv.uuid,
          invoiceHash: inv.invoiceHash,
          xml: inv.xml,
          kind: 'invoice',
        });
      }

      // Pending credit notes — fetch all, no limit
      const pendingCreditNotes = this.db
        .select()
        .from(zatcaCreditNotes)
        .where(or(eq(zatcaCreditNotes.status, 'signed'), eq(zatcaCreditNotes.status, 'failed')))
        .orderBy(asc(zatcaCreditNotes.icv))
        .all();

      for (const cn of pendingCreditNotes) {
        pendingDocs.push({
          id: cn.id,
          icv: cn.icv,
          uuid: cn.uuid,
          invoiceHash: cn.invoiceHash,
          xml: cn.xml,
          kind: 'credit_note',
        });
      }

      // Merge and sort by ICV ascending for deterministic reporting order
      pendingDocs.sort((a, b) => a.icv - b.icv);

      let succeeded = 0;
      let failed = 0;

      for (const doc of pendingDocs) {
        try {
          const result = await this.reportDocument(doc);
          if (result) {
            succeeded++;
          } else {
            failed++;
          }
        } catch (err: any) {
          this.logger.error(`Failed to report ${doc.kind} ICV=${doc.icv}: ${err.message}`);
          failed++;
        }
      }

      return { processed: pendingDocs.length, succeeded, failed };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Reporting queue failed: ${message}`, stack);
      return { processed: 0, succeeded: 0, failed: 0 };
    }
  }

  private async reportSingleInvoice(invoiceId: number): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const inv = this.db.select().from(zatcaInvoices).where(eq(zatcaInvoices.id, invoiceId)).get();

    if (!inv) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const doc: ReportableDocument = {
      id: inv.id,
      icv: inv.icv,
      uuid: inv.uuid,
      invoiceHash: inv.invoiceHash,
      xml: inv.xml,
      kind: 'invoice',
    };

    try {
      const success = await this.reportDocument(doc);
      return { processed: 1, succeeded: success ? 1 : 0, failed: success ? 0 : 1 };
    } catch (err: any) {
      this.logger.error(`Retry invoice ${invoiceId} failed: ${err.message}`);
      return { processed: 1, succeeded: 0, failed: 1 };
    }
  }

  private async reportSingleCreditNote(creditNoteId: number): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const cn = this.db
      .select()
      .from(zatcaCreditNotes)
      .where(eq(zatcaCreditNotes.id, creditNoteId))
      .get();

    if (!cn) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const doc: ReportableDocument = {
      id: cn.id,
      icv: cn.icv,
      uuid: cn.uuid,
      invoiceHash: cn.invoiceHash,
      xml: cn.xml,
      kind: 'credit_note',
    };

    try {
      const success = await this.reportDocument(doc);
      return { processed: 1, succeeded: success ? 1 : 0, failed: success ? 0 : 1 };
    } catch (err: any) {
      this.logger.error(`Retry credit note ${creditNoteId} failed: ${err.message}`);
      return { processed: 1, succeeded: 0, failed: 1 };
    }
  }

  /**
   * Report a single document (invoice or credit note) to the ZATCA reporting API.
   * Returns true on success, false on rejection.
   */
  private async reportDocument(doc: ReportableDocument): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);

    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/invoices/reporting/single`;

    // Get credentials
    const env = this.getEnv();
    const orgUnit = this.getOrgUnit();
    const productionSecret = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'production_secret'),
      '',
    );
    const productionCert = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'production_cert'),
      '',
    );
    const complianceSecret = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_secret'),
      '',
    );
    const complianceCert = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_cert'),
      '',
    );

    // Use production credentials if available, otherwise compliance
    const cert = productionCert || complianceCert;
    const secret = productionSecret || complianceSecret;

    if (!cert || !secret) {
      this.logger.warn('No ZATCA credentials available for reporting');
      this.updateStatus(doc.kind, doc.id, 'failed', null);
      return false;
    }

    const body = JSON.stringify({
      invoiceHash: doc.invoiceHash,
      uuid: doc.uuid,
      invoice: Buffer.from(doc.xml).toString('base64'),
    });

    const response = await this.httpClient.post(url, {
      body,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Version': 'V2',
        'Clearance-Status': '0',
        'Accept-Language': 'en',
      },
      auth: {
        username: cert,
        password: secret,
      },
      timeoutMs: 30000,
    });

    if (response.status === 200 || response.status === 202) {
      // Success — mark as reported in the correct table
      this.updateStatus(doc.kind, doc.id, 'reported', now);
      this.logger.log(
        `${doc.kind === 'credit_note' ? 'Credit note' : 'Invoice'} ICV=${doc.icv} reported successfully`,
      );
      return true;
    } else {
      // Mark as failed
      this.updateStatus(doc.kind, doc.id, 'failed', null);
      this.logger.warn(
        `${doc.kind === 'credit_note' ? 'Credit note' : 'Invoice'} ICV=${doc.icv} reporting failed (${response.status}): ${response.body.slice(0, 200)}`,
      );
      return false;
    }
  }

  /**
   * Update the status of a document (invoice or credit note) in the DB.
   */
  private updateStatus(
    kind: DocumentKind,
    id: number,
    status: string,
    reportedAt: number | null,
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const setData: Record<string, any> = {
      status,
      updatedAt: now,
    };
    if (reportedAt !== null) {
      setData.reportedAt = reportedAt;
    }

    if (kind === 'invoice') {
      this.db
        .update(zatcaInvoices)
        .set(setData as any)
        .where(eq(zatcaInvoices.id, id))
        .run();
    } else {
      this.db
        .update(zatcaCreditNotes)
        .set(setData as any)
        .where(eq(zatcaCreditNotes.id, id))
        .run();
    }
  }

  private getApiBaseUrl(): string {
    return this.printersService.getSetting(
      'zatca_api_base_url',
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    );
  }
}
