/**
 * ZATCA Clearance Service — synchronous, blocking HTTP client that POSTs
 * a signed standard invoice (or credit/debit note) to ZATCA's clearance
 * endpoint and returns a structured result.
 *
 * Unlike the reporting service, this service does NOT poll, does NOT enqueue,
 * and does NOT update any database status. It is a pure API client + result
 * parser. Callers (e.g. the standard invoice service) receive a structured
 * {@link ZatcaClearanceResult} they can act on.
 *
 * **Error handling contract**: this service never throws to the caller for
 * ZATCA API failures or network errors. All outcomes are encoded in the
 * returned result. The only exception is a missing org-unit setting which
 * is a programmer error and will throw.
 *
 * **Classification rules** are centralized in `zatca-clearance-classify.ts`.
 * See {@link categorizeClearanceResponse} for the authoritative rules.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ZatcaHttpService } from './zatca-http.service';
import { PrintersService } from '../printers/printers.service';
import { zatcaKey } from '@spicyhome/shared';
import type { ZATCAEnvironment } from '@spicyhome/shared';
import {
  categorizeClearanceResponse,
  categoryToClearanceStatus,
  UnhandledClearanceResponseError,
} from './zatca-clearance-classify';

// ── Public types ───────────────────────────────────────────────────────────────

export type ZatcaClearanceStatus = 'CLEARED' | 'REJECTED' | 'ERROR' | 'NO_CREDENTIALS';

export interface ZatcaClearanceResult {
  status: ZatcaClearanceStatus;
  /** HTTP status code from ZATCA (0 if no request sent) */
  httpStatus: number;
  /** Cleared invoice XML (decoded from response) when CLEARED; null otherwise */
  clearedXml: string | null;
  /** Raw clearedInvoice field from response if present (base64) — optional debug */
  clearedInvoiceBase64: string | null;
  warnings: string[];
  errors: string[];
  /** Raw response body as a string (truncated in logs; full string OK in tests) */
  rawBody: string | null;
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class ZatcaClearanceService {
  private readonly logger = new Logger(ZatcaClearanceService.name);

  constructor(
    private httpClient: ZatcaHttpService,
    private printersService: PrintersService,
  ) {}

  /**
   * POST a signed document to the ZATCA clearance endpoint and return a
   * structured result.
   *
   * **Never throws** for ZATCA API or network failures — all outcomes are
   * encoded in the returned {@link ZatcaClearanceResult}.
   *
   * @param input.invoiceHash - Base64 hash of the signed XML (invoice hash).
   * @param input.uuid - Unique identifier for the document (ZATCA UUID).
   * @param input.xml - Raw signed XML string (the service base64-encodes it).
   */
  async clearDocument(input: {
    invoiceHash: string;
    uuid: string;
    xml: string;
  }): Promise<ZatcaClearanceResult> {
    const env = this.getEnv();
    const orgUnit = this.getOrgUnit();

    // Resolve credentials — prefer production, fall back to compliance
    const productionCert = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'production_cert'),
      '',
    );
    const productionSecret = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'production_secret'),
      '',
    );
    const complianceCert = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_cert'),
      '',
    );
    const complianceSecret = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_secret'),
      '',
    );

    const cert = productionCert || complianceCert;
    const secret = productionSecret || complianceSecret;

    if (!cert || !secret) {
      this.logger.warn(`Clearance skipped for uuid=${input.uuid}: no credentials available`);
      return {
        status: 'NO_CREDENTIALS',
        httpStatus: 0,
        clearedXml: null,
        clearedInvoiceBase64: null,
        warnings: [],
        errors: [],
        rawBody: null,
      };
    }

    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/invoices/clearance/single`;

    const body = JSON.stringify({
      invoiceHash: input.invoiceHash,
      uuid: input.uuid,
      invoice: Buffer.from(input.xml).toString('base64'),
    });

    let response;
    try {
      response = await this.httpClient.post(url, {
        body,
        headers: {
          'Content-Type': 'application/json',
          'Accept-Version': 'V2',
          'Clearance-Status': '1',
          'Accept-Language': 'en',
        },
        auth: {
          username: cert,
          password: secret,
        },
        timeoutMs: 30000,
      });
    } catch (err: any) {
      this.logger.error(`Clearance network error for uuid=${input.uuid}: ${err.message}`);
      return {
        status: 'ERROR',
        httpStatus: 0,
        clearedXml: null,
        clearedInvoiceBase64: null,
        warnings: [],
        errors: [err.message],
        rawBody: null,
      };
    }

    const httpStatus = response.status;
    const rawBody = response.body;

    this.logger.log(
      `Clearance response for uuid=${input.uuid}: HTTP ${httpStatus} body=${rawBody.slice(0, 200)}`,
    );

    return this.parseResponse(httpStatus, rawBody, input.uuid);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private getEnv(): ZATCAEnvironment {
    return this.printersService.getSetting('zatca_environment', 'simulation') as ZATCAEnvironment;
  }

  private getOrgUnit(): string {
    return this.printersService.getSetting('zatca_org_unit', '');
  }

  private getApiBaseUrl(): string {
    return this.printersService.getSetting(
      'zatca_api_base_url',
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    );
  }

  /**
   * Parse the clearance HTTP response body into a structured result.
   *
   * Uses {@link categorizeClearanceResponse} for classification and handles
   * the {@link UnhandledClearanceResponseError} case by mapping it to ERROR
   * (retryable — never treat ambiguous 2xx as CLEARED).
   */
  private parseResponse(httpStatus: number, rawBody: string, uuid: string): ZatcaClearanceResult {
    try {
      const classified = categorizeClearanceResponse(httpStatus, rawBody);

      return {
        status: categoryToClearanceStatus(classified.category),
        httpStatus,
        clearedXml: classified.clearedXml,
        clearedInvoiceBase64: classified.clearedInvoiceBase64,
        warnings: classified.warnings,
        errors: classified.errors,
        rawBody,
      };
    } catch (err) {
      if (err instanceof UnhandledClearanceResponseError) {
        // Ambiguous 2xx — do NOT treat as CLEARED. Map to ERROR so it can be retried.
        this.logger.warn(`Clearance for uuid=${uuid}: ${err.message}`);
        return {
          status: 'ERROR',
          httpStatus,
          clearedXml: null,
          clearedInvoiceBase64: null,
          warnings: [],
          errors: [err.message],
          rawBody,
        };
      }
      throw err;
    }
  }
}
